package org.tron.core.zen;

import com.google.protobuf.ByteString;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import lombok.Getter;
import lombok.Setter;
import org.tron.api.GrpcAPI.DecryptNotes;
import org.tron.api.GrpcAPI.DecryptNotes.NoteTx;
import org.tron.api.GrpcAPI.IvkDecryptParameters;
import org.tron.api.GrpcAPI.Note;
import org.tron.api.GrpcAPI.NoteParameters;
import org.tron.api.GrpcAPI.SpendResult;
import org.tron.common.utils.ByteArray;
import org.tron.core.zen.address.DiversifierT;
import org.tron.protos.Contract.IncrementalMerkleVoucherInfo;
import org.tron.protos.Contract.OutputPoint;
import org.tron.protos.Contract.OutputPointInfo;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletApi;

public class ShieldWrapper {

  private WalletApi wallet;

  private final String ivkFileName = "ivk.txt";
  private final String unspendNoteFileName = "unspendNotes.txt";
  private final String spendNoteFileName = "spendNotes.txt";
  private Thread thread ;
  @Getter
  @Setter
  private boolean resetNote = false;
  @Getter
  public ShieldAddressList shieldAddressList = new ShieldAddressList();
  @Getter
  @Setter
  public Map<String, Long> ivkMapScanBlockNum = new ConcurrentHashMap();
  @Getter
  @Setter
  public Map<Integer, ShieldNoteInfo>  utxoMapNote = new ConcurrentHashMap();
  @Getter
  @Setter
  public List<ShieldNoteInfo> spendUtxoList = new ArrayList<>();

  public void setWallet(WalletApi walletApi) {
    wallet = walletApi;
    thread.start();
  }

  public class scanIvkRunable implements Runnable {
    public void run(){
      for (;;) {
        try {
          scanBlockByIvk();
          updateWhetherSpend();
          //wait for 5 seconds
          for (int i=0; i<10; ++i) {
            Thread.sleep(500);
            if (resetNote) {
              resetShieldNote();
              resetNote = false;
              System.out.println("Reset shield note success!");
            }
          }
        } catch (Exception e) {
          e.printStackTrace();
        }
      }
    }
  }

  private void resetShieldNote() {
    Set<String>  shieldaddress = ivkMapScanBlockNum.keySet();
    for (String address : shieldaddress ) {
      ivkMapScanBlockNum.put(address, 0L);
    }

    utxoMapNote.clear();
    spendUtxoList.clear();

    ZenUtils.clearFile(ivkFileName);
    ZenUtils.clearFile(unspendNoteFileName);
    ZenUtils.clearFile(spendNoteFileName);
  }

  //扫描获取Note信息
  private void scanBlockByIvk() {
    Block block = wallet.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {

        long start = entry.getValue();
        long end = start;
        while (end < blockNum) {
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
            for (int i = 0; i < notes.getNoteTxsList().size(); ++i) {
              NoteTx noteTx = notes.getNoteTxsList().get(i);

              ShieldNoteInfo noteInfo = new ShieldNoteInfo();
              noteInfo.setD(new DiversifierT(noteTx.getNote().getD().toByteArray()));
              noteInfo.setPkD(noteTx.getNote().getPkD().toByteArray());
              noteInfo.setR(noteTx.getNote().getRcm().toByteArray());
              noteInfo.setValue(noteTx.getNote().getValue());
              noteInfo.setTrxId(ByteArray.toHexString(noteTx.getTxid().toByteArray()));
              noteInfo.setIndex(noteTx.getIndex());
              noteInfo.setSpend(false);

              utxoMapNote.put(utxoMapNote.size(), noteInfo);
            }
            saveUnspendNoteToFile();
          }
          start = end;
        }

        ivkMapScanBlockNum.put(entry.getKey(), blockNum);
      }
      updateIvkAndBlockNumFile();
    }
  }

  //获取Note是否被花掉
  private void updateWhetherSpend() {
    for (Entry<Integer, ShieldNoteInfo> entry : utxoMapNote.entrySet() ) {
      ShieldNoteInfo noteInfo = entry.getValue();

      OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
      OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
      outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
      outPointBuild.setIndex(noteInfo.getIndex());
      request.addOutPoints(outPointBuild.build());
      IncrementalMerkleVoucherInfo merkleVoucherInfo = wallet.GetMerkleTreeVoucherInfo(request.build());

      ShieldAddressInfo addressInfo =
          shieldAddressList.getShieldAddressInfoMap().get( noteInfo.getAddress() );
      NoteParameters.Builder builder = NoteParameters.newBuilder();
      builder.setAk(ByteString.copyFrom(addressInfo.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(addressInfo.getFullViewingKey().getNk()));

      Note.Builder noteBuild = Note.newBuilder();
      noteBuild.setD(ByteString.copyFrom(noteInfo.getD().getData()));
      noteBuild.setPkD(ByteString.copyFrom(noteInfo.getPkD()));
      noteBuild.setValue(noteInfo.getValue());
      noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
      builder.setNote(noteBuild.build());
      builder.setVoucher(merkleVoucherInfo.getVouchers(0));

      SpendResult result = wallet.isNoteSpend(builder.build());
      if ( result.getResult() ) {
        spendNote(entry.getKey());
      }
    }
  }

  public boolean Init() {
    shieldAddressList.init();
    loadIvkFromFile();
    loadUnSpendNoteFromFile();
    loadSpendNoteFromFile();

    thread = new Thread(new scanIvkRunable());
    return true;
  }

  public boolean spendNote(int noteIndex ) {
    ShieldNoteInfo noteInfo = utxoMapNote.get(noteIndex);
    if (noteInfo != null) {
      utxoMapNote.remove(noteIndex);
      spendUtxoList.add(noteInfo);

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
    synchronized (ivkFileName) {
      String date = ivk + ";" + blockNum;
      ZenUtils.appendToFileTail(ivkFileName, date);
    }
    return true;
  }

  private boolean updateIvkAndBlockNumFile() {
    synchronized (ivkFileName) {
      ZenUtils.clearFile(ivkFileName);

      for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {
        String date = entry.getKey() + ";" + entry.getValue();
        ZenUtils.appendToFileTail(ivkFileName, date);
      }
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
