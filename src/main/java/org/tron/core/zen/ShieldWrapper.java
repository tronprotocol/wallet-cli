package org.tron.core.zen;

import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Getter;
import lombok.Setter;
import org.tron.api.GrpcAPI.DecryptNotes;
import org.tron.api.GrpcAPI.DecryptNotes.NoteTx;
import org.tron.api.GrpcAPI.IvkDecryptParameters;
import org.tron.common.utils.ByteArray;
import org.tron.core.zen.address.DiversifierT;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletApi;

//封装所有跟匿名交易相关的内容
public class ShieldWrapper {

  @Getter
  @Setter
  private WalletApi wallet;

  private final String ivkFileName = "ivk.txt";
  private final String unspendNoteFileName = "unspendNotes.txt";
  private final String spendNoteFileName = "spendNotes.txt";

  @Getter
  public ShieldAddressList shieldAddressList = new ShieldAddressList();

  //ivk  blockNum  什么时候更新文件
  @Getter
  @Setter
  public Map<String, Long> ivkMapScanBlockNum = new ConcurrentHashMap();

  //临街资源，需要保护
  @Getter
  @Setter
  public Map<Integer, ShieldNoteInfo>  utxoMapNote = new ConcurrentHashMap();

  @Getter
  @Setter
  public List<ShieldNoteInfo> spendUtxoList = new ArrayList<>();


  public class scanIvkRunable implements Runnable {
    public void run(){
      // synchronized (ivkMapScanBlockNum)
      for (;;) {
        try {
          scanBlockByIvk();
          Thread.sleep(5000);
        } catch (Exception e) {
          e.printStackTrace();
        }
      }
    }
  }

  private void scanBlockByIvk() {
    Block block = wallet.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {

        long start = entry.getValue();
        long end = 0;
        while (entry.getValue() < blockNum) {
          if ((blockNum - start) > 1000) {
            end = start + 1000;
          } else {
            end = blockNum;
          }

          IvkDecryptParameters.Builder builder = IvkDecryptParameters.newBuilder();
          builder.setStartBlockIndex(start);
          builder.setEndBlockIndex(end);
          builder.setIvk(ByteString.copyFrom(ByteArray.fromHexString(entry.getKey())));
          DecryptNotes notes = wallet.scanNoteByIvk(builder.build());
          if (notes != null) {
            notes.getNoteTxsList();
            for (int i = 0; i < notes.getNoteTxsList().size(); ++i) {
              NoteTx noteTx = notes.getNoteTxsList().get(i);

              ShieldNoteInfo noteInfo = new ShieldNoteInfo();
              noteInfo.setD(new DiversifierT(noteTx.getNote().getD().toByteArray()));
              noteInfo.setPkD(noteTx.getNote().getPkD().toByteArray());
              noteInfo.setR(noteTx.getNote().getPkD().toByteArray());
              noteInfo.setValue(noteTx.getNote().getValue());
              noteInfo.setTrxId(ByteArray.toHexString(noteTx.getTxid().toByteArray()));
              noteInfo.setIndex(noteTx.getIndex());
              noteInfo.setSpend(false);

              //更新本地缓存的数据
              utxoMapNote.put(utxoMapNote.size(), noteInfo);
            }
            //保存为文件
            saveUnspendNoteToFile();  //TODO 看是否可以优化
          }
          start = end;
        }

        //更新扫描的最新块
        ivkMapScanBlockNum.put(entry.getKey(), blockNum);
      }
      //更新文件
      updateIvkAndBlockNumFile();
    }
  }

  public boolean Init() {
    shieldAddressList.init();
    loadIvkFromFile();
    loadUnSpendNoteFromFile();
    loadSpendNoteFromFile();

    //启动扫描线程
    Thread thread = new Thread(new scanIvkRunable());
    thread.start();

    return true;
  }

  public boolean spendNote(int noteIndex ) {
    ShieldNoteInfo noteInfo = utxoMapNote.get(noteIndex);
    if (noteInfo != null) {
      utxoMapNote.remove(noteIndex);
      spendUtxoList.add(noteInfo);

      //保存文件，将未花费的UTXO 转移到 花费的 UTXO 中
      saveUnspendNoteToFile();
      savespendNoteToFile(noteInfo);
    } else {
      System.out.println("Find note failure. index:" + noteIndex);
    }
    return true;
  }

  public boolean addNewShieldAddress(final ShieldAddressInfo addressInfo) {
    Block block = wallet.getBlock(-1);
    if (block == null) {
      System.err.println("Get now block failure");
      return false;
    }
    shieldAddressList.appendAddressInfoToFile(addressInfo);

    long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
    ivkMapScanBlockNum.put( ByteArray.toHexString(addressInfo.getIvk()), blockNum );
    updateIvkAndBlockNum(ByteArray.toHexString(addressInfo.getIvk()), blockNum);

    return true;
  }

  /******** about file **********/

  /**
   * 更新ivk扫描的块的高度
   * @param ivk
   * @param blockNum
   * @return
   */
  private boolean updateIvkAndBlockNum(final String ivk, long blockNum ) {
    String date = ivk + ";" + blockNum;
    ZenUtils.appendToFileTail(ivkFileName, date);
    return true;
  }

  private boolean updateIvkAndBlockNumFile() {
    ZenUtils.clearFile(ivkFileName);

    for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {
      String date = entry.getKey() + ";" + entry.getValue();
      ZenUtils.appendToFileTail(ivkFileName, date);
    }

    return true;
  }

  /**
   * 从文件中加载ivk跟扫描块高度的对应关系
   * @return
   */
  private boolean loadIvkFromFile() {
    ivkMapScanBlockNum.clear();

    List<String> list = ZenUtils.getListFromFile(ivkFileName);
    for (int i=0; i<list.size(); ++i) {
      String[] sourceStrArray = list.get(i).split(";");
      if (sourceStrArray.length != 2) {
        System.err.println("len is not right.");
        return false;
      }
      ivkMapScanBlockNum.put(sourceStrArray[0], Long.valueOf(sourceStrArray[1]));
    }
    return true;
  }

  /**
   * 更新未花费Note文件，包括增加和删除（被花费的情况下）
   * @return
   */
  private boolean saveUnspendNoteToFile() {
    ZenUtils.clearFile(unspendNoteFileName);

    for (Entry<Integer, ShieldNoteInfo> entry : utxoMapNote.entrySet()) {
      String date = entry.getValue().encode();
      ZenUtils.appendToFileTail(unspendNoteFileName, date);
    }

    return true;
  }

  /**
   * 从文件中加载未花费的Note
   * @return
   */
  private boolean loadUnSpendNoteFromFile() {
    utxoMapNote.clear();

    List<String> list = ZenUtils.getListFromFile(unspendNoteFileName);
    for (int i = 0; i < list.size(); ++i) {
      ShieldNoteInfo noteInfo = new ShieldNoteInfo();
      noteInfo.decode(list.get(i));
      utxoMapNote.put(i, noteInfo);
    }

    return true;
  }


  /**
   * 更新已花费Note文件，仅末尾添加
   * @return
   */
  private boolean savespendNoteToFile(ShieldNoteInfo noteInfo) {
    String date = noteInfo.encode();
    ZenUtils.appendToFileTail(spendNoteFileName, date);

    return true;
  }

  /**
   * 从文件中加载已花费的Note
   * @return
   */
  private boolean loadSpendNoteFromFile() {
    spendUtxoList.clear();

    List<String> list = ZenUtils.getListFromFile(spendNoteFileName);
    for (int i = 0; i < list.size(); ++i) {
      ShieldNoteInfo noteInfo = new ShieldNoteInfo();
      noteInfo.decode(list.get(i));
      spendUtxoList.add(noteInfo);
    }

    return true;
  }


}
