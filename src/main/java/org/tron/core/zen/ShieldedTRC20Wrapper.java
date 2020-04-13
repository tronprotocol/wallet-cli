package org.tron.core.zen;

import com.google.protobuf.ByteString;
import io.netty.util.internal.StringUtil;
import java.lang.reflect.Field;
import lombok.Getter;
import lombok.Setter;
import org.apache.commons.lang3.ArrayUtils;
import org.tron.api.GrpcAPI.*;
import org.tron.api.GrpcAPI.DecryptNotes.NoteTx;
import org.tron.api.GrpcAPI.DecryptNotesTRC20;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CipherException;
import org.tron.core.exception.ZksnarkException;
import org.tron.keystore.SKeyCapsule;
import org.tron.keystore.SKeyEncryptor;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletUtils;
import org.tron.protos.Protocol.Block;
import org.tron.walletcli.Client;
import org.tron.walletserver.WalletApi;
import java.io.File;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

public class ShieldedTRC20Wrapper {

  private static String prefixFolder;// = "WalletShieldedTRC20Contract/";
  private static String trc20ContractAddress;
  private static String shieldedTRC20ContarctAddress;
  private static String ivkAndNumFileName;// = "/scanblocknumber";
  private static String unspendNoteFileName;// = "/unspendnote";
  private static String spendNoteFileName;// = "/spendnote";
  private static String shieldedAddressFileName;// = "/shieldedaddress";
  private static String shieldedSkeyFileName;// = "/shieldedskey.json";
  private static AtomicLong nodeIndex = new AtomicLong(0L);
  private Thread thread;

  private byte[] shieldedSkey;
  private static ShieldedTRC20Wrapper instance;

  @Setter
  @Getter
  Map<String, ShieldedAddressInfo> shieldedAddressInfoMap = new ConcurrentHashMap();
  @Setter
  private boolean resetNote = false;
  @Getter
  @Setter
  public Map<Ivk, Long> ivkMapScanBlockNum = new ConcurrentHashMap();
  @Getter
  @Setter
  public Map<Long, ShieldedTRC20NoteInfo> utxoMapNote = new ConcurrentHashMap();
  @Getter
  @Setter
  public List<ShieldedTRC20NoteInfo> spendUtxoList = new ArrayList<>();

  private boolean loadShieldedStatus = false;

  private ShieldedTRC20Wrapper() {
    thread = new Thread(new scanIvkRunable());
  }

  public static ShieldedTRC20Wrapper getInstance() {
    if (instance == null) {
      instance = new ShieldedTRC20Wrapper();
    }
    return instance;
  }

  public static boolean isSetShieldedTRC20WalletPath() {
    return !(prefixFolder == null || trc20ContractAddress == null
        || shieldedTRC20ContarctAddress == null || ivkAndNumFileName == null
        || unspendNoteFileName == null || spendNoteFileName == null
        || shieldedAddressFileName == null || shieldedSkeyFileName == null);
  }

  public static void setShieldedTRC20WalletPath(String contractAddress,
                                                String shieldedContractAddress) {
    trc20ContractAddress = contractAddress;
    shieldedTRC20ContarctAddress = shieldedContractAddress;
    prefixFolder = "WalletShieldedTRC20Contract/"
        + trc20ContractAddress + "_" + shieldedTRC20ContarctAddress;
    ivkAndNumFileName = prefixFolder + "/scanblocknumber";
    unspendNoteFileName = prefixFolder + "/unspendnote";
    spendNoteFileName = prefixFolder + "/spendnote";
    shieldedAddressFileName = prefixFolder + "/shieldedaddress";
    shieldedSkeyFileName = prefixFolder + "/shieldedskey.json";
  }

  public String getShieldedTRC20ContractAddress() {
    return shieldedTRC20ContarctAddress;
  }

  public String getTRC20ContractAddress() {
    return trc20ContractAddress;
  }

  public boolean ifShieldedTRC20WalletLoaded() {
    return loadShieldedStatus;
  }

  private void loadWalletFile() throws CipherException {
    loadAddressFromFile();
    loadIvkFromFile();
    loadUnSpendNoteFromFile();
    loadSpendNoteFromFile();
  }

  public boolean loadShieldTRC20Wallet() throws CipherException, IOException {
    if (ifShieldedTRC20WalletLoaded()) {
      return true;
    }

    if (!shieldedSkeyFileExist()) {
      System.out.println("shieldedTRC20 wallet does not exist.");
      return false;
    }

    if (ArrayUtils.isEmpty(shieldedSkey)) {
      shieldedSkey = loadSkey();
    }

    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    loadWalletFile();

    if (!thread.isAlive()) {
      thread.start();
    }
    loadShieldedStatus = true;

    return true;
  }

  public class scanIvkRunable implements Runnable {
    public void run() {
      int count = 24;
      for (; ; ) {
        try {
          scanBlockByIvk();
          updateNoteWhetherSpend();
        } catch (Exception e) {
          ++count;
          if (count >= 24) {
            if (e.getMessage() != null) {
              System.out.println(e.getMessage());
            }
            System.out.println("Please user command resetShieldedTRC20Note to reset notes!!");
            count = 0;
          }
        } finally {
          try {
            //wait for 2.5 seconds
            for (int i = 0; i < 5; ++i) {
              Thread.sleep(500);
              if (resetNote) {
                resetShieldedTRC20Note();
                resetNote = false;
                count = 0;
                System.out.println("Reset shieldedTRC20 note success!");
              }
            }
          } catch (Exception e) {
          }
        }
      }
    }
  }

  private void resetShieldedTRC20Note() throws ZksnarkException {
    ivkMapScanBlockNum.clear();
    for (Entry<String, ShieldedAddressInfo> entry : getShieldedAddressInfoMap().entrySet()) {
      Ivk ivk = new Ivk();
      ivk.setIvk(entry.getValue().getIvk());
      ivk.setAk(entry.getValue().getFullViewingKey().getAk());
      ivk.setNk(entry.getValue().getFullViewingKey().getNk());
      ivkMapScanBlockNum.put(ivk, 0L);
    }

    utxoMapNote.clear();
    spendUtxoList.clear();

    ZenUtils.clearFile(ivkAndNumFileName);
    ZenUtils.clearFile(unspendNoteFileName);
    ZenUtils.clearFile(spendNoteFileName);
    nodeIndex.set(0L);

    updateIvkAndBlockNumFile();
  }

  private void scanBlockByIvk() throws CipherException {
    Block block = WalletApi.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      for (Entry<Ivk, Long> entry : ivkMapScanBlockNum.entrySet()) {
        long start = entry.getValue();
        long end = start;
        while (end < blockNum) {
          if (blockNum - start > 1000) {
            end = start + 1000;
          } else {
            end = blockNum;
          }

          IvkDecryptTRC20Parameters.Builder builder = IvkDecryptTRC20Parameters.newBuilder();
          builder.setStartBlockIndex(start);
          builder.setEndBlockIndex(end);
          builder.setShieldedTRC20ContractAddress(
              ByteString.copyFrom(
                  WalletApi.decodeFromBase58Check(
                      getShieldedTRC20ContractAddress())));
          builder.setIvk(ByteString.copyFrom(entry.getKey().getIvk()));
          builder.setAk(ByteString.copyFrom(entry.getKey().getAk()));
          builder.setNk(ByteString.copyFrom(entry.getKey().getNk()));
          Optional<DecryptNotesTRC20> notes = WalletApi.scanShieldedTRC20NoteByIvk(
              builder.build(), false);
          if (notes.isPresent()) {
            int startNum = utxoMapNote.size();
            for (int i = 0; i < notes.get().getNoteTxsList().size(); ++i) {
              DecryptNotesTRC20.NoteTx noteTx = notes.get().getNoteTxsList().get(i);
              ShieldedTRC20NoteInfo noteInfo = new ShieldedTRC20NoteInfo();
              noteInfo.setPaymentAddress(noteTx.getNote().getPaymentAddress());
              noteInfo.setR(noteTx.getNote().getRcm().toByteArray());
              noteInfo.setValue(noteTx.getNote().getValue());
              noteInfo.setTrxId(ByteArray.toHexString(noteTx.getTxid().toByteArray()));
              noteInfo.setIndex(noteTx.getIndex());
              noteInfo.setNoteIndex(nodeIndex.getAndIncrement());
              noteInfo.setPosition(noteTx.getPosition());
              noteInfo.setMemo(noteTx.getNote().getMemo().toByteArray());
              boolean isSpent = noteTx.getIsSpent();
              if (!isSpent) {
                utxoMapNote.put(noteInfo.getNoteIndex(), noteInfo);
              } else {
                spendUtxoList.add(noteInfo);
                saveSpendNoteToFile(noteInfo);
              }
            }
            int endNum = utxoMapNote.size();
            if (endNum > startNum) {
              saveUnspendNoteToFile();
            }
          }
          start = end;
        }
        ivkMapScanBlockNum.put(entry.getKey(), blockNum);
      }
      updateIvkAndBlockNumFile();
    }
  }

  private void updateNoteWhetherSpend() throws Exception {
    for (Entry<Long, ShieldedTRC20NoteInfo> entry : utxoMapNote.entrySet()) {
      ShieldedTRC20NoteInfo noteInfo = entry.getValue();

      ShieldedAddressInfo addressInfo =
          getShieldedAddressInfoMap().get(noteInfo.getPaymentAddress());
      NfTRC20Parameters.Builder builder = NfTRC20Parameters.newBuilder();
      builder.setAk(ByteString.copyFrom(addressInfo.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(addressInfo.getFullViewingKey().getNk()));
      builder.setPosition(noteInfo.getPosition());
      builder.setShieldedTRC20ContractAddress(
          ByteString.copyFrom(
              WalletApi.decodeFromBase58Check(
                  getShieldedTRC20ContractAddress())));

      Note.Builder noteBuild = Note.newBuilder();
      noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
      noteBuild.setValue(noteInfo.getValue());
      noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
      noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));
      builder.setNote(noteBuild.build());

      Optional<NullifierResult> result = WalletApi.IsShieldedTRC20ContractNoteSpent(
          builder.build(), false);
      if (result.isPresent() && result.get().getIsSpent()) {
        spendNote(entry.getKey());
      }
    }
  }

  /**
   * set some index note is spend
   *
   * @param noteIndex
   * @return
   */
  public boolean spendNote(long noteIndex) throws CipherException {
    ShieldedTRC20NoteInfo noteInfo = utxoMapNote.get(noteIndex);
    if (noteInfo != null) {
      utxoMapNote.remove(noteIndex);
      spendUtxoList.add(noteInfo);

      saveUnspendNoteToFile();
      saveSpendNoteToFile(noteInfo);
    } else {
      System.err.println("Find note failure. index:" + noteIndex);
    }
    return true;
  }

  /**
   * save new shieldedTRC20 address and scan block num
   *
   * @param addressInfo new shieldedTRC20 address
   * @return
   */
  public boolean addNewShieldedTRC20Address(final ShieldedAddressInfo addressInfo,
                                            boolean newAddress)
      throws CipherException, ZksnarkException {
    appendAddressInfoToFile(addressInfo);
    long blockNum = 0;
    if (newAddress) {
      try {
        Block block = WalletApi.getBlock(-1);
        if (block != null) {
          blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
        }
      } catch (Exception e) {
        e.printStackTrace();
      }
    }
    Ivk ivk = new Ivk();
    ivk.setIvk(addressInfo.getIvk());
    ivk.setAk(addressInfo.getFullViewingKey().getAk());
    ivk.setNk(addressInfo.getFullViewingKey().getNk());
    if (!ivkMapScanBlockNum.containsKey(ivk)) {
      ivkMapScanBlockNum.put(ivk, blockNum);
      updateIvkAndBlockNum(ivk, blockNum);
    }
    return true;
  }

  /**
   * append ivk and block num relationship to file tail
   *
   * @param ivk
   * @param blockNum
   * @return
   */
  private boolean updateIvkAndBlockNum(Ivk ivk, long blockNum) {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    synchronized (ivkAndNumFileName) {
      byte[] key = ByteUtil.merge(ivk.getIvk(), ivk.getAk(), ivk.getNk());
      byte[] value = ByteArray.fromLong(blockNum);
      byte[] text = new byte[key.length + value.length];
      System.arraycopy(key, 0, text, 0, key.length);
      System.arraycopy(value, 0, text, key.length, value.length);
      try {
        byte[] cipherText = ZenUtils.aesCtrEncrypt(text, shieldedSkey);
        String data = Base58.encode(cipherText);
        ZenUtils.appendToFileTail(ivkAndNumFileName, data);
      } catch (CipherException e) {
        e.printStackTrace();
      }
    }
    return true;
  }

  /**
   * update ivk and block num
   *
   * @return
   */
  private boolean updateIvkAndBlockNumFile() {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    synchronized (ivkAndNumFileName) {
      ZenUtils.clearFile(ivkAndNumFileName);
      for (Entry<Ivk, Long> entry : ivkMapScanBlockNum.entrySet()) {
        byte[] key = ByteUtil.merge(entry.getKey().getIvk(), entry.getKey().getAk(),
            entry.getKey().getNk());
        byte[] value = ByteArray.fromLong(entry.getValue());
        byte[] text = new byte[key.length + value.length];
        System.arraycopy(key, 0, text, 0, key.length);
        System.arraycopy(value, 0, text, key.length, value.length);
        try {
          byte[] cipherText = ZenUtils.aesCtrEncrypt(text, shieldedSkey);
          String date = Base58.encode(cipherText);
          ZenUtils.appendToFileTail(ivkAndNumFileName, date);
        } catch (CipherException e) {
          e.printStackTrace();
        }
      }
    }
    return true;
  }

  /**
   * load ivk and block num relationship from file
   *
   * @return
   */
  private boolean loadIvkFromFile() {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    ivkMapScanBlockNum.clear();
    if (ZenUtils.checkFileExist(ivkAndNumFileName)) {
      List<String> list = ZenUtils.getListFromFile(ivkAndNumFileName);
      for (int i = 0; i < list.size(); ++i) {
        byte[] cipherText = Base58.decode(list.get(i));
        try {
          byte[] text = ZenUtils.aesCtrDecrypt(cipherText, shieldedSkey);
          Ivk ivk = new Ivk();
          ivk.setIvk(Arrays.copyOfRange(text, 0, 32));
          ivk.setAk(Arrays.copyOfRange(text, 32, 64));
          ivk.setNk(Arrays.copyOfRange(text, 64, 96));
          byte[] value = Arrays.copyOfRange(text, 96, text.length);

          ivkMapScanBlockNum.put(ivk, ByteArray.toLong(value));
        } catch (CipherException e) {
          e.printStackTrace();
        }
      }
    }
    return true;
  }

  /**
   * get shielded address list
   *
   * @return
   */
  public List<String> getShieldedTRC20AddressList() {
    List<String> addressList = new ArrayList<>();
    for (Entry<String, ShieldedAddressInfo> entry : shieldedAddressInfoMap.entrySet()) {
      addressList.add(entry.getKey());
    }
    return addressList;
  }

  /**
   * sort by value of UTXO
   *
   * @return
   */
  public List<String> getvalidateSortUtxoList() {
    List<Map.Entry<Long, ShieldedTRC20NoteInfo>> list = new ArrayList<>(utxoMapNote.entrySet());
    Collections.sort(list, (Entry<Long, ShieldedTRC20NoteInfo> o1,
                            Entry<Long, ShieldedTRC20NoteInfo> o2) -> {
      if (o1.getValue().getValue() < o2.getValue().getValue()) {
        return 1;
      } else {
        return -1;
      }
    });

    List<String> utxoList = new ArrayList<>();
    for (Map.Entry<Long, ShieldedTRC20NoteInfo> entry : list) {
      String string = entry.getKey() + " " + entry.getValue().getPaymentAddress() + " ";
      string += entry.getValue().getValue();
      string += " ";
      string += entry.getValue().getTrxId();
      string += " ";
      string += entry.getValue().getIndex();
      string += " ";
      string += "UnSpend";
      string += " ";
      string += ZenUtils.getMemo(entry.getValue().getMemo());
      utxoList.add(string);
    }
    return utxoList;
  }

  /**
   * update unspend note
   *
   * @return
   */
  private boolean saveUnspendNoteToFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    ZenUtils.clearFile(unspendNoteFileName);
    for (Entry<Long, ShieldedTRC20NoteInfo> entry : utxoMapNote.entrySet()) {
      String date = entry.getValue().encode(shieldedSkey);
      ZenUtils.appendToFileTail(unspendNoteFileName, date);
    }
    return true;
  }

  /**
   * load unspend note from file
   *
   * @return
   */
  private boolean loadUnSpendNoteFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }
    utxoMapNote.clear();

    if (ZenUtils.checkFileExist(unspendNoteFileName)) {
      List<String> list = ZenUtils.getListFromFile(unspendNoteFileName);
      for (int i = 0; i < list.size(); ++i) {
        ShieldedTRC20NoteInfo noteInfo = new ShieldedTRC20NoteInfo();
        noteInfo.decode(list.get(i), shieldedSkey);
        utxoMapNote.put(noteInfo.getNoteIndex(), noteInfo);

        if (noteInfo.getNoteIndex() >= nodeIndex.get()) {
          nodeIndex.set(noteInfo.getNoteIndex() + 1);
        }
      }
    }
    return true;
  }


  /**
   * append spend note to file tail
   *
   * @return
   */
  private boolean saveSpendNoteToFile(ShieldedTRC20NoteInfo noteInfo) throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    String data = noteInfo.encode(shieldedSkey);
    ZenUtils.appendToFileTail(spendNoteFileName, data);
    return true;
  }

  /**
   * load spend note from file
   *
   * @return
   */
  private boolean loadSpendNoteFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    spendUtxoList.clear();
    if (ZenUtils.checkFileExist(spendNoteFileName)) {
      List<String> list = ZenUtils.getListFromFile(spendNoteFileName);
      for (int i = 0; i < list.size(); ++i) {
        ShieldedTRC20NoteInfo noteInfo = new ShieldedTRC20NoteInfo();
        noteInfo.decode(list.get(i), shieldedSkey);
        spendUtxoList.add(noteInfo);

        if (noteInfo.getNoteIndex() >= nodeIndex.get()) {
          nodeIndex.set(noteInfo.getNoteIndex() + 1);
        }
      }
    }
    return true;
  }

  /**
   * load shielded address from file
   *
   * @return
   */
  private boolean loadAddressFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    shieldedAddressInfoMap.clear();
    if (ZenUtils.checkFileExist(shieldedAddressFileName)) {
      List<String> addressList = ZenUtils.getListFromFile(shieldedAddressFileName);
      for (String addressString : addressList) {
        ShieldedAddressInfo addressInfo = new ShieldedAddressInfo();
        if (addressInfo.decode(addressString, shieldedSkey)) {
          shieldedAddressInfoMap.put(addressInfo.getAddress(), addressInfo);
        } else {
          System.out.println("*******************");
        }
      }
    }
    return true;
  }

  /**
   * put new shielded address to address list
   *
   * @param addressInfo
   * @return
   */
  private boolean appendAddressInfoToFile(final ShieldedAddressInfo addressInfo)
      throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    String shieldedAddress = addressInfo.getAddress();
    if (!StringUtil.isNullOrEmpty(shieldedAddress) &&
        !shieldedAddressInfoMap.containsKey(shieldedAddress)) {
      String addressString = addressInfo.encode(shieldedSkey);
      ZenUtils.appendToFileTail(shieldedAddressFileName, addressString);

      shieldedAddressInfoMap.put(shieldedAddress, addressInfo);
    }
    return true;
  }

  private boolean shieldedSkeyFileExist() {
    File file = new File(shieldedSkeyFileName);
    return file != null && file.exists();
  }

  private byte[] loadSkey() throws IOException, CipherException {
    File file = new File(shieldedSkeyFileName);
    SKeyCapsule skey = WalletUtils.loadSkeyFile(file);

    byte[] passwd = null;
    System.out.println("Please input your password for shieldedTRC20 wallet.");
    for (int i = 6; i > 0; i--) {
      char[] password = Utils.inputPassword(false);
      passwd = StringUtils.char2Byte(password);
      try {
        SKeyEncryptor.validPassword(passwd, skey);
        break;
      } catch (CipherException e) {
        passwd = null;
        System.out.println(e.getMessage());
        System.out.printf("Left times : %d, please try again.\n", i - 1);
        continue;
      }
    }
    if (passwd == null) {
      System.out.println("Load skey failed, you can not use operation for shieldedTRC20 "
          + "transaction.");
      return null;
    }
    return SKeyEncryptor.decrypt2PrivateBytes(passwd, skey);
  }

  private byte[] generateSkey() throws IOException, CipherException {
    File file = new File(shieldedSkeyFileName);
    byte[] skey = new byte[16];
    new SecureRandom().nextBytes(skey);

    System.out.println("ShieldedTRC20 wallet does not exist, will build it.");
    char[] password = Utils.inputPassword2Twice();
    byte[] passwd = StringUtils.char2Byte(password);

    SKeyCapsule sKeyCapsule = SKeyEncryptor.createStandard(passwd, skey);
    WalletUtils.generateSkeyFile(sKeyCapsule, file);
    return skey;
  }

  public void initShieldedTRC20WalletFile() throws IOException, CipherException {
    ZenUtils.checkFolderExist(prefixFolder);

    if (ArrayUtils.isEmpty(shieldedSkey)) {
      if (shieldedSkeyFileExist()) {
        shieldedSkey = loadSkey();
      } else {
        shieldedSkey = generateSkey();
      }
      loadShieldTRC20Wallet();
    }
  }

  public ShieldedAddressInfo backupShieldedTRC20Wallet() throws IOException,
      CipherException {
    ZenUtils.checkFolderExist(prefixFolder);

    if (shieldedSkeyFileExist()) {
      byte[] tempShieldedKey = loadSkey();
      if (!ArrayUtils.isEmpty(tempShieldedKey)) {

        if (ArrayUtils.isEmpty(shieldedSkey)) {
          shieldedSkey = tempShieldedKey;
          loadShieldTRC20Wallet();
        }
      } else {
        System.out.println("Invalid password.");
        return null;
      }
    } else {
      System.out.println("ShieldedTRC20 wallet does not exist, please build it first.");
      return null;
    }

    if (shieldedAddressInfoMap.size() <= 0) {
      System.out.println("ShieldedTRC20 addresses is empty, please use command to generate "
          + "ShieldedTRC20 address.");
      return null;
    }

    List<ShieldedAddressInfo> shieldedAddressInfoList = new ArrayList(
        shieldedAddressInfoMap.values());
    for (int i = 0; i < shieldedAddressInfoList.size(); i++) {
      System.out.println("The " + (i + 1) + "th shieldedTRC20 address is "
          + shieldedAddressInfoList.get(i).getAddress());
    }

    if (shieldedAddressInfoList.size() == 1) {
      return shieldedAddressInfoList.get(0);
    } else {
      System.out.println("Please choose between 1 and " + shieldedAddressInfoList.size());
      Scanner in = new Scanner(System.in);
      while (true) {
        String input = in.nextLine().trim();
        String num = input.split("\\s+")[0];
        int n;
        try {
          n = new Integer(num);
        } catch (NumberFormatException e) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose again between 1 and " + shieldedAddressInfoList.size());
          continue;
        }
        if (n < 1 || n > shieldedAddressInfoList.size()) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose again between 1 and " + shieldedAddressInfoList.size());
          continue;
        }
        return shieldedAddressInfoList.get(n - 1);
      }
    }
  }

  public byte[] importShieldedTRC20Wallet() throws IOException, CipherException {
    ZenUtils.checkFolderExist(prefixFolder);

    if (shieldedSkeyFileExist()) {
      byte[] tempShieldedKey = loadSkey();
      if (ArrayUtils.isEmpty(tempShieldedKey)) {
        System.out.println("Invalid password.");
        return null;
      } else {
        shieldedSkey = tempShieldedKey;
      }
    } else {
      shieldedSkey = generateSkey();
    }
    loadShieldTRC20Wallet();

    byte[] result = null;
    System.out.println("Please input shieldedTRC20 wallet hex string. "
        + "such as 'sk d',Max retry time:" + 3);
    int nTime = 0;

    Scanner in = new Scanner(System.in);
    while (nTime < 3) {
      String input = in.nextLine().trim();
      String[] array = Client.getCmd(input.trim());
      if (array.length == 2 && Utils.isHexString(array[0]) && Utils.isHexString(array[1])) {
        System.out.println("Import shieldedTRC20 wallet hex string is : ");
        System.out.println("sk:" + array[0]);
        System.out.println("d :" + array[1]);

        byte[] sk = ByteArray.fromHexString(array[0]);
        byte[] d = ByteArray.fromHexString(array[1]);
        result = new byte[sk.length + d.length];
        System.arraycopy(sk, 0, result, 0, sk.length);
        System.arraycopy(d, 0, result, sk.length, d.length);
        break;
      }

      StringUtils.clear(result);
      System.out.println("Invalid shieldedTRC20 wallet hex string, please input again.");
      ++nTime;
    }
    return result;
  }

  public class Ivk {
    @Setter
    @Getter
    public byte[] ivk;
    @Setter
    @Getter
    public byte[] ak;
    @Setter
    @Getter
    public byte[] nk;

    public Ivk() {
    }
  }
}
