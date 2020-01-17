package org.tron.walletserver;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigObject;
import io.grpc.Status;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.StringUtils;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.*;
import org.tron.api.GrpcAPI.TransactionSignWeight.Result.response_code;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.crypto.sm2.SM2;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.core.config.Parameter.CommonConstant;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.keystore.*;
import org.tron.protos.Contract;
import org.tron.protos.Contract.*;
import org.tron.protos.Protocol.*;
import org.tron.protos.Protocol.Transaction.Contract.ContractType;
import org.tron.protos.Protocol.Transaction.Result;

import java.io.File;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
public class WalletApi {

  private static final String FilePath = "Wallet";
  private List<WalletFile> walletFile = new ArrayList<>();
  private boolean loginState = false;
  private byte[] address;
  private static Byte addressPreFixByte;
  private static int rpcVersion = 2;
  private static boolean isEckey = true;

  public static String selectFullNode() {
    Map<String, String> witnessMap = new HashMap<>();
    Config config = Configuration.getByPath("config.conf");
    List list = config.getObjectList("witnesses.witnessList");
    for (int i = 0; i < list.size(); i++) {
      ConfigObject obj = (ConfigObject) list.get(i);
      String ip = obj.get("ip").unwrapped().toString();
      String url = obj.get("url").unwrapped().toString();
      witnessMap.put(url, ip);
    }

    Optional<WitnessList> result = GrpcClientHolder.getGrpcClient().listWitnesses();
    long minMissedNum = 100000000L;
    String minMissedWitness = "";
    if (result.isPresent()) {
      List<Witness> witnessList = result.get().getWitnessesList();
      for (Witness witness : witnessList) {
        String url = witness.getUrl();
        long missedBlocks = witness.getTotalMissed();
        if (missedBlocks < minMissedNum) {
          minMissedNum = missedBlocks;
          minMissedWitness = url;
        }
      }
    }
    if (witnessMap.containsKey(minMissedWitness)) {
      return witnessMap.get(minMissedWitness);
    } else {
      return "";
    }
  }

  public static void setAddressPreFixByte(byte addressPreFixByte) {
    WalletApi.addressPreFixByte = addressPreFixByte;
  }

  public static int getRpcVersion() {
    return rpcVersion;
  }

  /**
   * Creates a new WalletApi with a random ECKey or no ECKey.
   * */
  public static WalletFile CreateWalletFile(byte[] password) throws CipherException {
    WalletFile walletFile = null;
    if (isEckey) {
      ECKey ecKey = new ECKey(Utils.getRandom());
      walletFile = Wallet.createStandard(password, ecKey);
    } else {
      SM2 sm2 = new SM2(Utils.getRandom());
      walletFile = Wallet.createStandard(password, sm2);
    }
    return walletFile;
  }

  //  Create Wallet with a pritKey
  public static WalletFile CreateWalletFile(byte[] password, byte[] priKey) throws CipherException {
    WalletFile walletFile = null;
    if (isEckey) {
      ECKey ecKey = ECKey.fromPrivate(priKey);
      walletFile = Wallet.createStandard(password, ecKey);
    } else {
      SM2 sm2 = SM2.fromPrivate(priKey);
      walletFile = Wallet.createStandard(password, sm2);
    }
    return walletFile;
  }

  public boolean isLoginState() {
    return loginState;
  }

  public void logout() {
    loginState = false;
    walletFile.clear();
    this.walletFile = null;
  }

  public void setLogin() {
    loginState = true;
  }

  public boolean checkPassword(byte[] passwd) throws CipherException {
    return Wallet.validPassword(passwd, this.walletFile.get(0));
  }

  /**
   * Creates a Wallet with an existing ECKey.
   * */
  public WalletApi(WalletFile walletFile) {
    if (this.walletFile.isEmpty()) {
      this.walletFile.add(walletFile);
    } else {
      this.walletFile.set(0, walletFile);
    }
    this.address = decodeFromBase58Check(walletFile.getAddress());
  }

  public ECKey getEcKey(WalletFile walletFile, byte[] password) throws CipherException {
    return Wallet.decrypt(password, walletFile);
  }

  public SM2 getSM2(WalletFile walletFile, byte[] password) throws CipherException {
    return Wallet.decryptSM2(password, walletFile);
  }

  public byte[] getPrivateBytes(byte[] password) throws CipherException, IOException {
    WalletFile walletFile = loadWalletFile();
    return Wallet.decrypt2PrivateBytes(password, walletFile);
  }

  public byte[] getAddress() {
    return address;
  }

  public static String store2Keystore(WalletFile walletFile) throws IOException {
    if (walletFile == null) {
      System.out.println("Warning: Store wallet failed, walletFile is null !!");
      return null;
    }
    File file = new File(FilePath);
    if (!file.exists()) {
      if (!file.mkdir()) {
        throw new IOException("Make directory failed!");
      }
    } else {
      if (!file.isDirectory()) {
        if (file.delete()) {
          if (!file.mkdir()) {
            throw new IOException("Make directory failed!");
          }
        } else {
          throw new IOException("File exists and can not be deleted!");
        }
      }
    }
    return WalletUtils.generateWalletFile(walletFile, file);
  }

  public static File selcetWalletFile() {
    File file = new File(FilePath);
    if (!file.exists() || !file.isDirectory()) {
      return null;
    }

    File[] wallets = file.listFiles();
    if (ArrayUtils.isEmpty(wallets)) {
      return null;
    }

    File wallet;
    if (wallets.length > 1) {
      for (int i = 0; i < wallets.length; i++) {
        System.out.println("The " + (i + 1) + "th keystore file name is " + wallets[i].getName());
      }
      System.out.println("Please choose between 1 and " + wallets.length);
      Scanner in = new Scanner(System.in);
      while (true) {
        String input = in.nextLine().trim();
        String num = input.split("\\s+")[0];
        int n;
        try {
          n = new Integer(num);
        } catch (NumberFormatException e) {
          System.out.println("Invaild number of " + num);
          System.out.println("Please choose again between 1 and " + wallets.length);
          continue;
        }
        if (n < 1 || n > wallets.length) {
          System.out.println("Please choose again between 1 and " + wallets.length);
          continue;
        }
        wallet = wallets[n - 1];
        break;
      }
    } else {
      wallet = wallets[0];
    }

    return wallet;
  }

  public WalletFile selcetWalletFileE() throws IOException {
    File file = selcetWalletFile();
    if (file == null) {
      throw new IOException(
          "No keystore file found, please use registerwallet or importwallet first!");
    }
    String name = file.getName();
    for (WalletFile wallet : this.walletFile) {
      String address = wallet.getAddress();
      if (name.contains(address)) {
        return wallet;
      }
    }

    WalletFile wallet = WalletUtils.loadWalletFile(file);
    this.walletFile.add(wallet);
    return wallet;
  }

  public static boolean changeKeystorePassword(byte[] oldPassword, byte[] newPassowrd)
      throws IOException, CipherException {
    File wallet = selcetWalletFile();
    if (wallet == null) {
      throw new IOException(
          "No keystore file found, please use registerwallet or importwallet first!");
    }
    Credentials credentials = WalletUtils.loadCredentials(oldPassword, wallet);
    WalletUtils.updateWalletFile(newPassowrd, credentials.getPair(), wallet, true);
    return true;
  }

  private static WalletFile loadWalletFile() throws IOException {
    File wallet = selcetWalletFile();
    if (wallet == null) {
      throw new IOException(
          "No keystore file found, please use registerwallet or importwallet first!");
    }
    return WalletUtils.loadWalletFile(wallet);
  }

  /**
   * load a Wallet from keystore
   * */
  public static WalletApi loadWalletFromKeystore() throws IOException {
    WalletFile walletFile = loadWalletFile();
    WalletApi walletApi = new WalletApi(walletFile);
    return walletApi;
  }

  public Account queryAccount() {
    return queryAccount(getAddress());
  }

  public static Account queryAccount(byte[] address) {
    return GrpcClientHolder.getGrpcClient().queryAccount(address); // call rpc
  }

  public static Account queryAccountById(String accountId) {
    return GrpcClientHolder.getGrpcClient().queryAccountById(accountId);
  }

  private boolean confirm() {
    Scanner in = new Scanner(System.in);
    while (true) {
      String input = in.nextLine().trim();
      String str = input.split("\\s+")[0];
      if ("y".equalsIgnoreCase(str)) {
        return true;
      } else {
        return false;
      }
    }
  }

  private Transaction signTransaction(Transaction transaction)
      throws CipherException, IOException, CancelException {
    if (transaction.getRawData().getTimestamp() == 0) {
      transaction = TransactionUtils.setTimestamp(transaction);
    }
    transaction = TransactionUtils.setExpirationTime(transaction);

    System.out.println(
        "Please confirm and input your permission id, if input y or Y means default 0, other non-numeric characters will cancell transaction.");
    transaction = TransactionUtils.setPermissionId(transaction);
    while (true) {
      System.out.println("Please choose your key for sign.");
      WalletFile walletFile = selcetWalletFileE();
      System.out.println("Please input your password.");
      char[] password = Utils.inputPassword(false);
      byte[] passwd = org.tron.keystore.StringUtils.char2Byte(password);
      org.tron.keystore.StringUtils.clear(password);
      if (isEckey) {
        transaction = TransactionUtils.sign(transaction, this.getEcKey(walletFile, passwd));
      } else {
        transaction = TransactionUtils.sign(transaction, this.getSM2(walletFile, passwd));
      }
      org.tron.keystore.StringUtils.clear(passwd);

      TransactionSignWeight weight = getTransactionSignWeight(transaction);
      if (weight.getResult().getCode() == response_code.ENOUGH_PERMISSION) {
        break;
      }
      if (weight.getResult().getCode() == response_code.NOT_ENOUGH_PERMISSION) {
        System.out.println("Current signWeight is:");
        System.out.println(Utils.printTransactionSignWeight(weight));
        System.out.println("Please confirm if continue add signature enter y or Y, else any other");
        if (!confirm()) {
          throw new CancelException("User cancelled");
        }
        continue;
      }
      throw new CancelException(weight.getResult().getMessage());
    }

    return transaction;
  }

  private Transaction signOnlyForShieldedTransaction(Transaction transaction)
      throws CipherException, IOException, CancelException {
    System.out.println(
        "Please confirm and input your permission id, if input y or Y means default 0, other non-numeric characters will cancell transaction.");
    transaction = TransactionUtils.setPermissionId(transaction);
    while (true) {
      System.out.println("Please choose your key for sign.");
      WalletFile walletFile = selcetWalletFileE();
      System.out.println("Please input your password.");
      char[] password = Utils.inputPassword(false);
      byte[] passwd = org.tron.keystore.StringUtils.char2Byte(password);
      org.tron.keystore.StringUtils.clear(password);

      if (isEckey) {
        transaction = TransactionUtils.sign(transaction, this.getEcKey(walletFile, passwd));
      } else {
        transaction = TransactionUtils.sign(transaction, this.getSM2(walletFile, passwd));
      }
      org.tron.keystore.StringUtils.clear(passwd);

      TransactionSignWeight weight = getTransactionSignWeight(transaction);
      if (weight.getResult().getCode() == response_code.ENOUGH_PERMISSION) {
        break;
      }
      if (weight.getResult().getCode() == response_code.NOT_ENOUGH_PERMISSION) {
        System.out.println("Current signWeight is:");
        System.out.println(Utils.printTransactionSignWeight(weight));
        System.out.println("Please confirm if continue add signature enter y or Y, else any other");
        if (!confirm()) {
          throw new CancelException("User cancelled");
        }
        continue;
      }
      throw new CancelException(weight.getResult().getMessage());
    }
    return transaction;
  }

  private boolean processTransactionExtention(TransactionExtention transactionExtention)
      throws IOException, CipherException, CancelException {
    if (transactionExtention == null) {
      return false;
    }
    Return ret = transactionExtention.getResult();
    if (!ret.getResult()) {
      System.out.println("Code = " + ret.getCode());
      System.out.println("Message = " + ret.getMessage().toStringUtf8());
      return false;
    }
    Transaction transaction = transactionExtention.getTransaction();
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Transaction is empty");
      return false;
    }

    if (transaction.getRawData().getContract(0).getType()
        == ContractType.ShieldedTransferContract) {
      return false;
    }

    System.out.println(Utils.printTransactionExceptId(transactionExtention.getTransaction()));
    System.out.println("before sign transaction hex string is " +
        ByteArray.toHexString(transaction.toByteArray()));
    transaction = signTransaction(transaction);
    showTransactionAfterSign(transaction);
    return GrpcClientHolder.getGrpcClient().broadcastTransaction(transaction);
  }

  private void showTransactionAfterSign(Transaction transaction)
      throws InvalidProtocolBufferException {
    System.out.println("after sign transaction hex string is " +
        ByteArray.toHexString(transaction.toByteArray()));
    System.out.println("txid is " +
        ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray())));

    if (transaction.getRawData().getContract(0).getType() == ContractType.CreateSmartContract) {
      CreateSmartContract createSmartContract = transaction.getRawData().getContract(0)
          .getParameter().unpack(CreateSmartContract.class);
      byte[] contractAddress = generateContractAddress(
          createSmartContract.getOwnerAddress().toByteArray(), transaction);
      System.out.println(
          "Your smart contract address will be: " + WalletApi.encode58Check(contractAddress));
    }
  }

  private static boolean processShieldedTransaction(TransactionExtention transactionExtention,
                                                    WalletApi wallet)
      throws IOException, CipherException, CancelException {
    if (transactionExtention == null) {
      return false;
    }
    Return ret = transactionExtention.getResult();
    if (!ret.getResult()) {
      System.out.println("Code = " + ret.getCode());
      System.out.println("Message = " + ret.getMessage().toStringUtf8());
      return false;
    }
    Transaction transaction = transactionExtention.getTransaction();
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Transaction is empty");
      return false;
    }

    if (transaction.getRawData().getContract(0).getType()
        != ContractType.ShieldedTransferContract) {
      return false;
    }
    System.out.println(Utils.printTransactionExceptId(transactionExtention.getTransaction()));

    Any any = transaction.getRawData().getContract(0).getParameter();
    ShieldedTransferContract shieldedTransferContract =
        any.unpack(ShieldedTransferContract.class);
    if (shieldedTransferContract.getFromAmount() > 0) {
      if (wallet == null || !wallet.isLoginState()) {
        System.out.println("Warning: processShieldedTransaction failed, Please login first !!");
        return false;
      }
      transaction = wallet.signOnlyForShieldedTransaction(transaction);
    }

    System.out.println(
        "transaction hex string is " + ByteArray.toHexString(transaction.toByteArray()));
    System.out.println(
        "txid is "
            + ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray())));

    return GrpcClientHolder.getGrpcClient().broadcastTransaction(transaction);
  }

  private boolean processTransaction(Transaction transaction)
      throws IOException, CipherException, CancelException {
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }

    System.out.println(Utils.printTransactionExceptId(transaction));
    System.out.println(
        "before sign transaction hex string is "
            + ByteArray.toHexString(transaction.toByteArray()));

    transaction = signTransaction(transaction);

    showTransactionAfterSign(transaction);
    return GrpcClientHolder.getGrpcClient().broadcastTransaction(transaction);
  }

  // Warning: do not invoke this interface provided by others.
  public static Transaction signTransactionByApi(Transaction transaction, byte[] privateKey)
      throws CancelException {
    transaction = TransactionUtils.setExpirationTime(transaction);
    System.out.println("Please input permission id.");
    transaction = TransactionUtils.setPermissionId(transaction);
    TransactionSign.Builder builder = TransactionSign.newBuilder();
    builder.setPrivateKey(ByteString.copyFrom(privateKey));
    builder.setTransaction(transaction);
    return GrpcClientHolder.getGrpcClient().signTransaction(builder.build());
  }

  // Warning: do not invoke this interface provided by others.
  public static TransactionExtention signTransactionByApi2(
      Transaction transaction, byte[] privateKey) throws CancelException {
    transaction = TransactionUtils.setExpirationTime(transaction);
    System.out.println("Please input permission id.");
    transaction = TransactionUtils.setPermissionId(transaction);
    TransactionSign.Builder builder = TransactionSign.newBuilder();
    builder.setPrivateKey(ByteString.copyFrom(privateKey));
    builder.setTransaction(transaction);
    return GrpcClientHolder.getGrpcClient().signTransaction2(builder.build());
  }

  // Warning: do not invoke this interface provided by others.
  public static TransactionExtention addSignByApi(Transaction transaction, byte[] privateKey)
      throws CancelException {
    transaction = TransactionUtils.setExpirationTime(transaction);
    System.out.println("Please input permission id.");
    transaction = TransactionUtils.setPermissionId(transaction);
    TransactionSign.Builder builder = TransactionSign.newBuilder();
    builder.setPrivateKey(ByteString.copyFrom(privateKey));
    builder.setTransaction(transaction);
    return GrpcClientHolder.getGrpcClient().addSign(builder.build());
  }

  public static TransactionSignWeight getTransactionSignWeight(Transaction transaction) {
    return GrpcClientHolder.getGrpcClient().getTransactionSignWeight(transaction);
  }

  public static TransactionApprovedList getTransactionApprovedList(Transaction transaction) {
    return GrpcClientHolder.getGrpcClient().getTransactionApprovedList(transaction);
  }

  // Warning: do not invoke this interface provided by others.
  public static byte[] createAdresss(byte[] passPhrase) {
    return GrpcClientHolder.getGrpcClient().createAdresss(passPhrase);
  }

  // Warning: do not invoke this interface provided by others.
  public static EasyTransferResponse easyTransfer(
      byte[] passPhrase, byte[] toAddress, long amount) {
    return GrpcClientHolder.getGrpcClient().easyTransfer(passPhrase, toAddress, amount);
  }

  // Warning: do not invoke this interface provided by others.
  public static EasyTransferResponse easyTransferByPrivate(
      byte[] privateKey, byte[] toAddress, long amount) {
    return GrpcClientHolder.getGrpcClient().easyTransferByPrivate(privateKey, toAddress, amount);
  }

  // Warning: do not invoke this interface provided by others.
  public static EasyTransferResponse easyTransferAsset(
      byte[] passPhrase, byte[] toAddress, String assetId, long amount) {
    return GrpcClientHolder.getGrpcClient().easyTransferAsset(passPhrase, toAddress, assetId, amount);
  }

  // Warning: do not invoke this interface provided by others.
  public static EasyTransferResponse easyTransferAssetByPrivate(
      byte[] privateKey, byte[] toAddress, String assetId, long amount) {
    return GrpcClientHolder.getGrpcClient().easyTransferAssetByPrivate(privateKey, toAddress, assetId, amount);
  }

  public boolean sendCoin(byte[] owner, byte[] to, long amount)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    TransferContract contract = createTransferContract(to, owner, amount);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public boolean updateAccount(byte[] owner, byte[] accountNameBytes)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    AccountUpdateContract contract = createAccountUpdateContract(accountNameBytes, owner);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public boolean setAccountId(byte[] owner, byte[] accountIdBytes)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    SetAccountIdContract contract = createSetAccountIdContract(accountIdBytes, owner);
    Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }

    return processTransaction(transaction);
  }

  public boolean updateAsset(
      byte[] owner, byte[] description, byte[] url, long newLimit, long newPublicLimit)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    UpdateAssetContract contract =
        createUpdateAssetContract(owner, description, url, newLimit, newPublicLimit);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public boolean transferAsset(byte[] owner, byte[] to, byte[] assertName, long amount)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    TransferAssetContract contract =
        createTransferAssetContract(to, assertName, owner, amount);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransferAssetTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransferAssetTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public boolean participateAssetIssue(byte[] owner, byte[] to, byte[] assertName, long amount)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ParticipateAssetIssueContract contract =
        participateAssetIssueContract(to, assertName, owner, amount);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention =
          GrpcClientHolder.getGrpcClient().createParticipateAssetIssueTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createParticipateAssetIssueTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public static boolean broadcastTransaction(byte[] transactionBytes)
      throws InvalidProtocolBufferException {
    Transaction transaction = Transaction.parseFrom(transactionBytes);
    return GrpcClientHolder.getGrpcClient().broadcastTransaction(transaction);
  }

  public static boolean broadcastTransaction(Transaction transaction) {
    return GrpcClientHolder.getGrpcClient().broadcastTransaction(transaction);
  }

  public boolean createAssetIssue(AssetIssueContract contract)
      throws CipherException, IOException, CancelException {
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createAssetIssue2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createAssetIssue(contract);
      return processTransaction(transaction);
    }
  }

  public boolean createAccount(byte[] owner, byte[] address)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    AccountCreateContract contract = createAccountCreateContract(owner, address);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createAccount2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createAccount(contract);
      return processTransaction(transaction);
    }
  }

  // Warning: do not invoke this interface provided by others.
  public static AddressPrKeyPairMessage generateAddress() {
    EmptyMessage.Builder builder = EmptyMessage.newBuilder();
    return GrpcClientHolder.getGrpcClient().generateAddress(builder.build());
  }

  public boolean createWitness(byte[] owner, byte[] url)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    WitnessCreateContract contract = createWitnessCreateContract(owner, url);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createWitness2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createWitness(contract);
      return processTransaction(transaction);
    }
  }

  public boolean updateWitness(byte[] owner, byte[] url)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    WitnessUpdateContract contract = createWitnessUpdateContract(owner, url);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().updateWitness2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().updateWitness(contract);
      return processTransaction(transaction);
    }
  }

  public static Block getBlock(long blockNum) {
    return GrpcClientHolder.getGrpcClient().getBlock(blockNum);
  }

  public static BlockExtention getBlock2(long blockNum) {
    return GrpcClientHolder.getGrpcClient().getBlock2(blockNum);
  }

  public static long getTransactionCountByBlockNum(long blockNum) {
    return GrpcClientHolder.getGrpcClient().getTransactionCountByBlockNum(blockNum);
  }

  public boolean voteWitness(byte[] owner, HashMap<String, String> witness)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    VoteWitnessContract contract = createVoteWitnessContract(owner, witness);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().voteWitnessAccount2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().voteWitnessAccount(contract);
      return processTransaction(transaction);
    }
  }

  public static TransferContract createTransferContract(
      byte[] to, byte[] owner, long amount) {
    TransferContract.Builder builder = TransferContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static TransferAssetContract createTransferAssetContract(
      byte[] to, byte[] assertName, byte[] owner, long amount) {
    TransferAssetContract.Builder builder = TransferAssetContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static ParticipateAssetIssueContract participateAssetIssueContract(
      byte[] to, byte[] assertName, byte[] owner, long amount) {
    ParticipateAssetIssueContract.Builder builder =
        ParticipateAssetIssueContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static AccountUpdateContract createAccountUpdateContract(
      byte[] accountName, byte[] address) {
    AccountUpdateContract.Builder builder = AccountUpdateContract.newBuilder();
    ByteString basAddreess = ByteString.copyFrom(address);
    ByteString bsAccountName = ByteString.copyFrom(accountName);
    builder.setAccountName(bsAccountName);
    builder.setOwnerAddress(basAddreess);

    return builder.build();
  }

  public static SetAccountIdContract createSetAccountIdContract(
      byte[] accountId, byte[] address) {
    SetAccountIdContract.Builder builder = SetAccountIdContract.newBuilder();
    ByteString bsAddress = ByteString.copyFrom(address);
    ByteString bsAccountId = ByteString.copyFrom(accountId);
    builder.setAccountId(bsAccountId);
    builder.setOwnerAddress(bsAddress);

    return builder.build();
  }

  public static UpdateAssetContract createUpdateAssetContract(
      byte[] address, byte[] description, byte[] url, long newLimit, long newPublicLimit) {
    UpdateAssetContract.Builder builder = UpdateAssetContract.newBuilder();
    ByteString basAddreess = ByteString.copyFrom(address);
    builder.setDescription(ByteString.copyFrom(description));
    builder.setUrl(ByteString.copyFrom(url));
    builder.setNewLimit(newLimit);
    builder.setNewPublicLimit(newPublicLimit);
    builder.setOwnerAddress(basAddreess);

    return builder.build();
  }

  public static AccountCreateContract createAccountCreateContract(
      byte[] owner, byte[] address) {
    AccountCreateContract.Builder builder = AccountCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setAccountAddress(ByteString.copyFrom(address));

    return builder.build();
  }

  public static WitnessCreateContract createWitnessCreateContract(
      byte[] owner, byte[] url) {
    WitnessCreateContract.Builder builder = WitnessCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setUrl(ByteString.copyFrom(url));

    return builder.build();
  }

  public static WitnessUpdateContract createWitnessUpdateContract(
      byte[] owner, byte[] url) {
    WitnessUpdateContract.Builder builder = WitnessUpdateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setUpdateUrl(ByteString.copyFrom(url));

    return builder.build();
  }

  public static VoteWitnessContract createVoteWitnessContract(
      byte[] owner, HashMap<String, String> witness) {
    VoteWitnessContract.Builder builder = VoteWitnessContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    for (String addressBase58 : witness.keySet()) {
      String value = witness.get(addressBase58);
      long count = Long.parseLong(value);
      VoteWitnessContract.Vote.Builder voteBuilder =
          VoteWitnessContract.Vote.newBuilder();
      byte[] address = WalletApi.decodeFromBase58Check(addressBase58);
      if (address == null) {
        continue;
      }
      voteBuilder.setVoteAddress(ByteString.copyFrom(address));
      voteBuilder.setVoteCount(count);
      builder.addVotes(voteBuilder.build());
    }

    return builder.build();
  }

  public static boolean passwordValid(char[] password) {
    if (ArrayUtils.isEmpty(password)) {
      throw new IllegalArgumentException("password is empty");
    }
    if (password.length < 6) {
      System.out.println("Warning: Password is too short !!");
      return false;
    }
    // Other rule;
    int level = CheckStrength.checkPasswordStrength(password);
    if (level <= 4) {
      System.out.println("Your password is too weak!");
      System.out.println("The password should be at least 8 characters.");
      System.out.println("The password should contains uppercase, lowercase, numeric and other.");
      System.out.println(
          "The password should not contain more than 3 duplicate numbers or letters; For example: 1111.");
      System.out.println(
          "The password should not contain more than 3 consecutive Numbers or letters; For example: 1234.");
      System.out.println("The password should not contain weak password combination; For example:");
      System.out.println("ababab, abcabc, password, passw0rd, p@ssw0rd, admin1234, etc.");
      return false;
    }
    return true;
  }

  public static boolean addressValid(byte[] address) {
    if (ArrayUtils.isEmpty(address)) {
      System.out.println("Warning: Address is empty !!");
      return false;
    }
    if (address.length != CommonConstant.ADDRESS_SIZE) {
      System.out.println(
          "Warning: Address length need "
              + CommonConstant.ADDRESS_SIZE
              + " but "
              + address.length
              + " !!");
      return false;
    }
    byte preFixbyte = address[0];
    if (preFixbyte != GrpcClientHolder.getPrefix()) {
      System.out.println(
          "Warning: Address need prefix with "
              + GrpcClientHolder.getPrefix()
              + " but "
              + preFixbyte
              + " !!");
      return false;
    }
    // Other rule;
    return true;
  }

  public static String encode58Check(byte[] input) {
    byte[] hash0 = Sha256Sm3Hash.hash(input);
    byte[] hash1 = Sha256Sm3Hash.hash(hash0);
    byte[] inputCheck = new byte[input.length + 4];
    System.arraycopy(input, 0, inputCheck, 0, input.length);
    System.arraycopy(hash1, 0, inputCheck, input.length, 4);
    return Base58.encode(inputCheck);
  }

  private static byte[] decode58Check(String input) {
    byte[] decodeCheck = Base58.decode(input);
    if (decodeCheck.length <= 4) {
      return null;
    }
    byte[] decodeData = new byte[decodeCheck.length - 4];
    System.arraycopy(decodeCheck, 0, decodeData, 0, decodeData.length);
    byte[] hash0 = Sha256Sm3Hash.hash(decodeData);
    byte[] hash1 = Sha256Sm3Hash.hash(hash0);
    if (hash1[0] == decodeCheck[decodeData.length]
        && hash1[1] == decodeCheck[decodeData.length + 1]
        && hash1[2] == decodeCheck[decodeData.length + 2]
        && hash1[3] == decodeCheck[decodeData.length + 3]) {
      return decodeData;
    }
    return null;
  }

  public static byte[] decodeFromBase58Check(String addressBase58) {
    if (StringUtils.isEmpty(addressBase58)) {
      System.out.println("Warning: Address is empty !!");
      return null;
    }
    byte[] address = decode58Check(addressBase58);
    if (!addressValid(address)) {
      return null;
    }
    return address;
  }

  public static boolean priKeyValid(byte[] priKey) {
    if (ArrayUtils.isEmpty(priKey)) {
      System.out.println("Warning: PrivateKey is empty !!");
      return false;
    }
    if (priKey.length != 32) {
      System.out.println("Warning: PrivateKey length need 64 but " + priKey.length + " !!");
      return false;
    }
    // Other rule;
    return true;
  }

  //  public static Optional<AccountList> listAccounts() {
  //    Optional<AccountList> result = GrpcClientHolder.getGrpcClient().listAccounts();
  //    if (result.isPresent()) {
  //      AccountList accountList = result.get();
  //      List<Account> list = accountList.getAccountsList();
  //      List<Account> newList = new ArrayList();
  //      newList.addAll(list);
  //      newList.sort(new AccountComparator());
  //      AccountList.Builder builder = AccountList.newBuilder();
  //      newList.forEach(account -> builder.addAccounts(account));
  //      result = Optional.of(builder.build());
  //    }
  //    return result;
  //  }

  public static Optional<WitnessList> listWitnesses() {
    Optional<WitnessList> result = GrpcClientHolder.getGrpcClient().listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      List<Witness> list = witnessList.getWitnessesList();
      List<Witness> newList = new ArrayList<>();
      newList.addAll(list);
      newList.sort(
          new Comparator<Witness>() {
            @Override
            public int compare(Witness o1, Witness o2) {
              return Long.compare(o2.getVoteCount(), o1.getVoteCount());
            }
          });
      WitnessList.Builder builder = WitnessList.newBuilder();
      newList.forEach(witness -> builder.addWitnesses(witness));
      result = Optional.of(builder.build());
    }
    return result;
  }

  //  public static Optional<AssetIssueList> getAssetIssueListByTimestamp(long timestamp) {
  //    return GrpcClientHolder.getGrpcClient().getAssetIssueListByTimestamp(timestamp);
  //  }
  //
  //  public static Optional<TransactionList> getTransactionsByTimestamp(long start, long end,
  //      int offset, int limit) {
  //    return GrpcClientHolder.getGrpcClient().getTransactionsByTimestamp(start, end, offset, limit);
  //  }
  //
  //  public static GrpcAPI.NumberMessage getTransactionsByTimestampCount(long start, long end) {
  //    return GrpcClientHolder.getGrpcClient().getTransactionsByTimestampCount(start, end);
  //  }

  public static Optional<AssetIssueList> getAssetIssueList() {
    return GrpcClientHolder.getGrpcClient().getAssetIssueList();
  }

  public static Optional<AssetIssueList> getAssetIssueList(long offset, long limit) {
    return GrpcClientHolder.getGrpcClient().getAssetIssueList(offset, limit);
  }

  public static Optional<ProposalList> getProposalListPaginated(long offset, long limit) {
    return GrpcClientHolder.getGrpcClient().getProposalListPaginated(offset, limit);
  }

  public static Optional<ExchangeList> getExchangeListPaginated(long offset, long limit) {
    return GrpcClientHolder.getGrpcClient().getExchangeListPaginated(offset, limit);
  }

  public static Optional<NodeList> listNodes() {
    return GrpcClientHolder.getGrpcClient().listNodes();
  }

  public static Optional<AssetIssueList> getAssetIssueByAccount(byte[] address) {
    return GrpcClientHolder.getGrpcClient().getAssetIssueByAccount(address);
  }

  public static AccountNetMessage getAccountNet(byte[] address) {
    return GrpcClientHolder.getGrpcClient().getAccountNet(address);
  }

  public static AccountResourceMessage getAccountResource(byte[] address) {
    return GrpcClientHolder.getGrpcClient().getAccountResource(address);
  }

  public static AssetIssueContract getAssetIssueByName(String assetName) {
    return GrpcClientHolder.getGrpcClient().getAssetIssueByName(assetName);
  }

  public static Optional<AssetIssueList> getAssetIssueListByName(String assetName) {
    return GrpcClientHolder.getGrpcClient().getAssetIssueListByName(assetName);
  }

  public static AssetIssueContract getAssetIssueById(String assetId) {
    return GrpcClientHolder.getGrpcClient().getAssetIssueById(assetId);
  }

  public static NumberMessage getTotalTransaction() {
    return GrpcClientHolder.getGrpcClient().getTotalTransaction();
  }

  public static NumberMessage getNextMaintenanceTime() {
    return GrpcClientHolder.getGrpcClient().getNextMaintenanceTime();
  }

  public static Optional<TransactionList> getTransactionsFromThis(
      byte[] address, int offset, int limit) {
    return GrpcClientHolder.getGrpcClient().getTransactionsFromThis(address, offset, limit);
  }

  public static Optional<TransactionListExtention> getTransactionsFromThis2(
      byte[] address, int offset, int limit) {
    return GrpcClientHolder.getGrpcClient().getTransactionsFromThis2(address, offset, limit);
  }
  //  public static GrpcAPI.NumberMessage getTransactionsFromThisCount(byte[] address) {
  //    return GrpcClientHolder.getGrpcClient().getTransactionsFromThisCount(address);
  //  }

  public static Optional<TransactionList> getTransactionsToThis(
      byte[] address, int offset, int limit) {
    return GrpcClientHolder.getGrpcClient().getTransactionsToThis(address, offset, limit);
  }

  public static Optional<TransactionListExtention> getTransactionsToThis2(
      byte[] address, int offset, int limit) {
    return GrpcClientHolder.getGrpcClient().getTransactionsToThis2(address, offset, limit);
  }
  //  public static GrpcAPI.NumberMessage getTransactionsToThisCount(byte[] address) {
  //    return GrpcClientHolder.getGrpcClient().getTransactionsToThisCount(address);
  //  }

  public static Optional<Transaction> getTransactionById(String txID) {
    return GrpcClientHolder.getGrpcClient().getTransactionById(txID);
  }

  public static Optional<TransactionInfo> getTransactionInfoById(String txID) {
    return GrpcClientHolder.getGrpcClient().getTransactionInfoById(txID);
  }

  public boolean freezeBalance(
      byte[] ownerAddress,
      long frozen_balance,
      long frozen_duration,
      int resourceCode,
      byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    FreezeBalanceContract contract =
        createFreezeBalanceContract(
            ownerAddress, frozen_balance, frozen_duration, resourceCode, receiverAddress);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  public boolean buyStorage(byte[] ownerAddress, long quantity)
      throws CipherException, IOException, CancelException {
    BuyStorageContract contract = createBuyStorageContract(ownerAddress, quantity);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction(contract);
    return processTransactionExtention(transactionExtention);
  }

  public boolean buyStorageBytes(byte[] ownerAddress, long bytes)
      throws CipherException, IOException, CancelException {
    BuyStorageBytesContract contract = createBuyStorageBytesContract(ownerAddress, bytes);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction(contract);
    return processTransactionExtention(transactionExtention);
  }

  public boolean sellStorage(byte[] ownerAddress, long storageBytes)
      throws CipherException, IOException, CancelException {
    SellStorageContract contract = createSellStorageContract(ownerAddress, storageBytes);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction(contract);
    return processTransactionExtention(transactionExtention);
  }

  private FreezeBalanceContract createFreezeBalanceContract(
      byte[] address,
      long frozen_balance,
      long frozen_duration,
      int resourceCode,
      byte[] receiverAddress) {
    if (address == null) {
      address = getAddress();
    }

    FreezeBalanceContract.Builder builder = FreezeBalanceContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder
        .setOwnerAddress(byteAddress)
        .setFrozenBalance(frozen_balance)
        .setFrozenDuration(frozen_duration)
        .setResourceValue(resourceCode);

    if (receiverAddress != null) {
      ByteString receiverAddressBytes =
          ByteString.copyFrom(Objects.requireNonNull(receiverAddress));
      builder.setReceiverAddress(receiverAddressBytes);
    }
    return builder.build();
  }

  private BuyStorageContract createBuyStorageContract(byte[] address, long quantity) {
    if (address == null) {
      address = getAddress();
    }

    BuyStorageContract.Builder builder = BuyStorageContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddress).setQuant(quantity);

    return builder.build();
  }

  private BuyStorageBytesContract createBuyStorageBytesContract(byte[] address, long bytes) {
    if (address == null) {
      address = getAddress();
    }

    BuyStorageBytesContract.Builder builder =
        BuyStorageBytesContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddress).setBytes(bytes);

    return builder.build();
  }

  private SellStorageContract createSellStorageContract(byte[] address, long storageBytes) {
    if (address == null) {
      address = getAddress();
    }

    SellStorageContract.Builder builder = SellStorageContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddress).setStorageBytes(storageBytes);

    return builder.build();
  }

  public boolean unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    UnfreezeBalanceContract contract =
        createUnfreezeBalanceContract(ownerAddress, resourceCode, receiverAddress);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  private UnfreezeBalanceContract createUnfreezeBalanceContract(
      byte[] address, int resourceCode, byte[] receiverAddress) {
    if (address == null) {
      address = getAddress();
    }

    UnfreezeBalanceContract.Builder builder =
        UnfreezeBalanceContract.newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess).setResourceValue(resourceCode);

    if (receiverAddress != null) {
      ByteString receiverAddressBytes =
          ByteString.copyFrom(Objects.requireNonNull(receiverAddress));
      builder.setReceiverAddress(receiverAddressBytes);
    }

    return builder.build();
  }

  public boolean unfreezeAsset(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    UnfreezeAssetContract contract = createUnfreezeAssetContract(ownerAddress);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  private UnfreezeAssetContract createUnfreezeAssetContract(byte[] address) {
    if (address == null) {
      address = getAddress();
    }

    UnfreezeAssetContract.Builder builder = UnfreezeAssetContract.newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess);
    return builder.build();
  }

  public boolean withdrawBalance(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    WithdrawBalanceContract contract = createWithdrawBalanceContract(ownerAddress);
    if (rpcVersion == 2) {
      TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createTransaction2(contract);
      return processTransactionExtention(transactionExtention);
    } else {
      Transaction transaction = GrpcClientHolder.getGrpcClient().createTransaction(contract);
      return processTransaction(transaction);
    }
  }

  private WithdrawBalanceContract createWithdrawBalanceContract(byte[] address) {
    if (address == null) {
      address = getAddress();
    }

    WithdrawBalanceContract.Builder builder =
        WithdrawBalanceContract.newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess);

    return builder.build();
  }

  public static Optional<Block> getBlockById(String blockID) {
    return GrpcClientHolder.getGrpcClient().getBlockById(blockID);
  }

  public static Optional<BlockList> getBlockByLimitNext(long start, long end) {
    return GrpcClientHolder.getGrpcClient().getBlockByLimitNext(start, end);
  }

  public static Optional<BlockListExtention> getBlockByLimitNext2(long start, long end) {
    return GrpcClientHolder.getGrpcClient().getBlockByLimitNext2(start, end);
  }

  public static Optional<BlockList> getBlockByLatestNum(long num) {
    return GrpcClientHolder.getGrpcClient().getBlockByLatestNum(num);
  }

  public static Optional<BlockListExtention> getBlockByLatestNum2(long num) {
    return GrpcClientHolder.getGrpcClient().getBlockByLatestNum2(num);
  }

  public boolean createProposal(byte[] owner, HashMap<Long, Long> parametersMap)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ProposalCreateContract contract = createProposalCreateContract(owner, parametersMap);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().proposalCreate(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static Optional<ProposalList> listProposals() {
    return GrpcClientHolder.getGrpcClient().listProposals();
  }

  public static Optional<Proposal> getProposal(String id) {
    return GrpcClientHolder.getGrpcClient().getProposal(id);
  }

  public static Optional<DelegatedResourceList> getDelegatedResource(
      String fromAddress, String toAddress) {
    return GrpcClientHolder.getGrpcClient().getDelegatedResource(fromAddress, toAddress);
  }

  public static Optional<DelegatedResourceAccountIndex> getDelegatedResourceAccountIndex(
      String address) {
    return GrpcClientHolder.getGrpcClient().getDelegatedResourceAccountIndex(address);
  }

  public static Optional<ExchangeList> listExchanges() {
    return GrpcClientHolder.getGrpcClient().listExchanges();
  }

  public static Optional<Exchange> getExchange(String id) {
    return GrpcClientHolder.getGrpcClient().getExchange(id);
  }

  public static Optional<ChainParameters> getChainParameters() {
    return GrpcClientHolder.getGrpcClient().getChainParameters();
  }

  public static ProposalCreateContract createProposalCreateContract(
      byte[] owner, HashMap<Long, Long> parametersMap) {
    ProposalCreateContract.Builder builder = ProposalCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.putAllParameters(parametersMap);
    return builder.build();
  }

  public boolean approveProposal(byte[] owner, long id, boolean is_add_approval)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ProposalApproveContract contract =
        createProposalApproveContract(owner, id, is_add_approval);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().proposalApprove(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ProposalApproveContract createProposalApproveContract(
      byte[] owner, long id, boolean is_add_approval) {
    ProposalApproveContract.Builder builder =
        ProposalApproveContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setProposalId(id);
    builder.setIsAddApproval(is_add_approval);
    return builder.build();
  }

  public boolean deleteProposal(byte[] owner, long id)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ProposalDeleteContract contract = createProposalDeleteContract(owner, id);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().proposalDelete(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ProposalDeleteContract createProposalDeleteContract(
      byte[] owner, long id) {
    ProposalDeleteContract.Builder builder = ProposalDeleteContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setProposalId(id);
    return builder.build();
  }

  public boolean exchangeCreate(
      byte[] owner,
      byte[] firstTokenId,
      long firstTokenBalance,
      byte[] secondTokenId,
      long secondTokenBalance)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ExchangeCreateContract contract =
        createExchangeCreateContract(
            owner, firstTokenId, firstTokenBalance, secondTokenId, secondTokenBalance);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().exchangeCreate(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ExchangeCreateContract createExchangeCreateContract(
      byte[] owner,
      byte[] firstTokenId,
      long firstTokenBalance,
      byte[] secondTokenId,
      long secondTokenBalance) {
    ExchangeCreateContract.Builder builder = ExchangeCreateContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setFirstTokenId(ByteString.copyFrom(firstTokenId))
        .setFirstTokenBalance(firstTokenBalance)
        .setSecondTokenId(ByteString.copyFrom(secondTokenId))
        .setSecondTokenBalance(secondTokenBalance);
    return builder.build();
  }

  public boolean exchangeInject(byte[] owner, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ExchangeInjectContract contract =
        createExchangeInjectContract(owner, exchangeId, tokenId, quant);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().exchangeInject(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ExchangeInjectContract createExchangeInjectContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant) {
    ExchangeInjectContract.Builder builder = ExchangeInjectContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant);
    return builder.build();
  }

  public boolean exchangeWithdraw(byte[] owner, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ExchangeWithdrawContract contract =
        createExchangeWithdrawContract(owner, exchangeId, tokenId, quant);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().exchangeWithdraw(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ExchangeWithdrawContract createExchangeWithdrawContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant) {
    ExchangeWithdrawContract.Builder builder =
        ExchangeWithdrawContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant);
    return builder.build();
  }

  public boolean exchangeTransaction(
      byte[] owner, long exchangeId, byte[] tokenId, long quant, long expected)
      throws CipherException, IOException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ExchangeTransactionContract contract =
        createExchangeTransactionContract(owner, exchangeId, tokenId, quant, expected);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().exchangeTransaction(contract);
    return processTransactionExtention(transactionExtention);
  }

  public static ExchangeTransactionContract createExchangeTransactionContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant, long expected) {
    ExchangeTransactionContract.Builder builder =
        ExchangeTransactionContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant)
        .setExpected(expected);
    return builder.build();
  }

  public static SmartContract.ABI.Entry.EntryType getEntryType(String type) {
    switch (type) {
      case "constructor":
        return SmartContract.ABI.Entry.EntryType.Constructor;
      case "function":
        return SmartContract.ABI.Entry.EntryType.Function;
      case "event":
        return SmartContract.ABI.Entry.EntryType.Event;
      case "fallback":
        return SmartContract.ABI.Entry.EntryType.Fallback;
      default:
        return SmartContract.ABI.Entry.EntryType.UNRECOGNIZED;
    }
  }

  public static SmartContract.ABI.Entry.StateMutabilityType getStateMutability(
      String stateMutability) {
    switch (stateMutability) {
      case "pure":
        return SmartContract.ABI.Entry.StateMutabilityType.Pure;
      case "view":
        return SmartContract.ABI.Entry.StateMutabilityType.View;
      case "nonpayable":
        return SmartContract.ABI.Entry.StateMutabilityType.Nonpayable;
      case "payable":
        return SmartContract.ABI.Entry.StateMutabilityType.Payable;
      default:
        return SmartContract.ABI.Entry.StateMutabilityType.UNRECOGNIZED;
    }
  }

  public static SmartContract.ABI jsonStr2ABI(String jsonStr) {
    if (jsonStr == null) {
      return null;
    }

    JsonParser jsonParser = new JsonParser();
    JsonElement jsonElementRoot = jsonParser.parse(jsonStr);
    JsonArray jsonRoot = jsonElementRoot.getAsJsonArray();
    SmartContract.ABI.Builder abiBuilder = SmartContract.ABI.newBuilder();
    for (int index = 0; index < jsonRoot.size(); index++) {
      JsonElement abiItem = jsonRoot.get(index);
      boolean anonymous =
          abiItem.getAsJsonObject().get("anonymous") != null
              ? abiItem.getAsJsonObject().get("anonymous").getAsBoolean()
              : false;
      boolean constant =
          abiItem.getAsJsonObject().get("constant") != null
              ? abiItem.getAsJsonObject().get("constant").getAsBoolean()
              : false;
      String name =
          abiItem.getAsJsonObject().get("name") != null
              ? abiItem.getAsJsonObject().get("name").getAsString()
              : null;
      JsonArray inputs =
          abiItem.getAsJsonObject().get("inputs") != null
              ? abiItem.getAsJsonObject().get("inputs").getAsJsonArray()
              : null;
      JsonArray outputs =
          abiItem.getAsJsonObject().get("outputs") != null
              ? abiItem.getAsJsonObject().get("outputs").getAsJsonArray()
              : null;
      String type =
          abiItem.getAsJsonObject().get("type") != null
              ? abiItem.getAsJsonObject().get("type").getAsString()
              : null;
      boolean payable =
          abiItem.getAsJsonObject().get("payable") != null
              ? abiItem.getAsJsonObject().get("payable").getAsBoolean()
              : false;
      String stateMutability =
          abiItem.getAsJsonObject().get("stateMutability") != null
              ? abiItem.getAsJsonObject().get("stateMutability").getAsString()
              : null;
      if (type == null) {
        System.out.println("No type!");
        return null;
      }
      if (!type.equalsIgnoreCase("fallback") && null == inputs) {
        System.out.println("No inputs!");
        return null;
      }

      SmartContract.ABI.Entry.Builder entryBuilder = SmartContract.ABI.Entry.newBuilder();
      entryBuilder.setAnonymous(anonymous);
      entryBuilder.setConstant(constant);
      if (name != null) {
        entryBuilder.setName(name);
      }

      /* { inputs : optional } since fallback function not requires inputs*/
      if (null != inputs) {
        for (int j = 0; j < inputs.size(); j++) {
          JsonElement inputItem = inputs.get(j);
          if (inputItem.getAsJsonObject().get("name") == null
              || inputItem.getAsJsonObject().get("type") == null) {
            System.out.println("Input argument invalid due to no name or no type!");
            return null;
          }
          String inputName = inputItem.getAsJsonObject().get("name").getAsString();
          String inputType = inputItem.getAsJsonObject().get("type").getAsString();
          Boolean inputIndexed = false;
          if (inputItem.getAsJsonObject().get("indexed") != null) {
            inputIndexed =
                Boolean.valueOf(inputItem.getAsJsonObject().get("indexed").getAsString());
          }
          SmartContract.ABI.Entry.Param.Builder paramBuilder =
              SmartContract.ABI.Entry.Param.newBuilder();
          paramBuilder.setIndexed(inputIndexed);
          paramBuilder.setName(inputName);
          paramBuilder.setType(inputType);
          entryBuilder.addInputs(paramBuilder.build());
        }
      }

      /* { outputs : optional } */
      if (outputs != null) {
        for (int k = 0; k < outputs.size(); k++) {
          JsonElement outputItem = outputs.get(k);
          if (outputItem.getAsJsonObject().get("name") == null
              || outputItem.getAsJsonObject().get("type") == null) {
            System.out.println("Output argument invalid due to no name or no type!");
            return null;
          }
          String outputName = outputItem.getAsJsonObject().get("name").getAsString();
          String outputType = outputItem.getAsJsonObject().get("type").getAsString();
          Boolean outputIndexed = false;
          if (outputItem.getAsJsonObject().get("indexed") != null) {
            outputIndexed =
                Boolean.valueOf(outputItem.getAsJsonObject().get("indexed").getAsString());
          }
          SmartContract.ABI.Entry.Param.Builder paramBuilder =
              SmartContract.ABI.Entry.Param.newBuilder();
          paramBuilder.setIndexed(outputIndexed);
          paramBuilder.setName(outputName);
          paramBuilder.setType(outputType);
          entryBuilder.addOutputs(paramBuilder.build());
        }
      }

      entryBuilder.setType(getEntryType(type));
      entryBuilder.setPayable(payable);
      if (stateMutability != null) {
        entryBuilder.setStateMutability(getStateMutability(stateMutability));
      }

      abiBuilder.addEntrys(entryBuilder.build());
    }

    return abiBuilder.build();
  }

  public static UpdateSettingContract createUpdateSettingContract(
      byte[] owner, byte[] contractAddress, long consumeUserResourcePercent) {

    UpdateSettingContract.Builder builder = UpdateSettingContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setConsumeUserResourcePercent(consumeUserResourcePercent);
    return builder.build();
  }

  public static UpdateEnergyLimitContract createUpdateEnergyLimitContract(
      byte[] owner, byte[] contractAddress, long originEnergyLimit) {

    UpdateEnergyLimitContract.Builder builder =
        UpdateEnergyLimitContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setOriginEnergyLimit(originEnergyLimit);
    return builder.build();
  }

  public static ClearABIContract createClearABIContract(
      byte[] owner, byte[] contractAddress) {

    ClearABIContract.Builder builder = ClearABIContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    return builder.build();
  }

  public static CreateSmartContract createContractDeployContract(
      String contractName,
      byte[] address,
      String ABI,
      String code,
      long value,
      long consumeUserResourcePercent,
      long originEnergyLimit,
      long tokenValue,
      String tokenId,
      String libraryAddressPair,
      String compilerVersion) {
    SmartContract.ABI abi = jsonStr2ABI(ABI);
    if (abi == null) {
      System.out.println("abi is null");
      return null;
    }

    SmartContract.Builder builder = SmartContract.newBuilder();
    builder.setName(contractName);
    builder.setOriginAddress(ByteString.copyFrom(address));
    builder.setAbi(abi);
    builder
        .setConsumeUserResourcePercent(consumeUserResourcePercent)
        .setOriginEnergyLimit(originEnergyLimit);

    if (value != 0) {

      builder.setCallValue(value);
    }
    byte[] byteCode;
    if (null != libraryAddressPair) {
      byteCode = replaceLibraryAddress(code, libraryAddressPair, compilerVersion);
    } else {
      byteCode = Hex.decode(code);
    }

    builder.setBytecode(ByteString.copyFrom(byteCode));
    CreateSmartContract.Builder createSmartContractBuilder = CreateSmartContract.newBuilder();
    createSmartContractBuilder
        .setOwnerAddress(ByteString.copyFrom(address))
        .setNewContract(builder.build());
    if (tokenId != null && !tokenId.equalsIgnoreCase("") && !tokenId.equalsIgnoreCase("#")) {
      createSmartContractBuilder.setCallTokenValue(tokenValue).setTokenId(Long.parseLong(tokenId));
    }
    return createSmartContractBuilder.build();
  }

  private static byte[] replaceLibraryAddress(
      String code, String libraryAddressPair, String compilerVersion) {

    String[] libraryAddressList = libraryAddressPair.split("[,]");

    for (int i = 0; i < libraryAddressList.length; i++) {
      String cur = libraryAddressList[i];

      int lastPosition = cur.lastIndexOf(":");
      if (-1 == lastPosition) {
        throw new RuntimeException("libraryAddress delimit by ':'");
      }
      String libraryName = cur.substring(0, lastPosition);
      String addr = cur.substring(lastPosition + 1);
      String libraryAddressHex;
      try {
        libraryAddressHex =
            (new String(Hex.encode(WalletApi.decodeFromBase58Check(addr)), "US-ASCII"))
                .substring(2);
      } catch (UnsupportedEncodingException e) {
        throw new RuntimeException(e); // now ignore
      }

      String beReplaced;
      if (compilerVersion == null) {
        // old version
        String repeated = new String(new char[40 - libraryName.length() - 2]).replace("\0", "_");
        beReplaced = "__" + libraryName + repeated;
      } else if (compilerVersion.equalsIgnoreCase("v5")) {
        // 0.5.4 version
        String libraryNameKeccak256 =
            ByteArray.toHexString(Hash.sha3(ByteArray.fromString(libraryName))).substring(0, 34);
        beReplaced = "__\\$" + libraryNameKeccak256 + "\\$__";
      } else {
        throw new RuntimeException("unknown compiler version.");
      }

      Matcher m = Pattern.compile(beReplaced).matcher(code);
      code = m.replaceAll(libraryAddressHex);
    }

    return Hex.decode(code);
  }

  public static TriggerSmartContract triggerCallContract(
      byte[] address,
      byte[] contractAddress,
      long callValue,
      byte[] data,
      long tokenValue,
      String tokenId) {
    TriggerSmartContract.Builder builder = TriggerSmartContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(address));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setData(ByteString.copyFrom(data));
    builder.setCallValue(callValue);
    if (tokenId != null && tokenId != "") {
      builder.setCallTokenValue(tokenValue);
      builder.setTokenId(Long.parseLong(tokenId));
    }
    return builder.build();
  }

  public byte[] generateContractAddress(byte[] ownerAddress, Transaction trx) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }

  public boolean updateSetting(
      byte[] owner, byte[] contractAddress, long consumeUserResourcePercent)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    UpdateSettingContract updateSettingContract =
        createUpdateSettingContract(owner, contractAddress, consumeUserResourcePercent);

    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().updateSetting(updateSettingContract);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx failed!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention);
  }

  public boolean updateEnergyLimit(byte[] owner, byte[] contractAddress, long originEnergyLimit)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    UpdateEnergyLimitContract updateEnergyLimitContract =
        createUpdateEnergyLimitContract(owner, contractAddress, originEnergyLimit);

    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().updateEnergyLimit(updateEnergyLimitContract);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx failed!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention);
  }

  public boolean clearContractABI(byte[] owner, byte[] contractAddress)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    ClearABIContract clearABIContract = createClearABIContract(owner, contractAddress);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().clearContractABI(clearABIContract);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx failed!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention);
  }

  public boolean deployContract(
      byte[] owner,
      String contractName,
      String ABI,
      String code,
      long feeLimit,
      long value,
      long consumeUserResourcePercent,
      long originEnergyLimit,
      long tokenValue,
      String tokenId,
      String libraryAddressPair,
      String compilerVersion)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    CreateSmartContract contractDeployContract =
        createContractDeployContract(
            contractName,
            owner,
            ABI,
            code,
            value,
            consumeUserResourcePercent,
            originEnergyLimit,
            tokenValue,
            tokenId,
            libraryAddressPair,
            compilerVersion);

    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().deployContract(contractDeployContract);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx failed!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    TransactionExtention.Builder texBuilder = TransactionExtention.newBuilder();
    Transaction.Builder transBuilder = Transaction.newBuilder();
    Transaction.raw.Builder rawBuilder =
        transactionExtention.getTransaction().getRawData().toBuilder();
    rawBuilder.setFeeLimit(feeLimit);
    transBuilder.setRawData(rawBuilder);
    for (int i = 0; i < transactionExtention.getTransaction().getSignatureCount(); i++) {
      ByteString s = transactionExtention.getTransaction().getSignature(i);
      transBuilder.setSignature(i, s);
    }
    for (int i = 0; i < transactionExtention.getTransaction().getRetCount(); i++) {
      Result r = transactionExtention.getTransaction().getRet(i);
      transBuilder.setRet(i, r);
    }
    texBuilder.setTransaction(transBuilder);
    texBuilder.setResult(transactionExtention.getResult());
    texBuilder.setTxid(transactionExtention.getTxid());
    transactionExtention = texBuilder.build();

    //    byte[] contractAddress = generateContractAddress(transactionExtention.getTransaction());
    //    System.out.println(
    //        "Your smart contract address will be: " + WalletApi.encode58Check(contractAddress));
    return processTransactionExtention(transactionExtention);
  }

  public boolean triggerContract(
      byte[] owner,
      byte[] contractAddress,
      long callValue,
      byte[] data,
      long feeLimit,
      long tokenValue,
      String tokenId,
      boolean isConstant)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    TriggerSmartContract triggerContract =
        triggerCallContract(owner, contractAddress, callValue, data, tokenValue, tokenId);
    TransactionExtention transactionExtention;
    if (isConstant) {
      transactionExtention = GrpcClientHolder.getGrpcClient().triggerConstantContract(triggerContract);
    } else {
      transactionExtention = GrpcClientHolder.getGrpcClient().triggerContract(triggerContract);
    }

    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create call trx failed!");
      System.out.println("Code = " + transactionExtention.getResult().getCode());
      System.out.println(
          "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      return false;
    }

    Transaction transaction = transactionExtention.getTransaction();
    // for constant
    if (transaction.getRetCount() != 0
        && transactionExtention.getConstantResult(0) != null
        && transactionExtention.getResult() != null) {
      byte[] result = transactionExtention.getConstantResult(0).toByteArray();
      System.out.println("message:" + transaction.getRet(0).getRet());
      System.out.println(
          ":" + ByteArray.toStr(transactionExtention.getResult().getMessage().toByteArray()));
      System.out.println("Result:" + Hex.toHexString(result));
      return true;
    }

    TransactionExtention.Builder texBuilder = TransactionExtention.newBuilder();
    Transaction.Builder transBuilder = Transaction.newBuilder();
    Transaction.raw.Builder rawBuilder =
        transactionExtention.getTransaction().getRawData().toBuilder();
    rawBuilder.setFeeLimit(feeLimit);
    transBuilder.setRawData(rawBuilder);
    for (int i = 0; i < transactionExtention.getTransaction().getSignatureCount(); i++) {
      ByteString s = transactionExtention.getTransaction().getSignature(i);
      transBuilder.setSignature(i, s);
    }
    for (int i = 0; i < transactionExtention.getTransaction().getRetCount(); i++) {
      Result r = transactionExtention.getTransaction().getRet(i);
      transBuilder.setRet(i, r);
    }
    texBuilder.setTransaction(transBuilder);
    texBuilder.setResult(transactionExtention.getResult());
    texBuilder.setTxid(transactionExtention.getTxid());
    transactionExtention = texBuilder.build();

    return processTransactionExtention(transactionExtention);
  }

  public static SmartContract getContract(byte[] address) {
    return GrpcClientHolder.getGrpcClient().getContract(address);
  }

  public boolean accountPermissionUpdate(byte[] owner, String permissionJson)
      throws CipherException, IOException, CancelException {
    AccountPermissionUpdateContract contract =
        createAccountPermissionContract(owner, permissionJson);
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().accountPermissionUpdate(contract);
    return processTransactionExtention(transactionExtention);
  }

  private Permission json2Permission(JSONObject json) {
    Permission.Builder permissionBuilder = Permission.newBuilder();
    if (json.containsKey("type")) {
      int type = json.getInteger("type");
      permissionBuilder.setTypeValue(type);
    }
    if (json.containsKey("permission_name")) {
      String permission_name = json.getString("permission_name");
      permissionBuilder.setPermissionName(permission_name);
    }
    if (json.containsKey("threshold")) {
      long threshold = json.getLong("threshold");
      permissionBuilder.setThreshold(threshold);
    }
    if (json.containsKey("parent_id")) {
      int parent_id = json.getInteger("parent_id");
      permissionBuilder.setParentId(parent_id);
    }
    if (json.containsKey("operations")) {
      byte[] operations = ByteArray.fromHexString(json.getString("operations"));
      permissionBuilder.setOperations(ByteString.copyFrom(operations));
    }
    if (json.containsKey("keys")) {
      JSONArray keys = json.getJSONArray("keys");
      List<Key> keyList = new ArrayList<>();
      for (int i = 0; i < keys.size(); i++) {
        Key.Builder keyBuilder = Key.newBuilder();
        JSONObject key = keys.getJSONObject(i);
        String address = key.getString("address");
        long weight = key.getLong("weight");
        keyBuilder.setAddress(ByteString.copyFrom(WalletApi.decode58Check(address)));
        keyBuilder.setWeight(weight);
        keyList.add(keyBuilder.build());
      }
      permissionBuilder.addAllKeys(keyList);
    }
    return permissionBuilder.build();
  }

  public AccountPermissionUpdateContract createAccountPermissionContract(
      byte[] owner, String permissionJson) {
    AccountPermissionUpdateContract.Builder builder =
        AccountPermissionUpdateContract.newBuilder();

    JSONObject permissions = JSONObject.parseObject(permissionJson);
    JSONObject owner_permission = permissions.getJSONObject("owner_permission");
    JSONObject witness_permission = permissions.getJSONObject("witness_permission");
    JSONArray active_permissions = permissions.getJSONArray("active_permissions");

    if (owner_permission != null) {
      Permission ownerPermission = json2Permission(owner_permission);
      builder.setOwner(ownerPermission);
    }
    if (witness_permission != null) {
      Permission witnessPermission = json2Permission(witness_permission);
      builder.setWitness(witnessPermission);
    }
    if (active_permissions != null) {
      List<Permission> activePermissionList = new ArrayList<>();
      for (int j = 0; j < active_permissions.size(); j++) {
        JSONObject permission = active_permissions.getJSONObject(j);
        activePermissionList.add(json2Permission(permission));
      }
      builder.addAllActives(activePermissionList);
    }
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    return builder.build();
  }

  public Transaction addTransactionSign(Transaction transaction)
      throws CipherException, IOException, CancelException {
    if (transaction.getRawData().getTimestamp() == 0) {
      transaction = TransactionUtils.setTimestamp(transaction);
    }
    transaction = TransactionUtils.setExpirationTime(transaction);
    System.out.println("Please input permission id.");
    transaction = TransactionUtils.setPermissionId(transaction);

    System.out.println("Please choose your key for sign.");
    WalletFile walletFile = selcetWalletFileE();
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(password);
    org.tron.keystore.StringUtils.clear(password);

    if (isEckey) {
      transaction = TransactionUtils.sign(transaction, this.getEcKey(walletFile, passwd));
    } else {
      transaction = TransactionUtils.sign(transaction, this.getSM2(walletFile, passwd));
    }
    org.tron.keystore.StringUtils.clear(passwd);
    return transaction;
  }

  public static Optional<IncrementalMerkleVoucherInfo> GetMerkleTreeVoucherInfo(
      OutputPointInfo info, boolean showErrorMsg) {
    if (showErrorMsg) {
      try {
        return Optional.of(GrpcClientHolder.getGrpcClient().GetMerkleTreeVoucherInfo(info));
      } catch (Exception e) {
        if (showErrorMsg) {
          Status status = Status.fromThrowable(e);
          System.out.println("GetMerkleTreeVoucherInfo failed,error " + status.getDescription());
        }
      }
    } else {
      return Optional.of(GrpcClientHolder.getGrpcClient().GetMerkleTreeVoucherInfo(info));
    }
    return Optional.empty();
  }

  public static Optional<DecryptNotes> scanNoteByIvk(
      IvkDecryptParameters ivkDecryptParameters, boolean showErrorMsg) {
    if (showErrorMsg) {
      try {
        return Optional.of(GrpcClientHolder.getGrpcClient().scanNoteByIvk(ivkDecryptParameters));
      } catch (Exception e) {
        if (showErrorMsg) {
          Status status = Status.fromThrowable(e);
          System.out.println("scanNoteByIvk failed,error " + status.getDescription());
        }
      }
    } else {
      return Optional.of(GrpcClientHolder.getGrpcClient().scanNoteByIvk(ivkDecryptParameters));
    }
    return Optional.empty();
  }

  public static Optional<DecryptNotes> scanNoteByOvk(
      OvkDecryptParameters ovkDecryptParameters, boolean showErrorMsg) {
    if (showErrorMsg) {
      try {
        return Optional.of(GrpcClientHolder.getGrpcClient().scanNoteByOvk(ovkDecryptParameters));
      } catch (Exception e) {
        if (showErrorMsg) {
          Status status = Status.fromThrowable(e);
          System.out.println("scanNoteByOvk failed,error " + status.getDescription());
        }
      }
    } else {
      return Optional.of(GrpcClientHolder.getGrpcClient().scanNoteByOvk(ovkDecryptParameters));
    }
    return Optional.empty();
  }

  public static Optional<BytesMessage> getSpendingKey() {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getSpendingKey());
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getSpendingKey failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<ExpandedSpendingKeyMessage> getExpandedSpendingKey(
      BytesMessage spendingKey) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getExpandedSpendingKey(spendingKey));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getExpandedSpendingKey failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<BytesMessage> getAkFromAsk(BytesMessage ask) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getAkFromAsk(ask));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getAkFromAsk failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<BytesMessage> getNkFromNsk(BytesMessage nsk) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getNkFromNsk(nsk));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getNkFromNsk failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<IncomingViewingKeyMessage> getIncomingViewingKey(
      ViewingKeyMessage viewingKeyMessage) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getIncomingViewingKey(viewingKeyMessage));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getIncomingViewingKey failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<DiversifierMessage> getDiversifier() {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getDiversifier());
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getDiversifier failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static boolean sendShieldedCoin(PrivateParameters privateParameters, WalletApi wallet)
      throws CipherException, IOException, CancelException {
    TransactionExtention transactionExtention = GrpcClientHolder.getGrpcClient().createShieldedTransaction(privateParameters);
    return processShieldedTransaction(transactionExtention, wallet);
  }

  public static boolean sendShieldedCoinWithoutAsk(
      PrivateParametersWithoutAsk privateParameters, byte[] ask, WalletApi wallet)
      throws CipherException, IOException, CancelException {
    TransactionExtention transactionExtention =
        GrpcClientHolder.getGrpcClient().createShieldedTransactionWithoutSpendAuthSig(privateParameters);
    if (transactionExtention == null) {
      System.out.println("sendShieldedCoinWithoutAsk failure.");
      return false;
    }

    BytesMessage trxHash = GrpcClientHolder.getGrpcClient().getShieldedTransactionHash(transactionExtention.getTransaction());
    if (trxHash == null || trxHash.getValue().toByteArray().length != 32) {
      System.out.println("sendShieldedCoinWithoutAsk get transaction hash failure.");
      return false;
    }

    Transaction transaction = transactionExtention.getTransaction();
    if (transaction.getRawData().getContract(0).getType()
        != ContractType.ShieldedTransferContract) {
      System.out.println("This method only for ShieldedTransferContract, please check!");
      return false;
    }

    Any any = transaction.getRawData().getContract(0).getParameter();
    ShieldedTransferContract shieldContract = any.unpack(ShieldedTransferContract.class);
    List<SpendDescription> spendDescList = shieldContract.getSpendDescriptionList();
    ShieldedTransferContract.Builder contractBuild =
        shieldContract.toBuilder().clearSpendDescription();
    for (int i = 0; i < spendDescList.size(); i++) {
      SpendDescription.Builder spendDescription = spendDescList.get(i).toBuilder();
      SpendAuthSigParameters.Builder builder = SpendAuthSigParameters.newBuilder();
      builder.setAsk(ByteString.copyFrom(ask));
      builder.setTxHash(ByteString.copyFrom(trxHash.getValue().toByteArray()));
      builder.setAlpha(privateParameters.getShieldedSpends(i).getAlpha());

      BytesMessage authSig = GrpcClientHolder.getGrpcClient().createSpendAuthSig(builder.build());
      spendDescription.setSpendAuthoritySignature(
          ByteString.copyFrom(authSig.getValue().toByteArray()));

      contractBuild.addSpendDescription(spendDescription.build());
    }

    Transaction.raw.Builder rawBuilder =
        transaction
            .toBuilder()
            .getRawDataBuilder()
            .clearContract()
            .addContract(
                Transaction.Contract.newBuilder()
                    .setType(ContractType.ShieldedTransferContract)
                    .setParameter(Any.pack(contractBuild.build()))
                    .build());

    transaction = transaction.toBuilder().clearRawData().setRawData(rawBuilder).build();

    transactionExtention = transactionExtention.toBuilder().setTransaction(transaction).build();

    return processShieldedTransaction(transactionExtention, wallet);
  }

  public static Optional<SpendResult> isNoteSpend(
      NoteParameters noteParameters, boolean showErrorMsg) {
    if (showErrorMsg) {
      try {
        return Optional.of(GrpcClientHolder.getGrpcClient().isNoteSpend(noteParameters));
      } catch (Exception e) {
        if (showErrorMsg) {
          Status status = Status.fromThrowable(e);
          System.out.println("isNoteSpend failed,error " + status.getDescription());
        }
      }
    } else {
      return Optional.of(GrpcClientHolder.getGrpcClient().isNoteSpend(noteParameters));
    }
    return Optional.empty();
  }

  public static Optional<BytesMessage> getRcm() {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getRcm());
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getRcm failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<BytesMessage> createShieldedNullifier(NfParameters parameters) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().createShieldedNullifier(parameters));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("createShieldedNullifier failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<PaymentAddressMessage> getZenPaymentAddress(
      IncomingViewingKeyDiversifierMessage msg) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().getZenPaymentAddress(msg));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("getZenPaymentAddress failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public static Optional<DecryptNotesMarked> scanAndMarkNoteByIvk(
      IvkDecryptAndMarkParameters parameters) {
    try {
      return Optional.of(GrpcClientHolder.getGrpcClient().scanAndMarkNoteByIvk(parameters));
    } catch (Exception e) {
      Status status = Status.fromThrowable(e);
      System.out.println("scanAndMarkNoteByIvk failed,error " + status.getDescription());
    }
    return Optional.empty();
  }

  public boolean updateBrokerage(byte[] owner, int brokerage)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    UpdateBrokerageContract.Builder updateBrokerageContract = UpdateBrokerageContract.newBuilder();
    updateBrokerageContract.setOwnerAddress(ByteString.copyFrom(owner)).setBrokerage(brokerage);
    TransactionExtention transactionExtention =
        GrpcClientHolder.getGrpcClient().updateBrokerage(updateBrokerageContract.build());
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx failed!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention);
  }

  public static NumberMessage getReward(byte[] owner) {
    return GrpcClientHolder.getGrpcClient().getReward(owner);
  }

  public static NumberMessage getBrokerage(byte[] owner) {
    return GrpcClientHolder.getGrpcClient().getBrokerage(owner);
  }
}
