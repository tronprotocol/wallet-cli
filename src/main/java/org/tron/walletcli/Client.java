package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletClient;

import java.util.HashMap;
import java.util.Optional;

public class Client {

  private static final Logger logger = LoggerFactory.getLogger("Client");
  private WalletClient wallet;

  public boolean registerWallet(String password) {
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    wallet = new WalletClient(true);
    // create account at network
//    Boolean ret = wallet.createAccount(Protocol.AccountType.Normal, userName.getBytes());getBytes
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
      logger.warn("Warning: ChangePassword failed, Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(oldPassword)) {
      logger.warn("Warning: ChangePassword failed, OldPassword is invalid !!");
      return false;
    }
    if (!WalletClient.passwordValid(newPassword)) {
      logger.warn("Warning: ChangePassword failed, NewPassword is invalid !!");
      return false;
    }
    if (!WalletClient.checkPassWord(oldPassword)) {
      logger.warn("Warning: ChangePassword failed, Wrong password !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(oldPassword);
      if (wallet == null) {
        logger.warn("Warning: ChangePassword failed, No wallet !!");
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
        logger.warn("Warning: Login failed, Please registerWallet or importWallet first !!");
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
  public String backupWallet(String password) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: BackupWallet failed, Please login first !!");
      return null;
    }
    if (!WalletClient.passwordValid(password)) {
      logger.warn("Warning: BackupWallet failed, password is Invalid !!");
      return null;
    }

    if (!WalletClient.checkPassWord(password)) {
      logger.warn("Warning: BackupWallet failed, Wrong password !!");
      return null;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: BackupWallet failed, no wallet can be backup !!");
        return null;
      }
    }
    ECKey ecKey = wallet.getEcKey();
    byte[] privKeyPlain = ecKey.getPrivKeyBytes();
    //Enced by encPassword
    String priKey = ByteArray.toHexString(privKeyPlain);

    return priKey;
  }

  public String getAddress() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: GetAddress failed,  Please login first !!");
      return null;
    }

    if (wallet.getEcKey() == null) {
      return WalletClient.getAddressByStorage();
    }
    return WalletClient.encode58Check(wallet.getAddress());
  }

  public Account queryAccount() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: QueryAccount failed,  Please login first !!");
      return null;
    }

    try {
      return wallet.queryAccount();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public boolean sendCoin(String password, String toAddress, long amount) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: SendCoin failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: SendCoin failed, Load wallet failed !!");
        return false;
      }
    }

    return wallet.sendCoin(to, amount);
  }

  public boolean transferAsset(String password, String toAddress, String assertName, long amount) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: TransferAsset failed, Load wallet failed !!");
        return false;
      }
    }

    return wallet.transferAsset(to, assertName.getBytes(), amount);
  }

  public boolean participateAssetIssue(String password, String toAddress, String assertName,
      long amount) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: TransferAsset failed, Load wallet failed !!");
        return false;
      }
    }

    return wallet.participateAssetIssue(to, assertName.getBytes(), amount);
  }

  public boolean assetIssue(String password, String name, long totalSupply, int trxNum, int icoNum,
      long startTime, long endTime, int voteScore, String description, String url,
      HashMap<String, String> frozenSupply) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: assetIssue failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: assetIssue failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      Contract.AssetIssueContract.Builder builder = Contract.AssetIssueContract.newBuilder();
      builder.setOwnerAddress(ByteString.copyFrom(wallet.getAddress()));
      builder.setName(ByteString.copyFrom(name.getBytes()));
      if (totalSupply <= 0) {
        return false;
      }
      builder.setTotalSupply(totalSupply);
      if (trxNum <= 0) {
        return false;
      }
      builder.setTrxNum(trxNum);
      if (icoNum <= 0) {
        return false;
      }
      builder.setNum(icoNum);
      long now = System.currentTimeMillis();
      if (startTime <= now) {
        return false;
      }
      if (endTime <= startTime) {
        return false;
      }
      builder.setStartTime(startTime);
      builder.setEndTime(endTime);
      builder.setVoteScore(voteScore);
      builder.setDescription(ByteString.copyFrom(description.getBytes()));
      builder.setUrl(ByteString.copyFrom(url.getBytes()));

      for (String daysStr : frozenSupply.keySet()) {
        String amountStr = frozenSupply.get(daysStr);
        long amount = Long.parseLong(amountStr);
        long days = Long.parseLong(daysStr);
        Contract.AssetIssueContract.FrozenSupply.Builder frozenSupplyBuilder
            = Contract.AssetIssueContract.FrozenSupply.newBuilder();
        frozenSupplyBuilder.setFrozenAmount(amount);
        frozenSupplyBuilder.setFrozenDays(days);
        builder.addFrozenSupply(frozenSupplyBuilder.build());
      }

      return wallet.createAssetIssue(builder.build());
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean createWitness(String password, String url) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: createWitness failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: createWitness failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.createWitness(url.getBytes());
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean updateWitness(String password, String url) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: updateWitness failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: updateWitness failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.updateWitness(url.getBytes());
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public Block GetBlock(long blockNum) {
    return WalletClient.GetBlock(blockNum);
  }

  public boolean voteWitness(String password, HashMap<String, String> witness) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: VoteWitness failed,  Please login first !!");
      return false;
    }
    if (!WalletClient.passwordValid(password)) {
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: VoteWitness failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.voteWitness(witness);
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

//  public Optional<AccountList> listAccounts() {
//    try {
//      return WalletClient.listAccounts();
//    } catch (Exception ex) {
//      ex.printStackTrace();
//      return Optional.empty();
//    }
//  }

  public Optional<WitnessList> listWitnesses() {
    try {
      return WalletClient.listWitnesses();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<AssetIssueList> getAssetIssueList() {
    try {
      return WalletClient.getAssetIssueList();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<NodeList> listNodes() {
    try {
      return WalletClient.listNodes();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public GrpcAPI.NumberMessage getTotalTransaction() {
    return WalletClient.getTotalTransaction();
  }

  public GrpcAPI.NumberMessage getNextMaintenanceTime() {
    return WalletClient.getNextMaintenanceTime();
  }

  public boolean updateAccount(String password, byte[] accountNameBytes) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warnging: updateAccount failed, Please login first !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: updateAccount failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.updateAccount(accountNameBytes);
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean freezeBalance(String password, long frozen_balance, long frozen_duration) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warnging: freezeBalance failed, Please login first !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: freezeBalance failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.freezeBalance(frozen_balance, frozen_duration);
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean unfreezeBalance(String password) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: unfreezeBalance failed, Please login first !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: unfreezeBalance failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.unfreezeBalance();
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean unfreezeAsset(String password) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: unfreezeAsset failed, Please login first !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: unfreezeAsset failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.unfreezeAsset();
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

  public boolean withdrawBalance(String password) {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warnging: withdrawBalance failed, Please login first !!");
      return false;
    }

    if (wallet.getEcKey() == null || wallet.getEcKey().getPrivKey() == null) {
      wallet = WalletClient.GetWalletByStorage(password);
      if (wallet == null) {
        logger.warn("Warning: withdrawBalance failed, Load wallet failed !!");
        return false;
      }
    }

    try {
      return wallet.withdrawBalance();
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
  }

}
