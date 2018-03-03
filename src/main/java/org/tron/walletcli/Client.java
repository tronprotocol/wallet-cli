package org.tron.walletcli;

import java.util.logging.Logger;
import org.spongycastle.util.encoders.Hex;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.SymmEncoder;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.protos.Protocal.Transaction;

public class Client {

  private static final Logger logger = Logger.getLogger("Client");
  private WalletClient wallet;

  public boolean registerWallet(String password) {
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    wallet = new WalletClient(true);
    wallet.store(password);
    return true;
  }

  public boolean importWallet(String password, String priKey) {
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    if (!WalletClient.priKeyValid(priKey)) {
      return false;
    }
    wallet = new WalletClient(priKey);
    if (wallet.getEcKey() == null) {
      return false;
    }
    wallet.store(password);
    return true;
  }

  public boolean changePassword(String oldPassword, String newPassword) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warning("Warning: ChangePassword failed, Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(oldPassword)) {
      logger.warning("Warning: ChangePassword failed, OldPassword is invalid !!");
      return false;
    }
    if (!WalletClient.passwordValid(newPassword)) {
      logger.warning("Warning: ChangePassword failed, NewPassword is invalid !!");
      return false;
    }
    if (!WalletClient.checkPassWord(oldPassword)) {
      logger
          .warning(
              "Warning: ChangePassword failed, Wrong password !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(oldPassword);
      if (wallet == null) {
        logger
            .warning("Warning: ChangePassword failed, No wallet !!");
        return false;
      }
    }
    byte[] priKeyAsc = wallet.getEcKey().getPrivKeyBytes();
    String priKey = Hex.toHexString(priKeyAsc, 0, priKeyAsc.length);
    return importWallet(newPassword, priKey);
  }

  public boolean login(String password) {
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    if (wallet == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger
            .warning("Warning: Login failed, Please registerWallet or importWallet first !!");
        return false;
      }
    }
    return wallet.login(password);
  }

  public void logout() {
    if (wallet != null) {
      wallet.logout();
    }
    //Neddn't logout
  }

  //password is current, will be enc by password2.
  public String backupWallet(String password, String encPassword) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warning("Warning: BackupWallet failed, Please login first !!");
      return null;
    }
    if (!WalletClient.passwordValid(password)) {
      logger.warning("Warning: BackupWallet failed, password is Invalid !!");
      return null;
    }
    if (!WalletClient.passwordValid(encPassword)) {
      logger.warning("Warning: BackupWallet failed, encPassword is Invalid !!");
      return null;
    }

    if (!WalletClient.checkPassWord(password)) {
      logger
          .warning(
              "Warning: BackupWallet failed, Wrong password !!");
      return null;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger
            .warning(
                "Warning: BackupWallet failed, no wallet can be backup !!");
        return null;
      }
    }
    ECKey ecKey = wallet.getEcKey();
    byte[] privKeyPlain = ecKey.getPrivKeyBytes();
    //Enced by encPassword
    byte[] aseKey = WalletClient.getEncKey(encPassword);
    byte[] privKeyEnced = SymmEncoder.AES128EcbEnc(privKeyPlain, aseKey);
    String priKey = ByteArray.toHexString(privKeyEnced);

    return priKey;
  }

  public String getAddress() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warning("Warning: GetAddress failed,  Please login first !!");
      return null;
    }

    if (wallet.getEcKey() == null) {
      return WalletClient.getAddressByStorage();
    }
    return ByteArray.toHexString(wallet.getAddress());
  }

  public long getBalance() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warning("Warning: GetBalance failed,  Please login first !!");
      return 0;
    }

    if (wallet.getEcKey() == null) {
      wallet = WalletClient.GetWalletByStorageIgnorPrivKey();
      if (wallet == null) {
        logger.warning("Warning: GetBalance failed, Load wallet failed !!");
        return 0;
      }
    }

    try {
      return wallet.getBalance();
    } catch (Exception ex) {
      ex.printStackTrace();
      return 0;
    }
  }

  public boolean sendCoin(String password, String toAddress, long amount) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warning("Warning: SendCoin failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    if (!WalletClient.addressValid(toAddress)) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warning("Warning: SendCoin failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      //createTransaction
      byte[] toBA = Hex.decode(toAddress);
//      Transaction trx = wallet.createTransaction(toBA, amount);
      Transaction trx = Test.createTransaction();
      //signTransaction
      trx = wallet.signTransaction(trx);
      boolean res = TransactionUtils.validTransaction(trx);
     // return res;
      return wallet.broadcastTransaction(trx);
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }
}
