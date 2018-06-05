package org.tron.walletcli;

import com.google.protobuf.ByteString;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CancelException;
import org.tron.keystore.CipherException;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletClient;

import java.util.HashMap;
import java.util.Optional;

public class Client {

  private static final Logger logger = LoggerFactory.getLogger("Client");
  private WalletClient wallet;

  public String registerWallet(String password) throws CipherException, IOException {
    if (!WalletClient.passwordValid(password)) {
      return null;
    }
    wallet = new WalletClient(password);
    String keystoreName = wallet.store2Keystore();
    logout();
    return keystoreName;
  }

  public String importWallet(String password, String priKey) throws CipherException, IOException {
    if (!WalletClient.passwordValid(password)) {
      return null;
    }
    if (!WalletClient.priKeyValid(priKey)) {
      return null;
    }
    wallet = new WalletClient(password, priKey);
    String keystoreName = wallet.store2Keystore();
    logout();
    return keystoreName;
  }

  public boolean changePassword(String oldPassword, String newPassword)
      throws IOException, CipherException {
    logout();
    if (!WalletClient.passwordValid(newPassword)) {
      logger.warn("Warning: ChangePassword failed, NewPassword is invalid !!");
      return false;
    }
    return WalletClient.changeKeystorePassword(oldPassword, newPassword);
  }

  public boolean login(String password) throws IOException, CipherException {
    logout();
    wallet = WalletClient.loadWalletFromKeystore(password);
    if (wallet == null) {
      logger.warn("Warning: Login failed, Please registerWallet or importWallet first !!");
      return false;
    }
    wallet.setLogin();
    return true;
  }

  public void logout() {
    if (wallet != null) {
      wallet.logout();
      wallet = null;
    }
    //Neddn't logout
  }

  //password is current, will be enc by password2.
  public String backupWallet(String password) throws IOException, CipherException {
    if (wallet == null || !wallet.isLoginState()) {
      wallet = WalletClient.loadWalletFromKeystore(password);
      if (wallet == null) {
        logger.warn("Warning: BackupWallet failed, no wallet can be backup !!");
        return null;
      }
    }

    ECKey ecKey = wallet.getEcKey(password);
    String priKey = ByteArray.toHexString(ecKey.getPrivKeyBytes());

    return priKey;
  }

  public String getAddress() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: GetAddress failed,  Please login first !!");
      return null;
    }

    return WalletClient.encode58Check(wallet.getAddress());
  }

  public Account queryAccount() {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: QueryAccount failed,  Please login first !!");
      return null;
    }

    return wallet.queryAccount();
  }

  public boolean sendCoin(String toAddress, long amount)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: SendCoin failed,  Please login first !!");
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    return wallet.sendCoin(to, amount);
  }

  public boolean transferAsset(String toAddress, String assertName, long amount)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    return wallet.transferAsset(to, assertName.getBytes(), amount);
  }

  public boolean participateAssetIssue(String toAddress, String assertName,
      long amount) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }
    byte[] to = WalletClient.decodeFromBase58Check(toAddress);
    if (to == null) {
      return false;
    }

    return wallet.participateAssetIssue(to, assertName.getBytes(), amount);
  }

  public boolean assetIssue(String name, long totalSupply, int trxNum, int icoNum,
      long startTime, long endTime, int voteScore, String description, String url,
      long freeNetLimit, long publicFreeNetLimit, HashMap<String, String> frozenSupply)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: assetIssue failed,  Please login first !!");
      return false;
    }

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
    if (freeNetLimit < 0) {
      return false;
    }
    if (publicFreeNetLimit < 0) {
      return false;
    }

    builder.setStartTime(startTime);
    builder.setEndTime(endTime);
    builder.setVoteScore(voteScore);
    builder.setDescription(ByteString.copyFrom(description.getBytes()));
    builder.setUrl(ByteString.copyFrom(url.getBytes()));
    builder.setFreeAssetNetLimit(freeNetLimit);
    builder.setPublicFreeAssetNetLimit(publicFreeNetLimit);

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
  }

  public boolean createAccount(String address) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: createAccount failed,  Please login first !!");
      return false;
    }

    byte[] addressBytes = WalletClient.decodeFromBase58Check(address);
    return wallet.createAccount(addressBytes);
  }

  public boolean createWitness(String url) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: createWitness failed,  Please login first !!");
      return false;
    }

    return wallet.createWitness(url.getBytes());
  }

  public boolean updateWitness(String url) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: updateWitness failed,  Please login first !!");
      return false;
    }

    return wallet.updateWitness(url.getBytes());
  }

  public Block GetBlock(long blockNum) {
    return WalletClient.GetBlock(blockNum);
  }

  public boolean voteWitness(HashMap<String, String> witness)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: VoteWitness failed,  Please login first !!");
      return false;
    }

    return wallet.voteWitness(witness);
  }

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

  public boolean updateAccount(byte[] accountNameBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: updateAccount failed, Please login first !!");
      return false;
    }

    return wallet.updateAccount(accountNameBytes);
  }

  public boolean updateAsset(byte[] description, byte[] url, long newLimit,
      long newPublicLimit) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: updateAsset failed, Please login first !!");
      return false;
    }

    return wallet.updateAsset(description, url, newLimit, newPublicLimit);
  }

  public boolean freezeBalance(long frozen_balance, long frozen_duration)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: freezeBalance failed, Please login first !!");
      return false;
    }

    return wallet.freezeBalance(frozen_balance, frozen_duration);
  }

  public boolean unfreezeBalance() throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: unfreezeBalance failed, Please login first !!");
      return false;
    }

    return wallet.unfreezeBalance();
  }

  public boolean unfreezeAsset() throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: unfreezeAsset failed, Please login first !!");
      return false;
    }

    return wallet.unfreezeAsset();
  }

  public boolean withdrawBalance() throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      logger.warn("Warning: withdrawBalance failed, Please login first !!");
      return false;
    }

    return wallet.withdrawBalance();
  }

}
