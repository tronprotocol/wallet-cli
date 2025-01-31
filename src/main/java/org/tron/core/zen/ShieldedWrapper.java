package org.tron.core.zen;

import com.google.protobuf.ByteString;
import io.netty.util.internal.StringUtil;
import lombok.Getter;
import lombok.Setter;
import org.apache.commons.lang3.ArrayUtils;
import org.tron.api.GrpcAPI.*;
import org.tron.api.GrpcAPI.DecryptNotes.NoteTx;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CipherException;
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

public class ShieldedWrapper {

  private final static String PREFIX_FOLDER = "WalletShielded";
  private final static String IVK_AND_NUM_FILE_NAME = PREFIX_FOLDER + "/scanblocknumber";
  private final static String UNSPEND_NOTE_FILE_NAME = PREFIX_FOLDER + "/unspendnote";
  private final static String SPEND_NOTE_FILE_NAME = PREFIX_FOLDER + "/spendnote";
  private final static String SHIELDED_ADDRESS_FILE_NAME = PREFIX_FOLDER + "/shieldedaddress";
  private final static String SHIELDED_SKEY_FILE_NAME = PREFIX_FOLDER + "/shieldedskey.json";
  private static AtomicLong nodeIndex = new AtomicLong(0L);
  private Thread thread;

  private byte[] shieldedSkey;
  private static ShieldedWrapper instance;

  @Setter
  @Getter
  Map<String, ShieldedAddressInfo> shieldedAddressInfoMap = new ConcurrentHashMap();
  @Setter
  private boolean resetNote = false;
  @Getter
  @Setter
  public Map<String, Long> ivkMapScanBlockNum = new ConcurrentHashMap();
  @Getter
  @Setter
  public Map<Long, ShieldedNoteInfo>  utxoMapNote = new ConcurrentHashMap();
  @Getter
  @Setter
  public List<ShieldedNoteInfo> spendUtxoList = new ArrayList<>();

  private boolean loadShieldedStatus = false;

  private ShieldedWrapper() {
    thread = new Thread(new scanIvkRunable());
  }

  public static ShieldedWrapper getInstance(){
    if (instance == null){
      instance = new ShieldedWrapper();
    }
    return instance;
  }

  public boolean ifShieldedWalletLoaded() {
    return loadShieldedStatus;
  }

  private void loadWalletFile() throws CipherException {
    loadAddressFromFile();
    loadIvkFromFile();
    loadUnSpendNoteFromFile();
    loadSpendNoteFromFile();
  }

  public boolean loadShieldWallet() throws CipherException, IOException {
    if (ifShieldedWalletLoaded()) {
      return true;
    }

    if (!shieldedSkeyFileExist()) {
      System.out.println("Shielded wallet does not exist.");
      return false;
    }

    if (ArrayUtils.isEmpty(shieldedSkey)) {
      shieldedSkey = loadSkey();
    }

    if (ArrayUtils.isEmpty(shieldedSkey)){
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
    public void run(){
      int count = 24;
      for (;;) {
        try {
          scanBlockByIvk();
          updateNoteWhetherSpend();
        } catch (Exception e) {
          ++count;
          if (count >= 24) {
            if (e.getMessage() != null) {
              System.out.println(e.getMessage());
            }
            System.out.println("Please user command resetshieldednote to reset notes!!");
            count = 0;
          }
        } finally {
          try {
            //wait for 2.5 seconds
            for (int i=0; i<5; ++i) {
              Thread.sleep(500);
              if (resetNote) {
                resetShieldedNote();
                resetNote = false;
                count = 0;
                System.out.println("Reset shielded note success!");
              }
            }
          } catch ( Exception e) {
          }
        }
      }
    }
  }

  private void resetShieldedNote() {
    ivkMapScanBlockNum.clear();
    for (Entry<String, ShieldedAddressInfo> entry : getShieldedAddressInfoMap().entrySet() ) {
      ivkMapScanBlockNum.put(ByteArray.toHexString(entry.getValue().getIvk()), 0L);
    }

    utxoMapNote.clear();
    spendUtxoList.clear();

    ZenUtils.clearFile(IVK_AND_NUM_FILE_NAME);
    ZenUtils.clearFile(UNSPEND_NOTE_FILE_NAME);
    ZenUtils.clearFile(SPEND_NOTE_FILE_NAME);
    nodeIndex.set(0L);

    updateIvkAndBlockNumFile();
  }

  private void scanBlockByIvk() throws CipherException {
    Block block = WalletApi.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {
        long start = entry.getValue();
        long end = start;
        while (end < blockNum) {
          if (blockNum - start > 1000) {
            end = start + 1000;
          } else {
            end = blockNum;
          }

          IvkDecryptParameters.Builder builder = IvkDecryptParameters.newBuilder();
          builder.setStartBlockIndex(start);
          builder.setEndBlockIndex(end);
          builder.setIvk(ByteString.copyFrom(ByteArray.fromHexString(entry.getKey())));
          Optional<DecryptNotes> notes = WalletApi.scanNoteByIvk(builder.build(), false);
          if (notes.isPresent()) {
            int startNum = utxoMapNote.size();
            for (int i = 0; i < notes.get().getNoteTxsList().size(); ++i) {
              NoteTx noteTx = notes.get().getNoteTxsList().get(i);
              ShieldedNoteInfo noteInfo = new ShieldedNoteInfo();
              noteInfo.setPaymentAddress(noteTx.getNote().getPaymentAddress());
              noteInfo.setR(noteTx.getNote().getRcm().toByteArray());
              noteInfo.setValue(noteTx.getNote().getValue());
              noteInfo.setTrxId(ByteArray.toHexString(noteTx.getTxid().toByteArray()));
              noteInfo.setIndex(noteTx.getIndex());
              noteInfo.setNoteIndex(nodeIndex.getAndIncrement());
              noteInfo.setMemo(noteTx.getNote().getMemo().toByteArray());

              utxoMapNote.put(noteInfo.getNoteIndex(), noteInfo);
            }
            int endNum = utxoMapNote.size();
            if (endNum > startNum ) {
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
    for (Entry<Long, ShieldedNoteInfo> entry : utxoMapNote.entrySet()) {
      ShieldedNoteInfo noteInfo = entry.getValue();

      ShieldedAddressInfo addressInfo = getShieldedAddressInfoMap().get(noteInfo.getPaymentAddress());
      NoteParameters.Builder builder = NoteParameters.newBuilder();
      builder.setAk(ByteString.copyFrom(addressInfo.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(addressInfo.getFullViewingKey().getNk()));

      Note.Builder noteBuild = Note.newBuilder();
      noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
      noteBuild.setValue(noteInfo.getValue());
      noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
      noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));
      builder.setNote(noteBuild.build());
      builder.setTxid(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
      builder.setIndex(noteInfo.getIndex());

      Optional<SpendResult> result = WalletApi.isNoteSpend(builder.build(), false);
      if (result.isPresent() && result.get().getResult()) {
        spendNote(entry.getKey());
      }
    }
  }

  /**
   * set some index note is spend
   * @param noteIndex
   * @return
   */
  public boolean spendNote(long noteIndex ) throws CipherException {
    ShieldedNoteInfo noteInfo = utxoMapNote.get(noteIndex);
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
   * save new shielded address and scan block num
   * @param addressInfo  new shielded address
   * @return
   */
  public boolean addNewShieldedAddress(final ShieldedAddressInfo addressInfo, boolean newAddress)
      throws CipherException {
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

    if (!ivkMapScanBlockNum.containsKey(ByteArray.toHexString(addressInfo.getIvk()))) {
      ivkMapScanBlockNum.put(ByteArray.toHexString(addressInfo.getIvk()), blockNum);
      updateIvkAndBlockNum(ByteArray.toHexString(addressInfo.getIvk()), blockNum);
    }
    return true;
  }

  /**
   * append ivk and block num relationship to file tail
   * @param ivk
   * @param blockNum
   * @return
   */
  private boolean updateIvkAndBlockNum(final String ivk, long blockNum ) {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    synchronized (IVK_AND_NUM_FILE_NAME) {
      byte[] value = ByteArray.fromLong(blockNum);
      byte[] key = ByteArray.fromHexString(ivk);
      byte[] text = new byte[key.length + value.length];
      System.arraycopy(key, 0, text, 0, key.length);
      System.arraycopy(value, 0, text, key.length, value.length);
      try {
        byte[] cipherText = ZenUtils.aesCtrEncrypt(text, shieldedSkey);
        String date = Base58.encode(cipherText);
        ZenUtils.appendToFileTail(IVK_AND_NUM_FILE_NAME, date);
      } catch (CipherException e) {
        e.printStackTrace();
      }
    }
    return true;
  }

  /**
   * update ivk and block num
   * @return
   */
  private boolean updateIvkAndBlockNumFile() {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    synchronized (IVK_AND_NUM_FILE_NAME) {
      ZenUtils.clearFile(IVK_AND_NUM_FILE_NAME);
      for (Entry<String, Long> entry : ivkMapScanBlockNum.entrySet()) {
        byte[] value = ByteArray.fromLong(entry.getValue());
        byte[] key = ByteArray.fromHexString(entry.getKey());
        byte[] text = new byte[key.length + value.length];
        System.arraycopy(key, 0, text, 0, key.length);
        System.arraycopy(value, 0, text, key.length, value.length);
        try {
          byte[] cipherText = ZenUtils.aesCtrEncrypt(text, shieldedSkey);
          String date = Base58.encode(cipherText);
          ZenUtils.appendToFileTail(IVK_AND_NUM_FILE_NAME, date);
        } catch (CipherException e) {
          e.printStackTrace();
        }
      }
    }
    return true;
  }

  /**
   * load ivk and block num relationship from file
   * @return
   */
  private boolean loadIvkFromFile() {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    ivkMapScanBlockNum.clear();
    if (ZenUtils.checkFileExist(IVK_AND_NUM_FILE_NAME)) {
      List<String> list = ZenUtils.getListFromFile(IVK_AND_NUM_FILE_NAME);
      for (int i = 0; i < list.size(); ++i) {
        byte[] cipherText = Base58.decode(list.get(i));
        try {
          byte[] text = ZenUtils.aesCtrDecrypt(cipherText, shieldedSkey);
          byte[] key = Arrays.copyOfRange(text, 0, 32);
          byte[] value = Arrays.copyOfRange(text, 32, text.length);
          ivkMapScanBlockNum.put(ByteArray.toHexString(key), ByteArray.toLong(value));
        } catch (CipherException e) {
          e.printStackTrace();
        }
      }
    }
    return true;
  }

  /**
   * get shielded address list
   * @return
   */
  public List<String> getShieldedAddressList() {
    List<String>  addressList = new ArrayList<>();
    for (Entry<String, ShieldedAddressInfo> entry : shieldedAddressInfoMap.entrySet()) {
      addressList.add(entry.getKey());
    }
    return addressList;
  }

  /**
   * sort by value of UTXO
   * @return
   */
  public List<String> getvalidateSortUtxoList() {
    List<Map.Entry<Long, ShieldedNoteInfo>> list = new ArrayList<>(utxoMapNote.entrySet());
    Collections.sort(list, (Entry<Long, ShieldedNoteInfo> o1, Entry<Long, ShieldedNoteInfo> o2) -> {
        if (o1.getValue().getValue() < o2.getValue().getValue()) {
          return 1;
        } else {
          return -1;
        }
      });

    List<String> utxoList = new ArrayList<>();
    for (Map.Entry<Long, ShieldedNoteInfo> entry : list ) {
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
   * @return
   */
  private boolean saveUnspendNoteToFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    ZenUtils.clearFile(UNSPEND_NOTE_FILE_NAME);
    for (Entry<Long, ShieldedNoteInfo> entry : utxoMapNote.entrySet()) {
      String date = entry.getValue().encode(shieldedSkey);
      ZenUtils.appendToFileTail(UNSPEND_NOTE_FILE_NAME, date);
    }
    return true;
  }

  /**
   * load unspend note from file
   * @return
   */
  private boolean loadUnSpendNoteFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }
    utxoMapNote.clear();

    if (ZenUtils.checkFileExist(UNSPEND_NOTE_FILE_NAME)) {
      List<String> list = ZenUtils.getListFromFile(UNSPEND_NOTE_FILE_NAME);
      for (int i = 0; i < list.size(); ++i) {
        ShieldedNoteInfo noteInfo = new ShieldedNoteInfo();
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
   * @return
   */
  private boolean saveSpendNoteToFile(ShieldedNoteInfo noteInfo) throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    String date = noteInfo.encode(shieldedSkey);
    ZenUtils.appendToFileTail(SPEND_NOTE_FILE_NAME, date);
    return true;
  }

  /**
   * load spend note from file
   * @return
   */
  private boolean loadSpendNoteFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    spendUtxoList.clear();
    if (ZenUtils.checkFileExist(SPEND_NOTE_FILE_NAME)) {
      List<String> list = ZenUtils.getListFromFile(SPEND_NOTE_FILE_NAME);
      for (int i = 0; i < list.size(); ++i) {
        ShieldedNoteInfo noteInfo = new ShieldedNoteInfo();
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
   * @return
   */
  private boolean loadAddressFromFile() throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)) {
      return false;
    }

    shieldedAddressInfoMap.clear();
    if (ZenUtils.checkFileExist(SHIELDED_ADDRESS_FILE_NAME)) {
      List<String> addressList = ZenUtils.getListFromFile(SHIELDED_ADDRESS_FILE_NAME);
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
   * @param addressInfo
   * @return
   */
  private boolean appendAddressInfoToFile(final ShieldedAddressInfo addressInfo) throws CipherException {
    if (ArrayUtils.isEmpty(shieldedSkey)){
      return false;
    }

    String shieldedAddress = addressInfo.getAddress();
    if (!StringUtil.isNullOrEmpty(shieldedAddress) &&
        !shieldedAddressInfoMap.containsKey(shieldedAddress)) {
      String addressString = addressInfo.encode(shieldedSkey);
      ZenUtils.appendToFileTail(SHIELDED_ADDRESS_FILE_NAME, addressString);

      shieldedAddressInfoMap.put(shieldedAddress, addressInfo);
    }
    return true;
  }

  private boolean shieldedSkeyFileExist() {
    File file = new File(SHIELDED_SKEY_FILE_NAME);
    return file != null && file.exists();
  }

  private byte[] loadSkey() throws IOException, CipherException {
    File file = new File(SHIELDED_SKEY_FILE_NAME);
    SKeyCapsule skey = WalletUtils.loadSkeyFile(file);

    byte[] passwd = null;
    System.out.println("Please input your password for shielded wallet.");
    for (int i = 6; i > 0; i--) {
      char[] password = Utils.inputPassword(false);
      passwd = StringUtils.char2Byte(password);
      try {
        SKeyEncryptor.validPassword(passwd, skey);
        break;
      } catch (CipherException e) {
        passwd = null;
        System.out.println(e.getMessage());
        System.out.printf("Left times : %d, please try again.\n", i-1);
        continue;
      }
    }
    if (passwd == null) {
      System.out.println("Load skey failed, you can not use operation for shileded transaction.");
      return null;
    }
    return SKeyEncryptor.decrypt2PrivateBytes(passwd, skey);
  }

  private byte[] generateSkey() throws IOException, CipherException {
    File file = new File(SHIELDED_SKEY_FILE_NAME);
    byte[] skey = new byte[16];
    new SecureRandom().nextBytes(skey);

    System.out.println("Shielded wallet does not exist, will build it.");
    char[] password = Utils.inputPassword2Twice();
    byte[] passwd = StringUtils.char2Byte(password);

    SKeyCapsule sKeyCapsule = SKeyEncryptor.createStandard(passwd, skey);
    WalletUtils.generateSkeyFile(sKeyCapsule, file);
    return skey;
  }

  public void initShieldedWaletFile() throws IOException, CipherException {
    ZenUtils.checkFolderExist(PREFIX_FOLDER);

    if (ArrayUtils.isEmpty(shieldedSkey)){
      if (shieldedSkeyFileExist()) {
        shieldedSkey = loadSkey();
      } else {
        shieldedSkey = generateSkey();
      }
      loadShieldWallet();
    }
  }

  public ShieldedAddressInfo backupShieldedWallet() throws IOException, CipherException {
    ZenUtils.checkFolderExist(PREFIX_FOLDER);

    if (shieldedSkeyFileExist()) {
      byte[] tempShieldedKey = loadSkey();
      if (!ArrayUtils.isEmpty(tempShieldedKey)) {

        if (ArrayUtils.isEmpty(shieldedSkey)) {
          shieldedSkey = tempShieldedKey;
          loadShieldWallet();
        }
      } else {
        System.out.println("Invalid password.");
        return null;
      }
    } else {
      System.out.println("Shielded wallet does not exist, please build it first.");
      return null;
    }

    if (shieldedAddressInfoMap.size() <= 0) {
      System.out
          .println("Shielded addresses is empty, please use command to generate shielded address.");
      return null;
    }

    List<ShieldedAddressInfo> shieldedAddressInfoList = new ArrayList(
        shieldedAddressInfoMap.values());
    for (int i = 0; i < shieldedAddressInfoList.size(); i++) {
      System.out.println("The " + (i + 1) + "th shielded address is "
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

  public byte[] importShieldedWallet() throws IOException, CipherException {
    ZenUtils.checkFolderExist(PREFIX_FOLDER);

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
    loadShieldWallet();

    byte[] result = null;
    System.out.println("Please input shielded wallet hex string. such as 'sk d',Max retry time:" + 3);
    int nTime = 0;

    Scanner in = new Scanner(System.in);
    while (nTime < 3) {
      String input = in.nextLine().trim();
      String[] array = Client.getCmd(input.trim());
      if (array.length == 2 && Utils.isHexString(array[0]) && Utils.isHexString(array[1])) {
        System.out.println("Import shielded wallet hex string is : ");
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
      System.out.println("Invalid shielded wallet hex string, please input again.");
      ++nTime;
    }
    return result;
  }
}
