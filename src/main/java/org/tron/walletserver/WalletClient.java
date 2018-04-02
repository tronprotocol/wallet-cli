package org.tron.walletserver;

import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import com.typesafe.config.Config;
import java.io.File;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.AccountList;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.SymmEncoder;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.FileUtil;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.core.config.Parameter.CommonConstant;
import org.tron.protos.Contract;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;

public class WalletClient {

  private static final Logger logger = LoggerFactory.getLogger("WalletClient");
  private static final String FilePath = "Wallet";
  private ECKey ecKey = null;
  private boolean loginState = false;

  private static GrpcClient rpcCli = init();
  private static String dbPath;
  private static String txtPath;

  public static GrpcClient init() {
    Config config = Configuration.getByPath("config.conf");
    dbPath = config.getString("CityDb.DbPath");
    txtPath = System.getProperty("user.dir") + '/' + config.getString("CityDb.TxtPath");

    List<String> fullnodelist = config.getStringList("fullnode.ip.list");
    return new GrpcClient(fullnodelist.get(0));
  }

  public static String getDbPath() {
    return dbPath;
  }

  public static String getTxtPath() {
    return txtPath;
  }

  /**
   * Creates a new WalletClient with a random ECKey or no ECKey.
   */
  public WalletClient(boolean genEcKey) {
    if (genEcKey) {
      this.ecKey = new ECKey(Utils.getRandom());
    }
  }

  //  Create Wallet with a pritKey
  public WalletClient(String priKey) {
    ECKey temKey = null;
    try {
      BigInteger priK = new BigInteger(priKey, 16);
      temKey = ECKey.fromPrivate(priK);
    } catch (Exception ex) {
      ex.printStackTrace();
    }
    this.ecKey = temKey;
  }

  public boolean login(String password) {
    loginState = checkPassWord(password);
    return loginState;
  }

  public boolean isLoginState() {
    return loginState;
  }

  public void logout() {
    loginState = false;
  }

  /**
   * Get a Wallet from storage
   */
  public static WalletClient GetWalletByStorage(String password) {
    String priKeyEnced = loadPriKey();
    if (priKeyEnced == null) {
      return null;
    }
    //dec priKey
    byte[] priKeyAscEnced = priKeyEnced.getBytes();
    byte[] priKeyHexEnced = Hex.decode(priKeyAscEnced);
    byte[] aesKey = getEncKey(password);
    byte[] priKeyHexPlain = SymmEncoder.AES128EcbDec(priKeyHexEnced, aesKey);
    String priKeyPlain = Hex.toHexString(priKeyHexPlain);

    return new WalletClient(priKeyPlain);
  }

  /**
   * Creates a Wallet with an existing ECKey.
   */

  public WalletClient(final ECKey ecKey) {
    this.ecKey = ecKey;
  }

  public ECKey getEcKey() {
    return ecKey;
  }

  public byte[] getAddress() {
    return ecKey.getAddress();
  }

  public void store(String password) {
    if (ecKey == null || ecKey.getPrivKey() == null) {
      logger.warn("Warning: Store wallet failed, PrivKey is null !!");
      return;
    }
    byte[] pwd = getPassWord(password);
    String pwdAsc = ByteArray.toHexString(pwd);
    byte[] privKeyPlain = ecKey.getPrivKeyBytes();
    System.out.println("privKey:" + ByteArray.toHexString(privKeyPlain));
    //encrypted by password
    byte[] aseKey = getEncKey(password);
    byte[] privKeyEnced = SymmEncoder.AES128EcbEnc(privKeyPlain, aseKey);
    String privKeyStr = ByteArray.toHexString(privKeyEnced);
    byte[] pubKeyBytes = ecKey.getPubKey();
    String pubKeyStr = ByteArray.toHexString(pubKeyBytes);
    // SAVE PASSWORD
    FileUtil.saveData(FilePath, pwdAsc, false);//ofset:0 len:32
    // SAVE PUBKEY
    FileUtil.saveData(FilePath, pubKeyStr, true);//ofset:32 len:130
    // SAVE PRIKEY
    FileUtil.saveData(FilePath, privKeyStr, true);
  }

  public Account queryAccount() {
    byte[] address;
    if (this.ecKey == null) {
      String pubKey = loadPubKey(); //04 PubKey[128]
      if (pubKey == null || "".equals(pubKey)) {
        logger.warn("Warning: QueryAccount failed, no wallet address !!");
        return null;
      }
      byte[] pubKeyAsc = pubKey.getBytes();
      byte[] pubKeyHex = Hex.decode(pubKeyAsc);
      this.ecKey = ECKey.fromPublicOnly(pubKeyHex);
    }
    return queryAccount(getAddress());
  }

  public static Account queryAccount(byte[] address) {
    return rpcCli.queryAccount(address);//call rpc
  }

  private Transaction signTransaction(Transaction transaction) {
    if (this.ecKey == null || this.ecKey.getPrivKey() == null) {
      logger.warn("Warning: Can't sign,there is no private key !!");
      return null;
    }
    transaction = TransactionUtils.setTimestamp(transaction);
    return TransactionUtils.sign(transaction, this.ecKey);
  }

  public boolean sendCoin(byte[] to, long amount) {
    byte[] owner = getAddress();
    Contract.TransferContract contract = createTransferContract(to, owner, amount);
    Transaction transaction = rpcCli.createTransaction(contract);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public boolean transferAsset(byte[] to, byte[] assertName, long amount) {
    byte[] owner = getAddress();
    Transaction transaction = createTransferAssetTransaction(to, assertName, owner, amount);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public static Transaction createTransferAssetTransaction(byte[] to, byte[] assertName,
      byte[] owner, long amount) {
    Contract.TransferAssetContract contract = createTransferAssetContract(to, assertName, owner,
        amount);
    return rpcCli.createTransferAssetTransaction(contract);
  }

  public boolean participateAssetIssue(byte[] to, byte[] assertName, long amount) {
    byte[] owner = getAddress();
    Transaction transaction = participateAssetIssueTransaction(to, assertName, owner, amount);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public static Transaction participateAssetIssueTransaction(byte[] to, byte[] assertName,
      byte[] owner, long amount) {
    Contract.ParticipateAssetIssueContract contract = participateAssetIssueContract(to, assertName,
        owner,
        amount);
    return rpcCli.createParticipateAssetIssueTransaction(contract);
  }


  public boolean createAccount(AccountType accountType, byte[] accountName) {
    Transaction transaction = createAccountTransaction(accountType, accountName, getAddress());
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public static Transaction
  createAccountTransaction(AccountType accountType, byte[] accountName,
      byte[] address) {
    Contract.AccountCreateContract contract = createAccountCreateContract(accountType, accountName,
        address);
    return rpcCli.createAccount(contract);
  }

  public static boolean broadcastTransaction(byte[] transactionBytes)
      throws InvalidProtocolBufferException {
    Transaction transaction = Transaction.parseFrom(transactionBytes);
    if (false == TransactionUtils.validTransaction(transaction)) {
      return false;
    }
    return rpcCli.broadcastTransaction(transaction);
  }

  public boolean createAssetIssue(Contract.AssetIssueContract contract) {
    Transaction transaction = rpcCli.createAssetIssue(contract);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public boolean createWitness(byte[] url) {
    byte[] owner = getAddress();
    Transaction transaction = createWitnessTransaction(owner, url);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public static Transaction createWitnessTransaction(byte[] owner, byte[] url) {
    Contract.WitnessCreateContract contract = createWitnessCreateContract(owner, url);
    return rpcCli.createWitness(contract);
  }


  public static Transaction createVoteWitnessTransaction(byte[] owner,
      HashMap<String, String> witness) {
    Contract.VoteWitnessContract contract = createVoteWitnessContract(owner, witness);
    return rpcCli.voteWitnessAccount(contract);
  }

  public static Transaction createAssetIssueTransaction(Contract.AssetIssueContract contract) {
    return rpcCli.createAssetIssue(contract);
  }

  public static Block GetBlock(long blockNum) {
    return rpcCli.getBlock(blockNum);
  }

  public boolean voteWitness(HashMap<String, String> witness) {
    byte[] owner = getAddress();
    Contract.VoteWitnessContract contract = createVoteWitnessContract(owner, witness);
    Transaction transaction = rpcCli.voteWitnessAccount(contract);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }
    transaction = signTransaction(transaction);
    return rpcCli.broadcastTransaction(transaction);
  }

  public static Contract.TransferContract createTransferContract(byte[] to, byte[] owner,
      long amount) {
    Contract.TransferContract.Builder builder = Contract.TransferContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static Contract.TransferAssetContract createTransferAssetContract(byte[] to,
      byte[] assertName, byte[] owner,
      long amount) {
    Contract.TransferAssetContract.Builder builder = Contract.TransferAssetContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static Contract.ParticipateAssetIssueContract participateAssetIssueContract(byte[] to,
      byte[] assertName, byte[] owner,
      long amount) {
    Contract.ParticipateAssetIssueContract.Builder builder = Contract.ParticipateAssetIssueContract
        .newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static Transaction createTransaction4Transfer(Contract.TransferContract contract) {
    Transaction transaction = rpcCli.createTransaction(contract);
    return transaction;
  }

  public static Contract.AccountCreateContract createAccountCreateContract(AccountType accountType,
      byte[] accountName, byte[] address) {
    Contract.AccountCreateContract.Builder builder = Contract.AccountCreateContract.newBuilder();
    ByteString bsaAdress = ByteString.copyFrom(address);
    ByteString bsAccountName = ByteString.copyFrom(accountName);
    builder.setType(accountType);
    builder.setAccountName(bsAccountName);
    builder.setOwnerAddress(bsaAdress);

    return builder.build();
  }

  public static Contract.WitnessCreateContract createWitnessCreateContract(byte[] owner,
      byte[] url) {
    Contract.WitnessCreateContract.Builder builder = Contract.WitnessCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setUrl(ByteString.copyFrom(url));

    return builder.build();
  }

  public static Contract.VoteWitnessContract createVoteWitnessContract(byte[] owner,
      HashMap<String, String> witness) {
    Contract.VoteWitnessContract.Builder builder = Contract.VoteWitnessContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    for (String addressHex : witness.keySet()) {
      String value = witness.get(addressHex);
      long count = Long.parseLong(value);
      Contract.VoteWitnessContract.Vote.Builder voteBuilder = Contract.VoteWitnessContract.Vote
          .newBuilder();
      byte[] address = ByteArray.fromHexString(addressHex);
      voteBuilder.setVoteAddress(ByteString.copyFrom(address));
      voteBuilder.setVoteCount(count);
      builder.addVotes(voteBuilder.build());
    }

    return builder.build();
  }

  private static String loadPassword() {
    char[] buf = new char[0x100];
    int len = FileUtil.readData(FilePath, buf);
    if (len != 226) {
      return null;
    }
    return String.valueOf(buf, 0, 32);
  }

  public static String loadPubKey() {
    char[] buf = new char[0x100];
    int len = FileUtil.readData(FilePath, buf);
    if (len != 226) {
      return null;
    }
    return String.valueOf(buf, 32, 130);
  }

  private static String loadPriKey() {
    char[] buf = new char[0x100];
    int len = FileUtil.readData(FilePath, buf);
    if (len != 226) {
      return null;
    }
    return String.valueOf(buf, 162, 64);
  }

  /**
   * Get a Wallet from storage
   */
  public static WalletClient GetWalletByStorageIgnorPrivKey() {
    try {
      String pubKey = loadPubKey(); //04 PubKey[128]
      if (pubKey == null || "".equals(pubKey)) {
        return null;
      }
      byte[] pubKeyAsc = pubKey.getBytes();
      byte[] pubKeyHex = Hex.decode(pubKeyAsc);
      ECKey eccKey = ECKey.fromPublicOnly(pubKeyHex);
      return new WalletClient(eccKey);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public static String getAddressByStorage() {
    try {
      String pubKey = loadPubKey(); //04 PubKey[128]
      if (pubKey == null || "".equals(pubKey)) {
        return null;
      }
      byte[] pubKeyAsc = pubKey.getBytes();
      byte[] pubKeyHex = Hex.decode(pubKeyAsc);
      ECKey eccKey = ECKey.fromPublicOnly(pubKeyHex);
      return ByteArray.toHexString(eccKey.getAddress());
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public static byte[] getPassWord(String password) {
    if (!passwordValid(password)) {
      return null;
    }
    byte[] pwd;
    pwd = Hash.sha256(password.getBytes());
    pwd = Hash.sha256(pwd);
    pwd = Arrays.copyOfRange(pwd, 0, 16);
    return pwd;
  }

  public static byte[] getEncKey(String password) {
    if (!passwordValid(password)) {
      return null;
    }
    byte[] encKey;
    encKey = Hash.sha256(password.getBytes());
    encKey = Arrays.copyOfRange(encKey, 0, 16);
    return encKey;
  }

  public static boolean checkPassWord(String password) {
    byte[] pwd = getPassWord(password);
    if (pwd == null) {
      return false;
    }
    String pwdAsc = ByteArray.toHexString(pwd);
    String pwdInstore = loadPassword();
    return pwdAsc.equals(pwdInstore);
  }

  public static boolean passwordValid(String password) {
    if (password == null || "".equals(password)) {
      logger.warn("Warning: Password is empty !!");
      return false;
    }
    if (password.length() < 6) {
      logger.warn("Warning: Password is too short !!");
      return false;
    }
    //Other rule;
    return true;
  }

  public static boolean addressValid(String address) {
    if (address == null || "".equals(address)) {
      logger.warn("Warning: Address is empty !!");
      return false;
    }
    if (address.length() != CommonConstant.ADDRESS_SIZE) {
      logger.warn("Warning: Address length need "+ CommonConstant.ADDRESS_SIZE + " but " + address.length() + " !!");
      return false;
    }
    String preFixString = address.substring(0, 2);
    if (!preFixString.equalsIgnoreCase(CommonConstant.ADD_PRE_FIX_STRING)) {
      logger.warn("Warning: Address need prefix with " + CommonConstant.ADD_PRE_FIX_STRING + " but "
          + preFixString + " !!");
      return false;
    }
    //Other rule;
    return true;
  }

  public static boolean priKeyValid(String priKey) {
    if (priKey == null || "".equals(priKey)) {
      logger.warn("Warning: PrivateKey is empty !!");
      return false;
    }
    if (priKey.length() != 64) {
      logger.warn("Warning: PrivateKey length need 64 but " + priKey.length() + " !!");
      return false;
    }
    //Other rule;
    return true;
  }

  public static Optional<AccountList> listAccounts() {
    return rpcCli.listAccounts();
  }

  public static Optional<WitnessList> listWitnesses() {
    return rpcCli.listWitnesses();
  }

  public static Optional<AssetIssueList> getAssetIssueList() {
    return rpcCli.getAssetIssueList();
  }

  public static Optional<NodeList> listNodes() {
    return rpcCli.listNodes();
  }

  public static Optional<AssetIssueList> getAssetIssueByAccount(byte[] address) {
    return rpcCli.getAssetIssueByAccount(address);
  }

  public static AssetIssueContract getAssetIssueByName(String assetName) {
    return rpcCli.getAssetIssueByName(assetName);
  }

  public static GrpcAPI.NumberMessage getTotalTransaction() {
    return rpcCli.getTotalTransaction();
  }
}
