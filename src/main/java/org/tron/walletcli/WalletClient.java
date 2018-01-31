package org.tron.walletcli;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.logging.Logger;
import org.spongycastle.util.encoders.Hex;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.SymmEncoder;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.FileUtil;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.protos.Protocal.Transaction;

public class WalletClient {

  private static final Logger logger = Logger.getLogger("WalletClient");
  private static final String FilePath = "Wallet";
  private ECKey ecKey = null;
  private boolean loginState = false;
  private GrpcClient rpcCli = new GrpcClient("192.168.10.165", 50051);

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
      logger.warning("Warning: Store wallet failed, PrivKey is null !!");
      return;
    }
    byte[] pwd = getPassWord(password);
    String pwdAsc = ByteArray.toHexString(pwd);
    byte[] privKeyPlain = ecKey.getPrivKeyBytes();
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

  public long getBalance() {
    byte[] address;
    if (this.ecKey == null) {
      String pubKey = loadPubKey(); //04 PubKey[128]
      if (pubKey == null || "".equals(pubKey)) {
        logger.warning("Warning: GetBalance failed, no wallet address !!");
        return 0;
      }
      byte[] pubKeyAsc = pubKey.getBytes();
      byte[] pubKeyHex = Hex.decode(pubKeyAsc);
      this.ecKey = ECKey.fromPublicOnly(pubKeyHex);
    }
    address = getAddress();
    long balance = rpcCli.getBalance(address);//call rpc
    return balance;
  }

  public Transaction signTransaction(Transaction transaction) {
    if (this.ecKey == null || this.ecKey.getPrivKey() == null) {
      logger.warning("Warning: Can't sign,there is no private key !!");
      return null;
    }
    return TransactionUtils.sign(transaction, this.ecKey);
  }

  public boolean broadcastTransaction(Transaction signaturedTransaction) {
    return rpcCli.broadcastTransaction(signaturedTransaction);
  }

  public Transaction createTransaction(byte[] to, long amount) {
    byte[] from = getAddress();
    return rpcCli.createTransaction(from, to, amount);
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
      logger.warning("Warning: Password is empty !!");
      return false;
    }
    if (password.length() < 6) {
      logger.warning("Warning: Password is too short !!");
      return false;
    }
    //Other rule;
    return true;
  }

  public static boolean addressValid(String address) {
    if (address == null || "".equals(address)) {
      logger.warning("Warning: Address is empty !!");
      return false;
    }
    if (address.length() != 40) {
      logger.warning("Warning: Address length need 64 but " + address.length() + " !!");
      return false;
    }
    //Other rule;
    return true;
  }

  public static boolean priKeyValid(String priKey) {
    if (priKey == null || "".equals(priKey)) {
      logger.warning("Warning: PrivateKey is empty !!");
      return false;
    }
    if (priKey.length() != 64) {
      logger.warning("Warning: PrivateKey length need 64 but " + priKey.length() + " !!");
      return false;
    }
    //Other rule;
    return true;
  }
}
