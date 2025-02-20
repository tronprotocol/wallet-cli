package org.tron.walletcli;

import com.google.protobuf.ByteString;
import io.netty.util.internal.StringUtil;

import java.io.File;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import lombok.extern.slf4j.Slf4j;
import org.bouncycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.*;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.exception.ZksnarkException;
import org.tron.core.zen.ShieldedAddressInfo;
import org.tron.core.zen.ShieldedNoteInfo;
import org.tron.core.zen.ShieldedTRC20NoteInfo;
import org.tron.core.zen.ShieldedTRC20Wrapper;
import org.tron.core.zen.ShieldedWrapper;
import org.tron.core.zen.ZenUtils;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.ExpandedSpendingKey;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.SpendingKey;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.Exchange;
import org.tron.protos.Protocol.MarketOrder;
import org.tron.protos.Protocol.MarketOrderList;
import org.tron.protos.Protocol.MarketOrderPairList;
import org.tron.protos.Protocol.MarketPriceList;
import org.tron.protos.Protocol.Proposal;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.AssetIssueContractOuterClass.AssetIssueContract;
import org.tron.protos.contract.ShieldContract.IncrementalMerkleVoucherInfo;
import org.tron.protos.contract.ShieldContract.OutputPoint;
import org.tron.protos.contract.ShieldContract.OutputPointInfo;
import org.tron.walletserver.WalletApi;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;

@Slf4j
public class WalletApiWrapper {

  private WalletApi wallet;
  private static final String MnemonicFilePath = "Mnemonic";

  public String registerWallet(char[] password) throws CipherException, IOException {
    if (!WalletApi.passwordValid(password)) {
      return null;
    }

    byte[] passwd = StringUtils.char2Byte(password);

    WalletFile walletFile = WalletApi.CreateWalletFile(passwd);
    StringUtils.clear(passwd);

    String keystoreName = WalletApi.store2Keystore(walletFile);
    logout();
    return keystoreName;
  }

  public String importWallet(char[] password, byte[] priKey, List<String> mnemonic) throws CipherException, IOException {
    if (!WalletApi.passwordValid(password)) {
      return null;
    }
    if (!WalletApi.priKeyValid(priKey)) {
      return null;
    }

    byte[] passwd = StringUtils.char2Byte(password);

    WalletFile walletFile = WalletApi.CreateWalletFile(passwd, priKey, mnemonic);
    StringUtils.clear(passwd);

    String keystoreName = WalletApi.store2Keystore(walletFile);
    if (mnemonic == null && WalletUtils.hasStoreFile(walletFile.getAddress(), MnemonicFilePath)) {
      WalletUtils.deleteStoreFile(walletFile.getAddress(), MnemonicFilePath);
    }
    logout();
    return keystoreName;
  }

  public boolean changePassword(char[] oldPassword, char[] newPassword)
      throws IOException, CipherException {
    logout();
    if (!WalletApi.passwordValid(newPassword)) {
      System.out.println("Warning: ChangePassword failed, NewPassword is invalid !!");
      return false;
    }

    byte[] oldPasswd = StringUtils.char2Byte(oldPassword);
    byte[] newPasswd = StringUtils.char2Byte(newPassword);

    boolean result = WalletApi.changeKeystorePassword(oldPasswd, newPasswd);
    StringUtils.clear(oldPasswd);
    StringUtils.clear(newPasswd);

    return result;
  }

  public boolean isLoginState() {
    if (wallet == null || !wallet.isLoginState()) {
      return false;
    } else {
      return true;
    }
  }

  public boolean login() throws IOException, CipherException {
    logout();
    wallet = WalletApi.loadWalletFromKeystore();

    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = StringUtils.char2Byte(password);
    StringUtils.clear(password);
    wallet.checkPassword(passwd);
    StringUtils.clear(passwd);

    if (wallet == null) {
      System.out.println("Warning: Login failed, Please registerWallet or importWallet first !!");
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
  public byte[] backupWallet() throws IOException, CipherException {
    if (wallet == null || !wallet.isLoginState()) {
      wallet = WalletApi.loadWalletFromKeystore();
      if (wallet == null) {
        System.out.println("Warning: BackupWallet failed, no wallet can be backup !!");
        return null;
      }
    }

    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = StringUtils.char2Byte(password);
    StringUtils.clear(password);
    byte[] privateKey = wallet.getPrivateBytes(passwd);
    StringUtils.clear(passwd);

    return privateKey;
  }

  public byte[] exportWalletMnemonic() throws IOException, CipherException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: ExportWalletMnemonic failed,  Please login first !!");
      return null;
    }

    //1.input password
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = StringUtils.char2Byte(password);
    wallet.checkPassword(passwd);
    StringUtils.clear(password);

    //2.export mnemonic words
    return MnemonicUtils.exportMnemonic(passwd, getAddress());
  }

  public String getAddress() {
    if (wallet == null || !wallet.isLoginState()) {
//      System.out.println("Warning: GetAddress failed,  Please login first !!");
      return null;
    }

    return WalletApi.encode58Check(wallet.getAddress());
  }

  public Account queryAccount() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: QueryAccount failed,  Please login first !!");
      return null;
    }

    return wallet.queryAccount();
  }

  public boolean sendCoin(byte[] ownerAddress, byte[] toAddress, long amount)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: SendCoin failed,  Please login first !!");
      return false;
    }

    return wallet.sendCoin(ownerAddress, toAddress, amount);
  }

  public boolean transferAsset(byte[] ownerAddress, byte[] toAddress, String assertName,
      long amount)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }

    return wallet.transferAsset(ownerAddress, toAddress, assertName.getBytes(), amount);
  }

  public boolean participateAssetIssue(byte[] ownerAddress, byte[] toAddress, String assertName,
      long amount) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: TransferAsset failed,  Please login first !!");
      return false;
    }

    return wallet.participateAssetIssue(ownerAddress, toAddress, assertName.getBytes(), amount);
  }

  public boolean assetIssue(byte[] ownerAddress, String name, String abbrName, long totalSupply,
      int trxNum, int icoNum,
      int precision, long startTime, long endTime, int voteScore, String description, String url,
      long freeNetLimit, long publicFreeNetLimit, HashMap<String, String> frozenSupply)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: assetIssue failed,  Please login first !!");
      return false;
    }

    AssetIssueContract.Builder builder = AssetIssueContract.newBuilder();
    if (ownerAddress == null) {
      ownerAddress = wallet.getAddress();
    }
    builder.setOwnerAddress(ByteString.copyFrom(ownerAddress));
    builder.setName(ByteString.copyFrom(name.getBytes()));
    builder.setAbbr(ByteString.copyFrom(abbrName.getBytes()));

    if (totalSupply <= 0) {
      System.out.println("totalSupply should greater than 0. but really is " + totalSupply);
      return false;
    }
    builder.setTotalSupply(totalSupply);

    if (trxNum <= 0) {
      System.out.println("trxNum should greater than 0. but really is " + trxNum);
      return false;
    }
    builder.setTrxNum(trxNum);

    if (icoNum <= 0) {
      System.out.println("num should greater than 0. but really is " + icoNum);
      return false;
    }
    builder.setNum(icoNum);

    if (precision < 0) {
      System.out.println("precision should greater or equal to 0. but really is " + precision);
      return false;
    }
    builder.setPrecision(precision);

    long now = System.currentTimeMillis();
    if (startTime <= now) {
      System.out.println("startTime should greater than now. but really is startTime("
          + startTime + ") now(" + now + ")");
      return false;
    }
    if (endTime <= startTime) {
      System.out.println("endTime should greater or equal to startTime. but really is endTime("
          + endTime + ") startTime(" + startTime + ")");
      return false;
    }

    if (freeNetLimit < 0) {
      System.out.println("freeAssetNetLimit should greater or equal to 0. but really is "
          + freeNetLimit);
      return false;
    }
    if (publicFreeNetLimit < 0) {
      System.out.println("publicFreeAssetNetLimit should greater or equal to 0. but really is "
          + publicFreeNetLimit);
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
      AssetIssueContract.FrozenSupply.Builder frozenSupplyBuilder
          = AssetIssueContract.FrozenSupply.newBuilder();
      frozenSupplyBuilder.setFrozenAmount(amount);
      frozenSupplyBuilder.setFrozenDays(days);
      builder.addFrozenSupply(frozenSupplyBuilder.build());
    }

    return wallet.createAssetIssue(builder.build());
  }

  public boolean createAccount(byte[] ownerAddress, byte[] address)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createAccount failed,  Please login first !!");
      return false;
    }

    return wallet.createAccount(ownerAddress, address);
  }


  public boolean createWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createWitness failed,  Please login first !!");
      return false;
    }

    return wallet.createWitness(ownerAddress, url.getBytes());
  }

  public boolean updateWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateWitness failed,  Please login first !!");
      return false;
    }

    return wallet.updateWitness(ownerAddress, url.getBytes());
  }

  public Block getBlock(long blockNum) {
    return WalletApi.getBlock(blockNum);
  }

  public long getTransactionCountByBlockNum(long blockNum) {
    return WalletApi.getTransactionCountByBlockNum(blockNum);
  }

  public BlockExtention getBlock2(long blockNum) {
    return WalletApi.getBlock2(blockNum);
  }

  public boolean voteWitness(byte[] ownerAddress, HashMap<String, String> witness)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: VoteWitness failed,  Please login first !!");
      return false;
    }

    return wallet.voteWitness(ownerAddress, witness);
  }

  public Optional<WitnessList> listWitnesses() {
    try {
      return WalletApi.listWitnesses();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<AssetIssueList> getAssetIssueList() {
    try {
      return WalletApi.getAssetIssueList();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<AssetIssueList> getAssetIssueList(long offset, long limit) {
    try {
      return WalletApi.getAssetIssueList(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public AssetIssueContract getAssetIssueByName(String assetName) {
    return WalletApi.getAssetIssueByName(assetName);
  }

  public Optional<AssetIssueList> getAssetIssueListByName(String assetName) {
    try {
      return WalletApi.getAssetIssueListByName(assetName);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public AssetIssueContract getAssetIssueById(String assetId) {
    return WalletApi.getAssetIssueById(assetId);
  }

  public Optional<ProposalList> getProposalListPaginated(long offset, long limit) {
    try {
      return WalletApi.getProposalListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ExchangeList> getExchangeListPaginated(long offset, long limit) {
    try {
      return WalletApi.getExchangeListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<NodeList> listNodes() {
    try {
      return WalletApi.listNodes();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public GrpcAPI.NumberMessage getTotalTransaction() {
    return WalletApi.getTotalTransaction();
  }

  public GrpcAPI.NumberMessage getNextMaintenanceTime() {
    return WalletApi.getNextMaintenanceTime();
  }

  public boolean updateAccount(byte[] ownerAddress, byte[] accountNameBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAccount failed, Please login first !!");
      return false;
    }

    return wallet.updateAccount(ownerAddress, accountNameBytes);
  }

  public boolean setAccountId(byte[] ownerAddress, byte[] accountIdBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: setAccount failed, Please login first !!");
      return false;
    }

    return wallet.setAccountId(ownerAddress, accountIdBytes);
  }


  public boolean updateAsset(byte[] ownerAddress, byte[] description, byte[] url, long newLimit,
      long newPublicLimit) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAsset failed, Please login first !!");
      return false;
    }

    return wallet.updateAsset(ownerAddress, description, url, newLimit, newPublicLimit);
  }

  public boolean freezeBalance(byte[] ownerAddress, long frozen_balance, long frozen_duration,
      int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalance failed, Please login first !!");
      return false;
    }

    return wallet.freezeBalance(ownerAddress, frozen_balance, frozen_duration, resourceCode,
        receiverAddress);
  }

  public boolean freezeBalanceV2(byte[] ownerAddress, long frozen_balance,
                               int resourceCode)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalanceV2 failed, Please login first !!");
      return false;
    }

    return wallet.freezeBalanceV2(ownerAddress, frozen_balance, resourceCode);
  }

  public boolean buyStorage(byte[] ownerAddress, long quantity)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: buyStorage failed, Please login first !!");
      return false;
    }

    return wallet.buyStorage(ownerAddress, quantity);
  }

  public boolean buyStorageBytes(byte[] ownerAddress, long bytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: buyStorageBytes failed, Please login first !!");
      return false;
    }

    return wallet.buyStorageBytes(ownerAddress, bytes);
  }

  public boolean sellStorage(byte[] ownerAddress, long storageBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: sellStorage failed, Please login first !!");
      return false;
    }

    return wallet.sellStorage(ownerAddress, storageBytes);
  }


  public boolean unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalance failed, Please login first !!");
      return false;
    }

    return wallet.unfreezeBalance(ownerAddress, resourceCode, receiverAddress);
  }

  public boolean unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance
          , int resourceCode)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalanceV2 failed, Please login first !!");
      return false;
    }

    return wallet.unfreezeBalanceV2(ownerAddress, unfreezeBalance, resourceCode);
  }

  public boolean withdrawExpireUnfreeze(byte[] ownerAddress)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawExpireUnfreeze failed, Please login first !!");
      return false;
    }

    return wallet.withdrawExpireUnfreeze(ownerAddress);
  }

  public boolean delegateresource(byte[] ownerAddress, long balance
          , int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: delegateresource failed, Please login first !!");
      return false;
    }

    return wallet.delegateResource(ownerAddress, balance
        , resourceCode, receiverAddress, lock, lockPeriod);
  }

  public boolean undelegateresource(byte[] ownerAddress, long balance
          , int resourceCode, byte[] receiverAddress)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: undelegateresource failed, Please login first !!");
      return false;
    }

    return wallet.unDelegateResource(ownerAddress, balance, resourceCode, receiverAddress);
  }

  public boolean cancelAllUnfreezeV2()
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: cancelAllUnfreezeV2 failed, Please login first !!");
      return false;
    }
    return wallet.cancelAllUnfreezeV2();
  }

  public boolean unfreezeAsset(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeAsset failed, Please login first !!");
      return false;
    }

    return wallet.unfreezeAsset(ownerAddress);
  }

  public boolean withdrawBalance(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawBalance failed, Please login first !!");
      return false;
    }

    return wallet.withdrawBalance(ownerAddress);
  }

  public boolean createProposal(byte[] ownerAddress, HashMap<Long, Long> parametersMap)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createProposal failed, Please login first !!");
      return false;
    }

    return wallet.createProposal(ownerAddress, parametersMap);
  }


  public Optional<ProposalList> getProposalsList() {
    try {
      return WalletApi.listProposals();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<Proposal> getProposals(String id) {
    try {
      return WalletApi.getProposal(id);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ExchangeList> getExchangeList() {
    try {
      return WalletApi.listExchanges();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<Exchange> getExchange(String id) {
    try {
      return WalletApi.getExchange(id);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ChainParameters> getChainParameters() {
    try {
      return WalletApi.getChainParameters();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }


  public boolean approveProposal(byte[] ownerAddress, long id, boolean is_add_approval)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: approveProposal failed, Please login first !!");
      return false;
    }

    return wallet.approveProposal(ownerAddress, id, is_add_approval);
  }

  public boolean deleteProposal(byte[] ownerAddress, long id)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: deleteProposal failed, Please login first !!");
      return false;
    }

    return wallet.deleteProposal(ownerAddress, id);
  }

  public boolean exchangeCreate(byte[] ownerAddress, byte[] firstTokenId, long firstTokenBalance,
      byte[] secondTokenId, long secondTokenBalance)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeCreate failed, Please login first !!");
      return false;
    }

    return wallet.exchangeCreate(ownerAddress, firstTokenId, firstTokenBalance,
        secondTokenId, secondTokenBalance);
  }

  public boolean exchangeInject(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeInject failed, Please login first !!");
      return false;
    }

    return wallet.exchangeInject(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeWithdraw(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeWithdraw failed, Please login first !!");
      return false;
    }

    return wallet.exchangeWithdraw(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeTransaction(byte[] ownerAddress, long exchangeId, byte[] tokenId,
      long quant, long expected)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeTransaction failed, Please login first !!");
      return false;
    }

    return wallet.exchangeTransaction(ownerAddress, exchangeId, tokenId, quant, expected);
  }

  public boolean updateSetting(byte[] ownerAddress, byte[] contractAddress,
      long consumeUserResourcePercent)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }
    return wallet.updateSetting(ownerAddress, contractAddress, consumeUserResourcePercent);

  }

  public boolean updateEnergyLimit(byte[] ownerAddress, byte[] contractAddress,
      long originEnergyLimit)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }

    return wallet.updateEnergyLimit(ownerAddress, contractAddress, originEnergyLimit);
  }

  public boolean clearContractABI(byte[] ownerAddress, byte[] contractAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }
    return wallet.clearContractABI(ownerAddress, contractAddress);
  }

  public boolean clearWalletKeystore() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: clearWalletKeystore failed,  Please login first !!");
      return false;
    }
    boolean clearWalletKeystoreRet =  wallet.clearWalletKeystore();
    if (clearWalletKeystoreRet) {
      logout();
    }
    return clearWalletKeystoreRet;
  }


  public boolean deployContract(byte[] ownerAddress, String name, String abiStr, String codeStr,
      long feeLimit, long value, long consumeUserResourcePercent, long originEnergyLimit,
      long tokenValue, String tokenId, String libraryAddressPair, String compilerVersion)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createContract failed,  Please login first !!");
      return false;
    }
    return wallet
        .deployContract(ownerAddress, name, abiStr, codeStr, feeLimit, value,
            consumeUserResourcePercent,
            originEnergyLimit, tokenValue, tokenId,
            libraryAddressPair, compilerVersion);
  }

  public boolean callContract(byte[] ownerAddress, byte[] contractAddress, long callValue,
      byte[] data, long feeLimit,
      long tokenValue, String tokenId, boolean isConstant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: callContract failed,  Please login first !!");
      return false;
    }

    return wallet
        .triggerContract(ownerAddress, contractAddress, callValue, data, feeLimit, tokenValue,
            tokenId,
            isConstant);
  }

  public boolean estimateEnergy(byte[] ownerAddress, byte[] contractAddress, long callValue,
      byte[] data, long tokenValue, String tokenId)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: estimateEnergy failed, Please login first !!");
      return false;
    }

    return wallet
        .estimateEnergy(ownerAddress, contractAddress, callValue, data, tokenValue, tokenId);
  }

  public boolean accountPermissionUpdate(byte[] ownerAddress, String permission)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: accountPermissionUpdate failed,  Please login first !!");
      return false;
    }
    return wallet.accountPermissionUpdate(ownerAddress, permission);
  }


  public Transaction addTransactionSign(Transaction transaction)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: addTransactionSign failed,  Please login first !!");
      return null;
    }
    return wallet.addTransactionSign(transaction);
  }

  public boolean sendShieldedCoin(String fromAddress, long fromAmount, List<Long> shieldedInputList,
      List<GrpcAPI.Note> shieldedOutputList, String toAddress, long toAmount)
      throws CipherException, IOException, CancelException, ZksnarkException {
    PrivateParameters.Builder builder = PrivateParameters.newBuilder();
    if (!StringUtil.isNullOrEmpty(fromAddress) && fromAmount > 0) {
      byte[] from = WalletApi.decodeFromBase58Check(fromAddress);
      if (from == null) {
        return false;
      }
      builder.setTransparentFromAddress(ByteString.copyFrom(from));
      builder.setFromAmount(fromAmount);
    }

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount);
    }

    if (shieldedInputList.size() > 0) {
      OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
        outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
        outPointBuild.setIndex(noteInfo.getIndex());
        request.addOutPoints(outPointBuild.build());
      }
      Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
          WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
      if (!merkleVoucherInfo.isPresent()
          || merkleVoucherInfo.get().getVouchersCount() != shieldedInputList.size()) {
        System.out.println("Can't get all merkel tree, please check the notes.");
        return false;
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldedAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedWrapper.getInstance().getShieldedAddressInfoMap().get(shieldedAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getValue());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
        spendNoteBuilder.setNote(noteBuild.build());
        spendNoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendNoteBuilder.setVoucher(merkleVoucherInfo.get().getVouchers(i));
        spendNoteBuilder.setPath(merkleVoucherInfo.get().getPaths(i));

        builder.addShieldedSpends(spendNoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(shieldedOutputList.get(i)).build());
      }
    }

    return WalletApi.sendShieldedCoin(builder.build(), wallet);
  }

  public boolean sendShieldedCoinWithoutAsk(String fromAddress, long fromAmount,
      List<Long> shieldedInputList,
      List<GrpcAPI.Note> shieldedOutputList, String toAddress, long toAmount)
      throws CipherException, IOException, CancelException, ZksnarkException {
    PrivateParametersWithoutAsk.Builder builder = PrivateParametersWithoutAsk.newBuilder();
    if (!StringUtil.isNullOrEmpty(fromAddress)) {
      byte[] from = WalletApi.decodeFromBase58Check(fromAddress);
      if (from == null) {
        return false;
      }
      builder.setTransparentFromAddress(ByteString.copyFrom(from));
      builder.setFromAmount(fromAmount);
    }

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount);
    }

    byte[] ask = new byte[32];
    if (shieldedInputList.size() > 0) {
      OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
        outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
        outPointBuild.setIndex(noteInfo.getIndex());
        request.addOutPoints(outPointBuild.build());
      }
      Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
          WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
      if (!merkleVoucherInfo.isPresent()
          || merkleVoucherInfo.get().getVouchersCount() != shieldedInputList.size()) {
        System.out.println("Can't get all merkel tree, please check the notes.");
        return false;
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedWrapper.getInstance().getShieldedAddressInfoMap().get(shieldAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          System.arraycopy(expandedSpendingKey.getAsk(), 0, ask, 0, 32);
          builder.setAk(ByteString.copyFrom(
              ExpandedSpendingKey.getAkFromAsk(expandedSpendingKey.getAsk())));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getValue());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
        spendNoteBuilder.setNote(noteBuild.build());
        spendNoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendNoteBuilder.setVoucher(merkleVoucherInfo.get().getVouchers(i));
        spendNoteBuilder.setPath(merkleVoucherInfo.get().getPaths(i));

        builder.addShieldedSpends(spendNoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(shieldedOutputList.get(i)).build());
      }
    }

    return WalletApi.sendShieldedCoinWithoutAsk(builder.build(), ask, wallet);
  }

  public boolean resetShieldedNote() {
    System.out.println("Start to reset reset shielded notes, please wait ...");
    ShieldedWrapper.getInstance().setResetNote(true);
    return true;
  }

  public boolean scanNoteByIvk(final String ivk, long start, long end) {
    GrpcAPI.IvkDecryptParameters ivkDecryptParameters = IvkDecryptParameters.newBuilder()
        .setStartBlockIndex(start)
        .setEndBlockIndex(end)
        .setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)))
        .build();

    Optional<DecryptNotes> decryptNotes = WalletApi.scanNoteByIvk(ivkDecryptParameters, true);
    if (!decryptNotes.isPresent()) {
      System.out.println("scanNoteByIvk failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(decryptNotes.get()));
//            for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                Note note = noteTx.getNote();
//                System.out.println("\ntxid:{}\nindex:{}\naddress:{}\nrcm:{}\nvalue:{}\nmemo:{}",
//                        ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                        noteTx.getIndex(),
//                        note.getPaymentAddress(),
//                        ByteArray.toHexString(note.getRcm().toByteArray()),
//                        note.getValue(),
//                        ZenUtils.getMemo(note.getMemo().toByteArray()));
//            }
//            System.out.println("complete.");
    }
    return true;
  }

  public boolean scanAndMarkNoteByAddress(final String shieldedAddress, long start, long end) {
    ShieldedAddressInfo addressInfo = ShieldedWrapper.getInstance().getShieldedAddressInfoMap()
        .get(shieldedAddress);
    if (addressInfo == null) {
      System.out.println("Can't find shieldedAddress in local, please check shieldedAddress.");
      return false;
    }

    try {
      IvkDecryptAndMarkParameters.Builder builder = IvkDecryptAndMarkParameters.newBuilder();
      builder.setStartBlockIndex(start);
      builder.setEndBlockIndex(end);
      builder.setIvk(ByteString.copyFrom(addressInfo.getIvk()));
      builder.setAk(ByteString.copyFrom(addressInfo.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(addressInfo.getFullViewingKey().getNk()));

      Optional<DecryptNotesMarked> decryptNotes = WalletApi.scanAndMarkNoteByIvk(builder.build());
      if (decryptNotes.isPresent()) {
        System.out.println(Utils.formatMessageString(decryptNotes.get()));

//                for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                    DecryptNotesMarked.NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                    Note note = noteTx.getNote();
//                    System.out.println("\ntxid:{}\nindex:{}\nisSpend:{}\naddress:{}\nrcm:{}\nvalue:{}\nmemo:{}",
//                            ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                            noteTx.getIndex(),
//                            noteTx.getIsSpend(),
//                            note.getPaymentAddress(),
//                            ByteArray.toHexString(note.getRcm().toByteArray()),
//                            note.getValue(),
//                            ZenUtils.getMemo(note.getMemo().toByteArray()));
//                }
      } else {
        System.out.println("scanAndMarkNoteByIvk failed !!!");
      }
    } catch (Exception e) {

    }
    System.out.println("complete.");
    return true;
  }

  public boolean scanShieldedNoteByovk(final String shieldedAddress, long start, long end) {
    GrpcAPI.OvkDecryptParameters ovkDecryptParameters = OvkDecryptParameters.newBuilder()
        .setStartBlockIndex(start)
        .setEndBlockIndex(end)
        .setOvk(ByteString.copyFrom(ByteArray.fromHexString(shieldedAddress)))
        .build();

    Optional<DecryptNotes> decryptNotes = WalletApi.scanNoteByOvk(ovkDecryptParameters, true);
    if (!decryptNotes.isPresent()) {
      System.out.println("ScanNoteByOvk failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(decryptNotes.get()));
//            for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                Note note = noteTx.getNote();
//                System.out.println("\ntxid:{}\nindex:{}\npaymentAddress:{}\nrcm:{}\nmemo:{}\nvalue:{}",
//                        ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                        noteTx.getIndex(),
//                        note.getPaymentAddress(),
//                        ByteArray.toHexString(note.getRcm().toByteArray()),
//                        ZenUtils.getMemo(note.getMemo().toByteArray()),
//                        note.getValue());
//            }
      System.out.println("complete.");
    }
    return true;
  }

  public Optional<ShieldedAddressInfo> getNewShieldedAddress() {
    ShieldedAddressInfo addressInfo = new ShieldedAddressInfo();
    try {
      Optional<BytesMessage> sk = WalletApi.getSpendingKey();
      Optional<DiversifierMessage> d = WalletApi.getDiversifier();

      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(sk.get());

      BytesMessage.Builder askBuilder = BytesMessage.newBuilder();
      askBuilder.setValue(expandedSpendingKeyMessage.get().getAsk());
      Optional<BytesMessage> ak = WalletApi.getAkFromAsk(askBuilder.build());

      BytesMessage.Builder nskBuilder = BytesMessage.newBuilder();
      nskBuilder.setValue(expandedSpendingKeyMessage.get().getNsk());
      Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nskBuilder.build());

      ViewingKeyMessage.Builder viewBuilder = ViewingKeyMessage.newBuilder();
      viewBuilder.setAk(ak.get().getValue());
      viewBuilder.setNk(nk.get().getValue());
      Optional<IncomingViewingKeyMessage> ivk = WalletApi
          .getIncomingViewingKey(viewBuilder.build());

      IncomingViewingKeyDiversifierMessage.Builder builder = IncomingViewingKeyDiversifierMessage
          .newBuilder();
      builder.setD(d.get());
      builder.setIvk(ivk.get());
      Optional<PaymentAddressMessage> addressMessage = WalletApi
          .getZenPaymentAddress(builder.build());
      addressInfo.setSk(sk.get().getValue().toByteArray());
      addressInfo.setD(new DiversifierT(d.get().getD().toByteArray()));
      addressInfo.setIvk(ivk.get().getIvk().toByteArray());
      addressInfo.setOvk(expandedSpendingKeyMessage.get().getOvk().toByteArray());
      addressInfo.setPkD(addressMessage.get().getPkD().toByteArray());

//            System.out.println("ivk " + ByteArray.toHexString(ivk.get().getIvk().toByteArray()));
//            System.out.println("ovk " + ByteArray.toHexString(expandedSpendingKeyMessage.get().getOvk().toByteArray()));

      if (addressInfo.validateCheck()) {
        return Optional.of(addressInfo);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return Optional.empty();
  }

  public byte[] getRandomOvk() {
    try {
      Optional<BytesMessage> sk = WalletApi.getSpendingKey();
      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(sk.get());
      return expandedSpendingKeyMessage.get().getOvk().toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  public Optional<ShieldedAddressInfo> getNewShieldedAddressBySkAndD(byte[] sk, byte[] d) {
    ShieldedAddressInfo addressInfo = new ShieldedAddressInfo();
    try {
      BytesMessage.Builder skBuilder = BytesMessage.newBuilder();
      skBuilder.setValue(ByteString.copyFrom(sk));

      DiversifierMessage.Builder dBuilder = DiversifierMessage.newBuilder();
      dBuilder.setD(ByteString.copyFrom(d));

      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(skBuilder.build());

      BytesMessage.Builder askBuilder = BytesMessage.newBuilder();
      askBuilder.setValue(expandedSpendingKeyMessage.get().getAsk());
      Optional<BytesMessage> ak = WalletApi.getAkFromAsk(askBuilder.build());

      BytesMessage.Builder nskBuilder = BytesMessage.newBuilder();
      nskBuilder.setValue(expandedSpendingKeyMessage.get().getNsk());
      Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nskBuilder.build());

      ViewingKeyMessage.Builder viewBuilder = ViewingKeyMessage.newBuilder();
      viewBuilder.setAk(ak.get().getValue());
      viewBuilder.setNk(nk.get().getValue());
      Optional<IncomingViewingKeyMessage> ivk = WalletApi
          .getIncomingViewingKey(viewBuilder.build());

      IncomingViewingKeyDiversifierMessage.Builder builder = IncomingViewingKeyDiversifierMessage
          .newBuilder();
      builder.setD(dBuilder.build());
      builder.setIvk(ivk.get());
      Optional<PaymentAddressMessage> addressMessage = WalletApi
          .getZenPaymentAddress(builder.build());
      addressInfo.setSk(sk);
      addressInfo.setD(new DiversifierT(d));
      addressInfo.setIvk(ivk.get().getIvk().toByteArray());
      addressInfo.setOvk(expandedSpendingKeyMessage.get().getOvk().toByteArray());
      addressInfo.setPkD(addressMessage.get().getPkD().toByteArray());

      if (addressInfo.validateCheck()) {
        return Optional.of(addressInfo);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return Optional.empty();
  }

  public String getShieldedNulltifier(long index) {
    ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote().get(index);
    if (noteInfo == null) {
      return null;
    }

    OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
    OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
    outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
    outPointBuild.setIndex(noteInfo.getIndex());
    request.addOutPoints(outPointBuild.build());
    Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
        WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
    if (!merkleVoucherInfo.isPresent() || merkleVoucherInfo.get().getVouchersCount() < 1) {
      System.out.println("get merkleVoucherInfo failure.");
      return null;
    }

    Note.Builder noteBuild = Note.newBuilder();
    noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
    noteBuild.setValue(noteInfo.getValue());
    noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
    noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

    System.out.println("address " + noteInfo.getPaymentAddress());
    System.out.println("value " + noteInfo.getValue());
    System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
    System.out.println("trxId " + noteInfo.getTrxId());
    System.out.println("index " + noteInfo.getIndex());
    System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

    String shieldedAddress = noteInfo.getPaymentAddress();
    ShieldedAddressInfo addressInfo = ShieldedWrapper.getInstance().getShieldedAddressInfoMap()
        .get(shieldedAddress);

    SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());

    try {
      FullViewingKey fullViewingKey = spendingKey.fullViewingKey();
      NfParameters.Builder builder = NfParameters.newBuilder();
      builder.setNote(noteBuild.build());
      builder.setVoucher(merkleVoucherInfo.get().getVouchers(0));
      builder.setAk(ByteString.copyFrom(fullViewingKey.getAk()));
      builder.setNk(ByteString.copyFrom(fullViewingKey.getNk()));

      Optional<BytesMessage> nullifier = WalletApi.createShieldedNullifier(builder.build());
      return ByteArray.toHexString(nullifier.get().getValue().toByteArray());

    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  public byte[] getRcm() {
    return WalletApi.getRcm().get().getValue().toByteArray();
  }

  public boolean updateBrokerage(byte[] ownerAddress, int brokerage)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }
    return wallet.updateBrokerage(ownerAddress, brokerage);
  }

  public GrpcAPI.NumberMessage getReward(byte[] ownerAddress) {
    return WalletApi.getReward(ownerAddress);
  }

  public GrpcAPI.NumberMessage getBrokerage(byte[] ownerAddress) {
    return WalletApi.getBrokerage(ownerAddress);
  }

  public PricesResponseMessage getBandwidthPrices() {
    return WalletApi.getBandwidthPrices();
  }

  public PricesResponseMessage getEnergyPrices() {
    return WalletApi.getEnergyPrices();
  }

  public PricesResponseMessage getMemoFee() {
    return WalletApi.getMemoFee();
  }

  public boolean scanShieldedTRC20NoteByIvk(byte[] address, final String ivk,
                                            final String ak, final String nk,
                                            long start, long end, String[] events) {
    GrpcAPI.IvkDecryptTRC20Parameters.Builder builder = IvkDecryptTRC20Parameters
        .newBuilder();
    builder.setStartBlockIndex(start)
           .setEndBlockIndex(end)
           .setShieldedTRC20ContractAddress(ByteString.copyFrom(address))
           .setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)))
           .setAk(ByteString.copyFrom(ByteArray.fromHexString(ak)))
           .setNk(ByteString.copyFrom(ByteArray.fromHexString(nk)));
    if (events != null ) {
      for (String event : events) {
        builder.addEvents(event);
      }
    }
    GrpcAPI.IvkDecryptTRC20Parameters parameters = builder.build();

    Optional<DecryptNotesTRC20> notes = WalletApi.scanShieldedTRC20NoteByIvk(
        parameters, true);
    if (!notes.isPresent()) {
      return false;
    }
    if (notes.get().getNoteTxsList().size() > 0) {
      BigInteger scalingFactor;
      if (ShieldedTRC20Wrapper.getInstance().ifShieldedTRC20WalletLoaded()
          && ByteUtil.equals(address, WalletApi.decodeFromBase58Check(
              ShieldedTRC20Wrapper.getInstance().getShieldedTRC20ContractAddress()))) {
        scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
      } else {
        try {
          String scalingFactorHexStr = getScalingFactor(address);
          scalingFactor = new BigInteger(scalingFactorHexStr, 16);
        } catch (Exception e) {
          return false;
        }
      }

      System.out.println("[");
      for(DecryptNotesTRC20.NoteTx noteTx : notes.get().getNoteTxsList()) {
        System.out.println("\t{");
        System.out.println("\t\t note: {");
        BigInteger showValue =
            BigInteger.valueOf(noteTx.getNote().getValue()).multiply(scalingFactor);
        System.out.println("\t\t\t value: " + showValue.toString());
        System.out.println("\t\t\t payment_address: " + noteTx.getNote().getPaymentAddress());
        System.out.println("\t\t\t rcm: "
            + ByteArray.toHexString(noteTx.getNote().getRcm().toByteArray()));
        System.out.println("\t\t\t memo: " + noteTx.getNote().getMemo().toStringUtf8());
        System.out.println("\t\t }\n\t\t position: " + noteTx.getPosition());
        if (!(ak == null || nk == null)) {
          System.out.println("\t\t is_spent: " + noteTx.getIsSpent());
        }
        System.out.println("\t\t tx_id: " + ByteArray.toHexString(noteTx.getTxid().toByteArray()));
        System.out.println("\t}");
      }
      System.out.println("]");
    } else {
      System.out.println("No notes found!");
    }
    return true;
  }

  public boolean scanShieldedTRC20NoteByOvk(final String ovk, long start, long end,
                                            byte[] contractAddress, String[] events) {
    GrpcAPI.OvkDecryptTRC20Parameters.Builder builder = OvkDecryptTRC20Parameters.newBuilder();
    builder.setStartBlockIndex(start)
           .setEndBlockIndex(end)
           .setOvk(ByteString.copyFrom(ByteArray.fromHexString(ovk)))
           .setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));
    if (events != null ) {
      for (String event : events) {
        builder.addEvents(event);
      }
    }
    GrpcAPI.OvkDecryptTRC20Parameters parameters = builder.build();
    Optional<DecryptNotesTRC20> notes = WalletApi.scanShieldedTRC20NoteByOvk(parameters, true);
    if (!notes.isPresent()) {
      return false;
    }
    if (notes.get().getNoteTxsList().size() > 0) {
      BigInteger scalingFactor;
      if (ShieldedTRC20Wrapper.getInstance().ifShieldedTRC20WalletLoaded()
          && ByteUtil.equals(contractAddress, WalletApi.decodeFromBase58Check(
          ShieldedTRC20Wrapper.getInstance().getShieldedTRC20ContractAddress()))) {
        scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
      } else {
        try {
          String scalingFactorHexStr = getScalingFactor(contractAddress);
          scalingFactor = new BigInteger(scalingFactorHexStr, 16);
        } catch (Exception e) {
          return false;
        }
      }

      System.out.println("[");
      for(DecryptNotesTRC20.NoteTx noteTx : notes.get().getNoteTxsList()) {
        System.out.println("\t{");
        //note
        if (noteTx.hasNote()) {
          System.out.println("\t\t note: {");
          BigInteger showValue =
              BigInteger.valueOf(noteTx.getNote().getValue()).multiply(scalingFactor);
          System.out.println("\t\t\t value: " + showValue.toString());
          System.out.println("\t\t\t payment_address: " + noteTx.getNote().getPaymentAddress());
          System.out.println("\t\t\t rcm: "
              + ByteArray.toHexString(noteTx.getNote().getRcm().toByteArray()));
          System.out.println("\t\t\t memo: " + noteTx.getNote().getMemo().toStringUtf8());
          System.out.println("\t\t }");
        } else {
          //This is specific for BURN.
          try {
            String toAddress =
                WalletApi.encode58Check(noteTx.getTransparentToAddress().toByteArray());
            System.out.println("\t\t transparent_to_address: " + toAddress);
          } catch (Exception e) {
            System.out.println("\t\t transparent_to_address: "
                + ByteArray.toHexString(noteTx.getTransparentToAddress().toByteArray()));
          }
          System.out.println("\t\t transparent_amount: " + noteTx.getToAmount());
        }
        System.out.println("\t\t tx_id: " + ByteArray.toHexString(noteTx.getTxid().toByteArray()));
        System.out.println("\t}");
      }
      System.out.println("]");
    } else {
      System.out.println("No notes found!");
    }
    return true;
  }

  public boolean sendShieldedTRC20Coin(int shieldedContractType, BigInteger fromAmount,
                                       List<Long> shieldedInputList,
                                       List<GrpcAPI.Note> shieldedOutputList,
                                       String toAddress, BigInteger toAmount,
                                       String contractAddress, String shieldedContractAddress)
      throws CipherException, IOException, CancelException, ZksnarkException {
    BigInteger scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
    if (shieldedContractType == 0
        && BigInteger.valueOf(shieldedOutputList.get(0).getValue())
                     .multiply(scalingFactor)
                     .compareTo(fromAmount) != 0) {
      System.out.println("MINT: fromPublicAmount must be equal to note amount.");
      return false;
    }
    if (shieldedContractType == 2) {
      ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
          .get(shieldedInputList.get(0));
      BigInteger valueBalanceBi = noteInfo.getRawValue();
      if (shieldedOutputList.size() > 0) {
        valueBalanceBi = valueBalanceBi.subtract(BigInteger.valueOf(
            shieldedOutputList.get(0).getValue()).multiply(scalingFactor));
      }
      if (valueBalanceBi.compareTo(toAmount) != 0) {
        System.out.println("BURN: shielded input amount must be equal to output amount.");
        return false;
      }
    }

    PrivateShieldedTRC20Parameters.Builder builder = PrivateShieldedTRC20Parameters.newBuilder();
    builder.setFromAmount(fromAmount.toString());
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    if (shieldedContractAddressBytes == null) {
      System.out.println("Invalid shieldedContractAddress.");
      return false;
    }
    builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(shieldedContractAddressBytes));

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount.toString());
    }

    long valueBalance = 0;
    if (!shieldedInputList.isEmpty()) {
      List<String> rootAndPath = new ArrayList<>();
      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        long position = noteInfo.getPosition();
        rootAndPath.add(getRootAndPath(shieldedContractAddress, position));
      }
      if (rootAndPath.isEmpty() || rootAndPath.size() != shieldedInputList.size()) {
        System.out.println("Can't get all merkle tree, please check the notes.");
        return false;
      }

      for(int i = 0; i < rootAndPath.size(); i++) {
        if (rootAndPath.get(i) == null) {
          System.out.println("Can't get merkle path, please check the note " + i + ".");
          return false;
        }
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldedAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedTRC20Wrapper.getInstance().getShieldedAddressInfoMap().get(shieldedAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getRawValue().toString());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("position " + noteInfo.getPosition());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        byte[] eachRootAndPath = ByteArray.fromHexString(rootAndPath.get(i));
        byte[] root = Arrays.copyOfRange(eachRootAndPath, 0, 32);
        byte[] path = Arrays.copyOfRange(eachRootAndPath, 32, 1056);
        SpendNoteTRC20.Builder spendTRC20NoteBuilder = SpendNoteTRC20.newBuilder();
        spendTRC20NoteBuilder.setNote(noteBuild.build());
        spendTRC20NoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendTRC20NoteBuilder.setRoot(ByteString.copyFrom(root));
        spendTRC20NoteBuilder.setPath(ByteString.copyFrom(path));
        spendTRC20NoteBuilder.setPos(noteInfo.getPosition());

        valueBalance = Math.addExact(valueBalance, noteInfo.getValue());
        builder.addShieldedSpends(spendTRC20NoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure, please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); i++) {
        GrpcAPI.Note note = shieldedOutputList.get(i);
        valueBalance = Math.subtractExact(valueBalance, note.getValue());
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(note).build());
      }
    }
    if (shieldedContractType == 1 && valueBalance != 0) {
      System.out.println("TRANSFER: the sum of shielded input amount should be equal to the " +
              "sum of shielded output amount");
      return false;
    }
    ShieldedTRC20Parameters parameters =
        WalletApi.createShieldedContractParameters(builder.build());
    if (parameters == null) {
      System.out.println("CreateShieldedContractParameters failed, please check input data!");
      return false;
    }
    String inputData = parameters.getTriggerContractInput();
    if (inputData == null) {
      System.out.println("CreateShieldedContractParameters failed, please check input data!");
      return false;
    }

    if (shieldedContractType == 0) { //MINT
      boolean setAllowanceResult = setAllowance(contractAddress, shieldedContractAddress,
          fromAmount);
      if (!setAllowanceResult) {
        System.out.println("SetAllowance failed, please check wallet account!");
        return false;
      }
      boolean mintResult = triggerShieldedContract(shieldedContractAddress, inputData, 0);
      if (mintResult) {
        System.out.println("MINT succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract MINT failed!!");
        return false;
      }
    } else if (shieldedContractType == 1) { //TRANSFER
      boolean transferResult = triggerShieldedContract(shieldedContractAddress, inputData, 1);
      if (transferResult) {
        System.out.println("TRANSFER succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract TRANSFER failed!");
        return false;
      }
    } else if (shieldedContractType == 2) { //BURN
      boolean burnResult = triggerShieldedContract(shieldedContractAddress, inputData, 2);
      if (burnResult) {
        System.out.println("BURN succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract BURN failed!");
        return false;
      }
    } else {
      System.out.println("Unsupported shieldedContractType!");
      return false;
    }
  }

  public boolean sendShieldedTRC20CoinWithoutAsk(int shieldedContractType, BigInteger fromAmount,
                                                 List<Long> shieldedInputList,
                                                 List<GrpcAPI.Note> shieldedOutputList,
                                                 String toAddress, BigInteger toAmount,
                                                 String contractAddress,
                                                 String shieldedContractAddress)
      throws CipherException, IOException, CancelException, ZksnarkException {
    BigInteger scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
    if (shieldedContractType == 0
        && BigInteger.valueOf(shieldedOutputList.get(0).getValue())
                     .multiply(scalingFactor)
                     .compareTo(fromAmount) != 0) {
      System.out.println("MINT: fromPublicAmount must be equal to note amount.");
      return false;
    }
    if (shieldedContractType == 2) {
      ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
          .get(shieldedInputList.get(0));
      BigInteger valueBalanceBi = noteInfo.getRawValue();
      if (shieldedOutputList.size() > 0) {
        valueBalanceBi = valueBalanceBi.subtract(BigInteger.valueOf(
            shieldedOutputList.get(0).getValue()).multiply(scalingFactor));
      }
      if (valueBalanceBi.compareTo(toAmount) != 0) {
        System.out.println("BURN: shielded input amount must be equal to output amount.");
        return false;
      }
    }

    PrivateShieldedTRC20ParametersWithoutAsk.Builder builder =
        PrivateShieldedTRC20ParametersWithoutAsk.newBuilder();
    builder.setFromAmount(fromAmount.toString());
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    if (shieldedContractAddressBytes == null) {
      System.out.println("Invalid shieldedContractAddress.");
      return false;
    }
    builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(shieldedContractAddressBytes));

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount.toString());
    }

    byte[] ask = new byte[32];
    long valueBalance = 0;
    if (!shieldedInputList.isEmpty()) {
      List<String> rootAndPath = new ArrayList<>();
      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        long position = noteInfo.getPosition();
        rootAndPath.add(getRootAndPath(shieldedContractAddress, position));
      }
      if (rootAndPath.isEmpty() || rootAndPath.size() != shieldedInputList.size()) {
        System.out.println("Can't get all merkle tree, please check the notes.");
        return false;
      }

      for(int i = 0; i < rootAndPath.size(); i++) {
        if (rootAndPath.get(i) == null) {
          System.out.println("Can't get merkle path, please check the note " + i + ".");
          return false;
        }
      }

      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedTRC20Wrapper.getInstance().getShieldedAddressInfoMap().get(shieldAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          System.arraycopy(expandedSpendingKey.getAsk(), 0, ask, 0, 32);
          builder.setAk(ByteString.copyFrom(
              ExpandedSpendingKey.getAkFromAsk(expandedSpendingKey.getAsk())));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getRawValue().toString());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("position " + noteInfo.getPosition());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        byte[] eachRootAndPath = ByteArray.fromHexString(rootAndPath.get(i));
        byte[] root = Arrays.copyOfRange(eachRootAndPath, 0, 32);
        byte[] path = Arrays.copyOfRange(eachRootAndPath, 32, 1056);
        SpendNoteTRC20.Builder spendTRC20NoteBuilder = SpendNoteTRC20.newBuilder();
        spendTRC20NoteBuilder.setNote(noteBuild.build());
        spendTRC20NoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendTRC20NoteBuilder.setRoot(ByteString.copyFrom(root));
        spendTRC20NoteBuilder.setPath(ByteString.copyFrom(path));
        spendTRC20NoteBuilder.setPos(noteInfo.getPosition());

        builder.addShieldedSpends(spendTRC20NoteBuilder.build());
        valueBalance = Math.addExact(valueBalance, noteInfo.getValue());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        GrpcAPI.Note note = shieldedOutputList.get(i);
        valueBalance = Math.subtractExact(valueBalance, note.getValue());
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(note).build());
      }
    }

    if (shieldedContractType == 1 && valueBalance != 0) {
      System.out.println("TRANSFER: the sum of shielded input amount should be equal to the " +
          "sum of shielded output amount.");
      return false;
    }

    ShieldedTRC20Parameters parameters =
        WalletApi.createShieldedContractParametersWithoutAsk(builder.build(), ask);
    if (parameters == null) {
      System.out.println("CreateShieldedContractParametersWithoutAsk failed,"
          + " please check input data!");
      return false;
    }

    String inputData = parameters.getTriggerContractInput();
    if (inputData == null) {
      System.out.println("CreateShieldedContractParametersWithoutAsk failed, " +
          "please check input data!");
      return false;
    }
    if (shieldedContractType == 0) { //MINT
      boolean setAllowanceResult = setAllowance(contractAddress, shieldedContractAddress,
          fromAmount);
      if (!setAllowanceResult) {
        System.out.println("SetAllowance failed, please check wallet account!");
        return false;
      }
      boolean mintResult = triggerShieldedContract(shieldedContractAddress, inputData, 0);
      if (mintResult) {
        System.out.println("MINT succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract MINT failed!!");
        return false;
      }
    } else if (shieldedContractType == 1) { //TRANSFER
      boolean transferResult = triggerShieldedContract(shieldedContractAddress, inputData, 1);
      if (transferResult) {
        System.out.println("TRANSFER succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract TRANSFER failed!");
        return false;
      }
    } else if (shieldedContractType == 2) { //BURN
      boolean burnResult = triggerShieldedContract(shieldedContractAddress, inputData, 2);
      if (burnResult) {
        System.out.println("BURN succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract BURN failed!");
        return false;
      }
    } else {
      System.out.println("Error shieldedContractType!");
      return false;
    }
  }

  public String getRootAndPath(String address, long position) {
    byte[] shieldedContractAddress = WalletApi.decodeFromBase58Check(address);
    String methodStr = "getPath(uint256)";
    byte[] indexBytes = ByteArray.fromLong(position);
    String argsStr = ByteArray.toHexString(indexBytes);
    argsStr = "000000000000000000000000000000000000000000000000" + argsStr;
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, true));
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: getRootAndPath failed,  Please login wallet first !!");
      return null;
    }
    return wallet.constantCallShieldedContract(shieldedContractAddress, input, methodStr);
  }

  public String getScalingFactor(byte[] address) {
    String methodStr = "scalingFactor()";
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, "", false));
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: get Scaling Factor failed,  Please login wallet first !!");
      return null;
    }
    String scalingFactorHexStr = wallet.constantCallShieldedContract(address, input, methodStr);
    if (scalingFactorHexStr != null) {
      return scalingFactorHexStr;
    } else {
      System.out.println("Get Scaling Factor failed!! Please check shielded contract!");
      return null;
    }
  }

  public boolean setAllowance(String contractAddress, String shieldedContractAddress,
      BigInteger value) throws CipherException, IOException, CancelException {
    byte[] contractAddressBytes = WalletApi.decodeFromBase58Check(contractAddress);
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    String methodStr = "approve(address,uint256)";
    byte[] mergedBytes = ByteUtil.merge(new byte[11], shieldedContractAddressBytes,
        ByteUtil.bigIntegerToBytes(value, 32));
    String argsStr = ByteArray.toHexString(mergedBytes);
    byte[] inputData = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, true));
    byte[] ownerAddress = wallet.getAddress();

    return callContract(ownerAddress, contractAddressBytes, 0, inputData, 20_000_000L,
        0, "", false);
  }

  public boolean triggerShieldedContract(String contractAddress, String data,
                                         int shieldedContractType)
      throws CipherException, IOException, CancelException {
    byte[] contractAddressBytes = WalletApi.decodeFromBase58Check(contractAddress);
    String methodStr;
    if (shieldedContractType == 0) {
      methodStr = "mint(uint256,bytes32[9],bytes32[2],bytes32[21])";
    } else if (shieldedContractType == 1) {
      methodStr = "transfer(bytes32[10][],bytes32[2][],bytes32[9][],bytes32[2],bytes32[21][])";
    } else if (shieldedContractType == 2) {
      methodStr = "burn(bytes32[10],bytes32[2],uint256,bytes32[2],address,bytes32[3],bytes32[9][],bytes32[21][])";
    } else {
      System.out.println("unsupported shieldedContractType! ");
      return false;
    }
    byte[] inputData = Hex.decode(AbiUtil.parseMethod(methodStr, data, true));
    byte[] ownerAddress = wallet.getAddress();

    return callContract(ownerAddress, contractAddressBytes, 0, inputData, 200_000_000L,
        0, "", false);
  }

  public static Optional<TransactionInfoList> getTransactionInfoByBlockNum(long blockNum) {
    return WalletApi.getTransactionInfoByBlockNum(blockNum);
  }

  public boolean marketSellAsset(
      byte[] owner,
      byte[] sellTokenId,
      long sellTokenQuantity,
      byte[] buyTokenId,
      long buyTokenQuantity)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }
    return wallet.marketSellAsset(owner, sellTokenId, sellTokenQuantity,
        buyTokenId, buyTokenQuantity);
  }

  public boolean marketCancelOrder(byte[] owner, byte[] orderId)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting failed,  Please login first !!");
      return false;
    }
    return wallet.marketCancelOrder(owner, orderId);
  }

  public Optional<MarketOrderList> getMarketOrderByAccount(byte[] address) {
    return WalletApi.getMarketOrderByAccount(address);
  }

  public Optional<MarketPriceList> getMarketPriceByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return WalletApi.getMarketPriceByPair(sellTokenId, buyTokenId);
  }


  public Optional<MarketOrderList> getMarketOrderListByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return WalletApi.getMarketOrderListByPair(sellTokenId, buyTokenId);
  }


  public Optional<MarketOrderPairList> getMarketPairList() {
    return WalletApi.getMarketPairList();
  }

  public Optional<MarketOrder> getMarketOrderById(byte[] order) {
    return WalletApi.getMarketOrderById(order);
  }

  public BlockExtention getBlock(String idOrNum, boolean detail) {
    return WalletApi.getBlock(idOrNum, detail);
  }

}
