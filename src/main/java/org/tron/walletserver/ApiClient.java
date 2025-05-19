package org.tron.walletserver;

import static org.tron.common.NetType.NILE;
import static org.tron.common.utils.AbiUtil.generateOccupationConstantPrivateKey;
import static org.tron.common.utils.ByteArray.toHexString;
import static org.tron.keystore.StringUtils.byte2String;
import static org.tron.trident.core.NodeType.FULL_NODE;
import static org.tron.trident.core.NodeType.SOLIDITY_NODE;
import static org.tron.trident.core.utils.Utils.encode58Check;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import org.bouncycastle.util.encoders.Hex;
import org.tron.trident.abi.datatypes.Type;
import org.tron.trident.api.GrpcAPI;
import org.tron.trident.core.ApiWrapper;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;
import org.tron.walletcli.ApiClientFactory;

public class ApiClient {
  private ApiWrapper client;
  public ApiClient() {
    client = ApiClientFactory.createClient(NILE, generateOccupationConstantPrivateKey());
  }

  public ApiClient(String privateKey) {
    client = ApiClientFactory.createClient(NILE, privateKey);
  }


  public Response.Account queryAccount(byte[] address) {
    String base58Address = encode58Check(address);
    Response.Account account = client.getAccount(base58Address, SOLIDITY_NODE);
    return (account != null) ? account : client.getAccount(base58Address, FULL_NODE);
  }

  public Response.Account queryAccountById(String accountId) {
    Response.Account account = client.getAccountById(accountId, SOLIDITY_NODE);
    return (account != null) ? account : client.getAccountById(accountId, FULL_NODE);
  }

  public Response.TransactionExtention transfer(byte[] owner, byte[] to, long amount) throws IllegalException {
    return client.transfer(encode58Check(owner), encode58Check(to), amount);
  }

  public boolean broadcastTransaction(Chain.Transaction signaturedTransaction) {
    try {
      client.broadcastTransaction(signaturedTransaction);
    } catch (RuntimeException e) {
      System.out.println(e.getMessage());
      return false;
    }
    return true;
  }

  public Response.TransactionSignWeight getTransactionSignWeight(Chain.Transaction transaction) {
    return client.getTransactionSignWeight(transaction);
  }

  public Response.TransactionExtention updateAccount(byte[] owner, byte[] accountNameBytes)
      throws IllegalException {
    return client.updateAccount(encode58Check(owner), byte2String(accountNameBytes));
  }

  public Chain.Transaction setAccountId(byte[] accountIdBytes, byte[] owner) throws IllegalException {
    return client.setAccountId(byte2String(accountIdBytes), encode58Check(owner));
  }

  public Response.TransactionExtention updateAsset(byte[] owner, byte[] description, byte[] url, long newLimit, long newPublicLimit) throws IllegalException {
    return client.updateAsset(encode58Check(owner), byte2String(description), byte2String(url), newLimit, newPublicLimit);
  }

  public Response.TransactionExtention transferTrc10(byte[] owner, byte[] to, byte[] assertName, long amount) throws IllegalException {
    return client.transferTrc10(encode58Check(owner), encode58Check(to), Integer.parseInt(byte2String(assertName)), amount);
  }

  public Response.TransactionExtention participateAssetIssueTransaction(byte[] owner, byte[] to, byte[] assertName, long amount) throws IllegalException {
    return client.participateAssetIssue(encode58Check(owner), encode58Check(to), byte2String(assertName), amount);
  }

  public Response.TransactionExtention createAssetIssue(byte[] ownerAddress, String name, String abbrName, long totalSupply, int trxNum, int icoNum, long startTime, long endTime, String url, long freeNetLimit, long publicFreeNetLimit, int precision, HashMap<String, String> frozenSupply, String description) throws IllegalException {
    return client.createAssetIssue(encode58Check(ownerAddress), name, abbrName, totalSupply, trxNum, icoNum, startTime, endTime, url, freeNetLimit, publicFreeNetLimit, precision, frozenSupply, description);
  }

  public Response.TransactionExtention createAccount(byte[] owner, byte[] address) throws IllegalException {
    return client.createAccount(encode58Check(owner), encode58Check(address));
  }

  public Response.TransactionExtention createWitness(byte[] owner, byte[] url) throws IllegalException {
    return client.createWitness(encode58Check(owner), byte2String(url));
  }

  public Response.TransactionExtention updateWitness(byte[] owner, byte[] url) throws IllegalException {
    return client.updateWitness(encode58Check(owner), byte2String(url));
  }

  public Response.TransactionExtention voteWitness(byte[] owner, HashMap<String, String> witness) throws IllegalException {
    return client.voteWitness(encode58Check(owner), witness);
  }

  public Chain.Transaction getTransactionById(String txId) throws IllegalException {
    Chain.Transaction transaction = client.getTransactionById(txId, SOLIDITY_NODE);
    return (transaction != null) ? transaction : client.getTransactionById(txId, FULL_NODE);
  }

  public Response.TransactionExtention freezeBalance(byte[] ownerAddress, long frozenBalance, int frozenDuration, int resourceCode, byte[] receiverAddress) throws IllegalException {
    return client.freezeBalance(encode58Check(ownerAddress), frozenBalance, frozenDuration, resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention freezeBalanceV2(byte[] ownerAddress, long frozenBalance, int resourceCode) throws IllegalException {
    return client.freezeBalanceV2(encode58Check(ownerAddress), frozenBalance, resourceCode);
  }

  public Response.TransactionExtention unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress) throws IllegalException {
    return client.unfreezeBalance(encode58Check(ownerAddress), resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance, int resourceCode) throws IllegalException {
    return client.unfreezeBalanceV2(encode58Check(ownerAddress), unfreezeBalance, resourceCode);
  }

  public Response.TransactionExtention delegateResource(byte[] ownerAddress, long balance, int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod) throws IllegalException {
    return client.delegateResourceV2(encode58Check(ownerAddress), balance, resourceCode, encode58Check(receiverAddress), lock, lockPeriod);
  }

  public Response.TransactionExtention unDelegateResource(byte[] ownerAddress, long balance, int resourceCode, byte[] receiverAddress) throws IllegalException {
    return client.undelegateResource(encode58Check(ownerAddress), balance, resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention cancelAllUnfreezeV2(byte[] address) throws IllegalException {
    return client.cancelAllUnfreezeV2(encode58Check(address));
  }

  public Response.TransactionExtention unfreezeAsset(byte[] ownerAddress) throws IllegalException {
    return client.unfreezeAsset(encode58Check(ownerAddress));
  }

  public Response.TransactionExtention withdrawBalance(byte[] ownerAddress) throws IllegalException {
    return client.withdrawBalance(encode58Check(ownerAddress));
  }

  public Response.TransactionExtention proposalCreate(byte[] owner, HashMap<Long, Long> parametersMap) throws IllegalException {
    return client.proposalCreate(encode58Check(owner), parametersMap);
  }

  public Response.TransactionExtention approveProposal(byte[] owner, long id, boolean isAddApproval) throws IllegalException {
    return client.approveProposal(encode58Check(owner), id, isAddApproval);
  }

  public Response.TransactionExtention deleteProposal(byte[] owner, long id) throws IllegalException {
    return client.deleteProposal(encode58Check(owner), id);
  }

  public Response.TransactionExtention exchangeCreate(byte[] owner, byte[] firstTokenId, long firstTokenBalance, byte[] secondTokenId, long secondTokenBalance) throws IllegalException {
    return client.exchangeCreate(encode58Check(owner), byte2String(firstTokenId), firstTokenBalance, byte2String(secondTokenId), secondTokenBalance);
  }

  public Response.TransactionExtention exchangeInject(byte[] owner, long exchangeId, byte[] tokenId, long quant) throws IllegalException {
    return client.exchangeInject(encode58Check(owner), exchangeId, byte2String(tokenId), quant);
  }

  public Response.TransactionExtention exchangeWithdraw(byte[] owner, long exchangeId, byte[] tokenId, long quant) throws IllegalException {
    return client.exchangeWithdraw(encode58Check(owner), exchangeId, byte2String(tokenId), quant);
  }

  public Response.TransactionExtention exchangeTransaction(byte[] owner, long exchangeId, byte[] tokenId, long quant, long expected) throws IllegalException {
    return client.exchangeTransaction(encode58Check(owner), exchangeId, byte2String(tokenId), quant, expected);
  }

  public Response.TransactionExtention updateSetting(byte[] owner, byte[] contractAddress, long consumeUserResourcePercent) throws IllegalException {
    return client.updateSetting(encode58Check(owner), encode58Check(contractAddress), consumeUserResourcePercent);
  }

  public Response.TransactionExtention updateEnergyLimit(byte[] owner, byte[] contractAddress, long originEnergyLimit) throws IllegalException {
    return client.updateEnergyLimit(encode58Check(owner), encode58Check(contractAddress), originEnergyLimit);
  }

//  public Response.TransactionExtention deployContract(String contractName, String abi, String code, long feeLimit, long value, long consumeUserResourcePercent, long originEnergyLimit, long tokenValue, String tokenId, String libraryAddressPair, String compilerVersion) {
//    return client.deployContract(contractName, abi, code, constructorParams, feeLimit, consumeUserResourcePercent, originEnergyLimit, value, tokenId, tokenValue);
//  }

  public Response.EstimateEnergyMessage estimateEnergy(byte[] owner, byte[] contractAddress, long callValue, byte[] data, long tokenValue, String tokenId) {
    return client.estimateEnergy(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, FULL_NODE);
  }

  public Response.TransactionExtention accountPermissionUpdate(Contract.AccountPermissionUpdateContract contract) throws IllegalException {
    return client.accountPermissionUpdate(contract);
  }

  public Response.TransactionExtention updateBrokerage(byte[] owner, int brokerage) throws IllegalException {
    return client.updateBrokerage(encode58Check(owner), brokerage);
  }

  public GrpcAPI.NumberMessage getReward(byte[] owner) {
    org.tron.trident.api.GrpcAPI.NumberMessage numberMessage = client.getRewardInfo(encode58Check(owner), SOLIDITY_NODE);
    return (numberMessage != null) ? numberMessage : client.getRewardInfo(encode58Check(owner), FULL_NODE);
  }

  public Response.TransactionExtention marketSellAsset(byte[] owner, byte[] sellTokenId, long sellTokenQuantity, byte[] buyTokenId, long buyTokenQuantity) throws IllegalException {
    return client.marketSellAsset(encode58Check(owner), byte2String(sellTokenId), sellTokenQuantity, byte2String(buyTokenId), buyTokenQuantity);
  }

  public Response.TransactionExtention marketCancelOrder(byte[] owner, byte[] orderId) throws IllegalException {
    return client.marketCancelOrder(encode58Check(owner), toHexString(orderId));
  }

  public Response.TransactionApprovedList getTransactionApprovedList(Chain.Transaction transaction) {
    return client.getTransactionApprovedList(transaction);
  }

  public Chain.Block getBlock(long blockNum) throws IllegalException {
    if (blockNum < 0) {
      Chain.Block block = client.getNowBlock(SOLIDITY_NODE);
      return block != null ? block : client.getNowBlock(FULL_NODE);
    }
    return client.getBlockByIdOrNum(String.valueOf(blockNum));
  }

  public Response.BlockExtention getBlock2(long blockNum) throws IllegalException {
    if (blockNum < 0) {
      Response.BlockExtention blockExtention = client.getNowBlock2(SOLIDITY_NODE);
      return blockExtention != null ? blockExtention : client.getNowBlock2(FULL_NODE);
    }
    Response.BlockExtention blockExtention = client.getBlockByNum(blockNum, SOLIDITY_NODE);
    return blockExtention != null ? blockExtention : client.getBlockByNum(blockNum, FULL_NODE);
  }

  public long getTransactionCountByBlockNum(long blockNum) {
    long count = client.getTransactionCountByBlockNum(blockNum, SOLIDITY_NODE);
    return count != 0 ? count : client.getTransactionCountByBlockNum(blockNum, FULL_NODE);
  }

  public Response.AssetIssueList getAssetIssueList() {
    Response.AssetIssueList assetIssueList = client.getAssetIssueList(SOLIDITY_NODE);
    return assetIssueList != null ? assetIssueList : client.getAssetIssueList(FULL_NODE);
  }

  public Response.AssetIssueList getPaginatedAssetIssueList(long offset, long limit) {
    Response.AssetIssueList paginatedAssetIssueList = client.getPaginatedAssetIssueList(offset, limit, SOLIDITY_NODE);
    return paginatedAssetIssueList != null ? paginatedAssetIssueList : client.getPaginatedAssetIssueList(offset, limit, FULL_NODE);
  }

  public Response.ProposalList getPaginatedProposalList(long offset, long limit) {
    return client.getPaginatedProposalList(offset, limit);
  }

  public Response.ExchangeList getPaginatedExchangeList(long offset, long limit) {
    return client.getPaginatedExchangeList(offset, limit);
  }

  public Response.NodeList listNodes() throws IllegalException {
    return client.listNodes();
  }

  public Response.AssetIssueList getAssetIssueByAccount(byte[] address) {
    return client.getAssetIssueByAccount(encode58Check(address));
  }

  public Response.AccountNetMessage getAccountNet(byte[] address) {
    return client.getAccountNet(encode58Check(address));
  }

  public Response.AccountResourceMessage getAccountResource(byte[] address) {
    return client.getAccountResource(encode58Check(address));
  }

  public Contract.AssetIssueContract getAssetIssueByName(String assetName) {
    Contract.AssetIssueContract assetIssueByName = client.getAssetIssueByName(assetName, SOLIDITY_NODE);
    return assetIssueByName != null ? assetIssueByName : client.getAssetIssueByName(assetName, FULL_NODE);
  }

  public Response.AssetIssueList getAssetIssueListByName(String assetName) {
    Response.AssetIssueList assetIssueContract = client.getAssetIssueListByName(assetName, SOLIDITY_NODE);
    return assetIssueContract != null ? assetIssueContract : client.getAssetIssueListByName(assetName, FULL_NODE);
  }

  public Contract.AssetIssueContract getAssetIssueById(String assetId) {
    Contract.AssetIssueContract assetIssueContract = client.getAssetIssueById(assetId, SOLIDITY_NODE);
    return assetIssueContract != null ? assetIssueContract : client.getAssetIssueById(assetId, FULL_NODE);
  }

  public long getNextMaintenanceTime() {
    return client.getNextMaintenanceTime();
  }

  public Response.TransactionInfo getTransactionInfoById(String txId) throws IllegalException {
    Response.TransactionInfo transactionInfo = client.getTransactionInfoById(txId, SOLIDITY_NODE);
    return transactionInfo != null ? transactionInfo : client.getTransactionInfoById(txId, FULL_NODE);
  }

  public Response.TransactionExtention withdrawExpireUnfreeze(byte[] ownerAddress) throws IllegalException {
    return client.withdrawExpireUnfreeze(encode58Check(ownerAddress));
  }

  public Chain.Block getBlockById(String blockID) {
    return client.getBlockById(blockID);
  }

  public Response.BlockListExtention getBlockByLimitNext(long start, long end) throws IllegalException {
    return client.getBlockByLimitNext(start, end);
  }

  public Response.BlockListExtention getBlockByLatestNum2(long num) throws IllegalException {
    return client.getBlockByLatestNum(num);
  }

  public Response.ProposalList listProposals() {
    return client.listProposals();
  }

  public Response.DelegatedResourceList getDelegatedResource(String fromAddress, String toAddress) {
    Response.DelegatedResourceList delegatedResourceList = client.getDelegatedResource(fromAddress, toAddress, SOLIDITY_NODE);
    return delegatedResourceList != null ? delegatedResourceList : client.getDelegatedResource(fromAddress, toAddress, FULL_NODE);
  }

  public Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndex(String ownerAddress) {
    Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex = client.getDelegatedResourceAccountIndex(ownerAddress, SOLIDITY_NODE);
    return delegatedResourceAccountIndex != null ? delegatedResourceAccountIndex : client.getDelegatedResourceAccountIndex(ownerAddress, FULL_NODE);
  }

  public Response.DelegatedResourceList getDelegatedResourceV2(String fromAddress, String toAddress) {
    Response.DelegatedResourceList delegatedResourceV2 = client.getDelegatedResourceV2(fromAddress, toAddress, SOLIDITY_NODE);
    return delegatedResourceV2 != null ? delegatedResourceV2 : client.getDelegatedResourceV2(fromAddress, toAddress, FULL_NODE);
  }

  public Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndexV2(String ownerAddress) throws IllegalException {
    Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex = client.getDelegatedResourceAccountIndexV2(ownerAddress, SOLIDITY_NODE);
    return delegatedResourceAccountIndex != null ? delegatedResourceAccountIndex : client.getDelegatedResourceAccountIndexV2(ownerAddress, FULL_NODE);
  }

  public Response.Proposal getProposal(String id) {
    return client.getProposalById(id);
  }

  public long getCanWithdrawUnfreezeAmount(byte[] ownerAddress, long timestamp) {
    try {
      return client.getCanWithdrawUnfreezeAmount(encode58Check(ownerAddress), timestamp, SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getCanWithdrawUnfreezeAmount(encode58Check(ownerAddress), timestamp, FULL_NODE);
    }
  }

  public long getCanDelegatedMaxSize(byte[] ownerAddress, int type) {
    try {
      return client.getCanDelegatedMaxSize(encode58Check(ownerAddress), type, SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getCanDelegatedMaxSize(encode58Check(ownerAddress), type, FULL_NODE);
    }
  }

  public long getAvailableUnfreezeCount(byte[] ownerAddress) {
    try {
      return client.getAvailableUnfreezeCount(encode58Check(ownerAddress), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getAvailableUnfreezeCount(encode58Check(ownerAddress), FULL_NODE);
    }
  }

  public Response.ExchangeList listExchanges() {
    try {
      return client.listExchanges(SOLIDITY_NODE);
    } catch (Exception e) {
      return client.listExchanges(FULL_NODE);
    }
  }

  public Response.Exchange getExchange(String id) throws IllegalException {
    try {
      return client.getExchangeById(id, SOLIDITY_NODE);
    } catch (IllegalException e) {
      return client.getExchangeById(id, FULL_NODE);
    }
  }

  public Response.ChainParameters getChainParameters() throws IllegalException {
    return client.getChainParameters();
  }

  public Response.TransactionExtention clearContractABI(byte[] owner, byte[] contractAddress) throws IllegalException {
    return client.clearContractABI(encode58Check(owner), encode58Check(contractAddress));
  }

  public Common.SmartContract getContract(byte[] address) {
    return client.getSmartContract(encode58Check(address));
  }

  public Response.SmartContractDataWrapper getContractInfo(byte[] address) {
    return client.getContractInfo(encode58Check(address));
  }

  public long getBrokerage(byte[] owner) {
    try {
      return client.getBrokerageInfo(encode58Check(owner), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getBrokerageInfo(encode58Check(owner), FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getBandwidthPrices() {
    try {
      return client.getBandwidthPrices(SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getBandwidthPrices(FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getEnergyPrices() {
    try {
      return client.getEnergyPrices(SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getEnergyPrices(FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getMemoFee() {
    return client.getMemoFee();
  }

  public Response.TransactionExtention triggerConstantContract(byte[] address, byte[] contractAddress, byte[] data) {
    return client.triggerConstantContract(encode58Check(address), encode58Check(contractAddress), Hex.toHexString(data), FULL_NODE);
  }

  public Response.TransactionInfoList getTransactionInfoByBlockNum(long blockNum) throws IllegalException {
    try {
      return client.getTransactionInfoByBlockNum(blockNum, SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getTransactionInfoByBlockNum(blockNum, FULL_NODE);
    }
  }

  public Response.MarketOrderList getMarketOrderByAccount(byte[] address) {
    try {
      return client.getMarketOrderByAccount(encode58Check(address), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getMarketOrderByAccount(encode58Check(address), FULL_NODE);
    }
  }

  public Response.BlockExtention getBlock(String idOrNum, boolean detail) {
    try {
      return client.getBlock(idOrNum, detail, SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getBlock(idOrNum, detail, FULL_NODE);
    }
  }

  public Response.MarketOrder getMarketOrderById(byte[] order) {
    try {
      return client.getMarketOrderById(Hex.toHexString(order), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getMarketOrderById(Hex.toHexString(order), FULL_NODE);
    }
  }

  public Response.MarketOrderPairList getMarketPairList() {
    try {
      return client.getMarketPairList(SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getMarketPairList(FULL_NODE);
    }
  }

  public Response.MarketOrderList getMarketOrderListByPair(byte[] sellTokenId, byte[] buyTokenId) {
    try {
      return client.getMarketOrderListByPair(byte2String(sellTokenId), byte2String(buyTokenId), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getMarketOrderListByPair(byte2String(sellTokenId), byte2String(buyTokenId), FULL_NODE);
    }
  }

  public Response.MarketPriceList getMarketPriceByPair(byte[] sellTokenId, byte[] buyTokenId) {
    try {
      return client.getMarketPriceByPair(byte2String(sellTokenId), byte2String(buyTokenId), SOLIDITY_NODE);
    } catch (Exception e) {
      return client.getMarketPriceByPair(byte2String(sellTokenId), byte2String(buyTokenId), FULL_NODE);
    }
  }

  public Response.WitnessList listWitnesses() {
    try {
      return client.listWitnesses(SOLIDITY_NODE);
    } catch (Exception e) {
      return client.listWitnesses(FULL_NODE);
    }
  }

  public Response.TransactionExtention triggerConstantContract(byte[] owner, byte[] contractAddress, byte[] data, long callValue, long tokenValue, String tokenId) {
    try {
      return client.triggerConstantContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, SOLIDITY_NODE);
    } catch (Exception e) {
      return client.triggerConstantContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, FULL_NODE);
    }
  }

  public Response.TransactionExtention triggerContract(byte[] owner, byte[] contractAddress, byte[] data, long callValue, long tokenValue, String tokenId, long feeLimit) throws Exception {
    return client.triggerContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, feeLimit);
  }

  public Response.TransactionExtention deployContract(String contractName, String abi, String code, List<Type<?>> constructorParams, long feeLimit, long consumeUserResourcePercent, long originEnergyLimit, long value, String tokenId, long tokenValue) throws Exception {
    return client.deployContract(contractName, abi, code, constructorParams, feeLimit, consumeUserResourcePercent, originEnergyLimit, value, tokenId, tokenValue);
  }
}
