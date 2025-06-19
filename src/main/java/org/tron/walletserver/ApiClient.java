package org.tron.walletserver;

import static org.tron.common.enums.NetType.CUSTOM;
import static org.tron.common.utils.AbiUtil.generateOccupationConstantPrivateKey;
import static org.tron.common.utils.ByteArray.toHexString;
import static org.tron.keystore.StringUtils.byte2String;
import static org.tron.trident.core.NodeType.FULL_NODE;
import static org.tron.trident.core.NodeType.SOLIDITY_NODE;
import static org.tron.trident.core.utils.Utils.encode58Check;

import java.util.HashMap;
import java.util.List;
import lombok.Getter;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.enums.NetType;
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
  private static final String API_OCCUPATION_CONSTANT_PRIVATE_KEY = generateOccupationConstantPrivateKey();
  private final ApiWrapper client;
  @Getter
  private boolean emptyFullNode;
  @Getter
  private boolean emptySolidityNode;

  public ApiClient(NetType netType) {
    client = ApiClientFactory.createClient(netType, API_OCCUPATION_CONSTANT_PRIVATE_KEY);
  }

  public ApiClient(NetType netType, String privateKey) {
    client = ApiClientFactory.createClient(netType, privateKey);
  }
  public ApiClient(String fullnode, String solidityNode, boolean emptyFullNode, boolean emptySolidityNode) {
    this(fullnode, solidityNode, emptyFullNode, emptySolidityNode, API_OCCUPATION_CONSTANT_PRIVATE_KEY);
  }

  public ApiClient(String fullnode, String solidityNode, boolean emptyFullNode, boolean emptySolidityNode, String privateKey) {
    client = ApiClientFactory.createClient(CUSTOM, privateKey, fullnode, solidityNode);
    this.emptyFullNode = emptyFullNode;
    this.emptySolidityNode = emptySolidityNode;
  }

  public ApiClient(String fullnode, String solidityNode) {
    this(fullnode, solidityNode, false, false);
  }

  public void close() {
    client.close();
  }

  public Response.Account queryAccount(byte[] address) {// pass
    String base58Address = encode58Check(address);
    if (!emptySolidityNode) {
      return client.getAccount(base58Address, SOLIDITY_NODE);
    } else {
      return client.getAccount(base58Address, FULL_NODE);
    }
  }

  public Response.Account queryAccountById(String accountId) {// pass
    if (!emptySolidityNode) {
      return client.getAccountById(accountId, SOLIDITY_NODE);
    } else {
      return client.getAccountById(accountId, FULL_NODE);
    }
  }

  public Response.TransactionExtention transfer(byte[] owner, byte[] to, long amount) throws IllegalException {// pass
    return client.transfer(encode58Check(owner), encode58Check(to), amount);
  }

  public boolean broadcastTransaction(Chain.Transaction signaturedTransaction) {// pass
    try {
      client.broadcastTransaction(signaturedTransaction);
    } catch (RuntimeException e) {
      System.out.println(e.getMessage());
      return false;
    }
    return true;
  }

  public Response.TransactionSignWeight getTransactionSignWeight(Chain.Transaction transaction) {// pass
    return client.getTransactionSignWeight(transaction);
  }

  public Response.TransactionExtention updateAccount(byte[] owner, byte[] accountNameBytes) // pass
      throws IllegalException {
    return client.updateAccount(encode58Check(owner), byte2String(accountNameBytes));
  }

  public Chain.Transaction setAccountId(byte[] accountIdBytes, byte[] owner) throws IllegalException {// pass
    return client.setAccountId(byte2String(accountIdBytes), encode58Check(owner));
  }

  public Response.TransactionExtention updateAsset(byte[] owner, byte[] description, byte[] url, long newLimit, long newPublicLimit) throws IllegalException {// pass
    return client.updateAsset(encode58Check(owner), byte2String(description), byte2String(url), newLimit, newPublicLimit);
  }

  public Response.TransactionExtention transferTrc10(byte[] owner, byte[] to, byte[] assertName, long amount) throws IllegalException {// pass
    return client.transferTrc10(encode58Check(owner), encode58Check(to), Integer.parseInt(byte2String(assertName)), amount);
  }

  public Response.TransactionExtention participateAssetIssueTransaction(byte[] owner, byte[] to, byte[] assertName, long amount) throws IllegalException {// pass
    return client.participateAssetIssue(encode58Check(to), encode58Check(owner), byte2String(assertName), amount);
  }

  public Response.TransactionExtention createAssetIssue(byte[] ownerAddress, String name, String abbrName, long totalSupply, int trxNum, int icoNum, long startTime, long endTime, String url, long freeNetLimit, long publicFreeNetLimit, int precision, HashMap<String, String> frozenSupply, String description) throws IllegalException {// pass
    return client.createAssetIssue(encode58Check(ownerAddress), name, abbrName, totalSupply, trxNum, icoNum, startTime, endTime, url, freeNetLimit, publicFreeNetLimit, precision, frozenSupply, description);
  }

  public Response.TransactionExtention createAccount(byte[] owner, byte[] address) throws IllegalException {// pass
    return client.createAccount(encode58Check(owner), encode58Check(address));
  }

  public Response.TransactionExtention createWitness(byte[] owner, byte[] url) throws IllegalException {// pass
    return client.createWitness(encode58Check(owner), byte2String(url));
  }

  public Response.TransactionExtention updateWitness(byte[] owner, byte[] url) throws IllegalException {// pass
    return client.updateWitness(encode58Check(owner), byte2String(url));
  }

  public Response.TransactionExtention voteWitness(byte[] owner, HashMap<String, String> witness) throws IllegalException {// pass
    return client.voteWitness(encode58Check(owner), witness);
  }

  public Chain.Transaction getTransactionById(String txId) throws IllegalException {// pass
    if (!emptySolidityNode) {
      return client.getTransactionById(txId, SOLIDITY_NODE);
    } else {
      return client.getTransactionById(txId, FULL_NODE);
    }
  }

  public Response.TransactionExtention freezeBalance(byte[] ownerAddress, long frozenBalance, int frozenDuration, int resourceCode, byte[] receiverAddress) throws IllegalException {// pass
    return client.freezeBalance(encode58Check(ownerAddress), frozenBalance, frozenDuration, resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention freezeBalanceV2(byte[] ownerAddress, long frozenBalance, int resourceCode) throws IllegalException {// pass
    return client.freezeBalanceV2(encode58Check(ownerAddress), frozenBalance, resourceCode);
  }

  public Response.TransactionExtention unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress) throws IllegalException {// pass
    return client.unfreezeBalance(encode58Check(ownerAddress), resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance, int resourceCode) throws IllegalException {// pass
    return client.unfreezeBalanceV2(encode58Check(ownerAddress), unfreezeBalance, resourceCode);
  }

  public Response.TransactionExtention delegateResource(byte[] ownerAddress, long balance, int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod) throws IllegalException {// pass
    return client.delegateResourceV2(encode58Check(ownerAddress), balance, resourceCode, encode58Check(receiverAddress), lock, lockPeriod);
  }

  public Response.TransactionExtention unDelegateResource(byte[] ownerAddress, long balance, int resourceCode, byte[] receiverAddress) throws IllegalException {// pass
    return client.undelegateResource(encode58Check(ownerAddress), balance, resourceCode, encode58Check(receiverAddress));
  }

  public Response.TransactionExtention cancelAllUnfreezeV2(byte[] address) throws IllegalException {// pass
    return client.cancelAllUnfreezeV2(encode58Check(address));
  }

  public Response.TransactionExtention unfreezeAsset(byte[] ownerAddress) throws IllegalException {// pass
    return client.unfreezeAsset(encode58Check(ownerAddress));
  }

  public Response.TransactionExtention withdrawBalance(byte[] ownerAddress) throws IllegalException {// pass
    return client.withdrawBalance(encode58Check(ownerAddress));
  }

  public Response.TransactionExtention proposalCreate(byte[] owner, HashMap<Long, Long> parametersMap) throws IllegalException {// pass
    return client.proposalCreate(encode58Check(owner), parametersMap);
  }

  public Response.TransactionExtention approveProposal(byte[] owner, long id, boolean isAddApproval) throws IllegalException {// pass
    return client.approveProposal(encode58Check(owner), id, isAddApproval);
  }

  public Response.TransactionExtention deleteProposal(byte[] owner, long id) throws IllegalException {// pass
    return client.deleteProposal(encode58Check(owner), id);
  }

  public Response.TransactionExtention exchangeCreate(byte[] owner, byte[] firstTokenId, long firstTokenBalance, byte[] secondTokenId, long secondTokenBalance) throws IllegalException {// pass
    return client.exchangeCreate(encode58Check(owner), byte2String(firstTokenId), firstTokenBalance, byte2String(secondTokenId), secondTokenBalance);
  }

  public Response.TransactionExtention exchangeInject(byte[] owner, long exchangeId, byte[] tokenId, long quant) throws IllegalException {// pass
    return client.exchangeInject(encode58Check(owner), exchangeId, byte2String(tokenId), quant);
  }

  public Response.TransactionExtention exchangeWithdraw(byte[] owner, long exchangeId, byte[] tokenId, long quant) throws IllegalException {// pass
    return client.exchangeWithdraw(encode58Check(owner), exchangeId, byte2String(tokenId), quant);
  }

  public Response.TransactionExtention exchangeTransaction(byte[] owner, long exchangeId, byte[] tokenId, long quant, long expected) throws IllegalException {// pass
    return client.exchangeTransaction(encode58Check(owner), exchangeId, byte2String(tokenId), quant, expected);
  }

  public Response.TransactionExtention updateSetting(byte[] owner, byte[] contractAddress, long consumeUserResourcePercent) throws IllegalException {// pass
    return client.updateSetting(encode58Check(owner), encode58Check(contractAddress), consumeUserResourcePercent);
  }

  public Response.TransactionExtention updateEnergyLimit(byte[] owner, byte[] contractAddress, long originEnergyLimit) throws IllegalException {// pass
    return client.updateEnergyLimit(encode58Check(owner), encode58Check(contractAddress), originEnergyLimit);
  }

  public Response.EstimateEnergyMessage estimateEnergy(byte[] owner, byte[] contractAddress, long callValue, byte[] data, long tokenValue, String tokenId) {// pass
    return client.estimateEnergy(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, FULL_NODE);
  }

  public Response.TransactionExtention accountPermissionUpdate(Contract.AccountPermissionUpdateContract contract) throws IllegalException {// pass
    return client.accountPermissionUpdate(contract);
  }

  public Response.TransactionExtention updateBrokerage(byte[] owner, int brokerage) throws IllegalException {// pass
    return client.updateBrokerage(encode58Check(owner), brokerage);
  }

  public GrpcAPI.NumberMessage getReward(byte[] owner) {// pass
    if (!emptySolidityNode) {
      return client.getRewardInfo(encode58Check(owner), SOLIDITY_NODE);
    } else {
      return client.getRewardInfo(encode58Check(owner), FULL_NODE);
    }
  }

  public Response.TransactionExtention marketSellAsset(byte[] owner, byte[] sellTokenId, long sellTokenQuantity, byte[] buyTokenId, long buyTokenQuantity) throws IllegalException { //pass
    return client.marketSellAsset(encode58Check(owner), byte2String(sellTokenId), sellTokenQuantity, byte2String(buyTokenId), buyTokenQuantity);
  }

  public Response.TransactionExtention marketCancelOrder(byte[] owner, byte[] orderId) throws IllegalException {// pass
    return client.marketCancelOrder(encode58Check(owner), toHexString(orderId));
  }

  public Response.TransactionApprovedList getTransactionApprovedList(Chain.Transaction transaction) {// pass
    return client.getTransactionApprovedList(transaction);
  }

  public Chain.Block getBlock(long blockNum) throws IllegalException {
    if (blockNum < 0) {
      if (!emptySolidityNode) {
        return client.getNowBlock(SOLIDITY_NODE);
      } else {
        return client.getNowBlock(FULL_NODE);
      }
    }
    return client.getBlockByIdOrNum(String.valueOf(blockNum));
  }

  public Response.BlockExtention getBlock2(long blockNum) throws IllegalException {// pass
    if (blockNum < 0) {
      if (!emptySolidityNode) {
        return client.getNowBlock2(SOLIDITY_NODE);
      } else {
        return client.getNowBlock2(FULL_NODE);
      }
    }
    if (!emptySolidityNode) {
      return client.getBlockByNum(blockNum, SOLIDITY_NODE);
    } else {
      return client.getBlockByNum(blockNum, FULL_NODE);
    }
  }

  public long getTransactionCountByBlockNum(long blockNum) {// pass
    if (!emptySolidityNode) {
      return client.getTransactionCountByBlockNum(blockNum, SOLIDITY_NODE);
    } else {
      return client.getTransactionCountByBlockNum(blockNum, FULL_NODE);
    }
  }

  public Response.AssetIssueList getAssetIssueList() {// pass
    if (!emptySolidityNode) {
      return client.getAssetIssueList(SOLIDITY_NODE);
    } else {
      return client.getAssetIssueList(FULL_NODE);
    }
  }

  public Response.AssetIssueList getPaginatedAssetIssueList(long offset, long limit) {// pass
    if (!emptySolidityNode) {
      return client.getPaginatedAssetIssueList(offset, limit, SOLIDITY_NODE);
    } else {
      return client.getPaginatedAssetIssueList(offset, limit, FULL_NODE);
    }
  }

  public Response.ProposalList getPaginatedProposalList(long offset, long limit) {// pass
    return client.getPaginatedProposalList(offset, limit);
  }

  public Response.ExchangeList getPaginatedExchangeList(long offset, long limit) {// pass
    return client.getPaginatedExchangeList(offset, limit);
  }

  public Response.NodeList listNodes() throws IllegalException {// pass
    return client.listNodes();
  }

  public Response.AssetIssueList getAssetIssueByAccount(byte[] address) {// pass
    return client.getAssetIssueByAccount(encode58Check(address));
  }

  public Response.AccountNetMessage getAccountNet(byte[] address) {// pass
    return client.getAccountNet(encode58Check(address));
  }

  public Response.AccountResourceMessage getAccountResource(byte[] address) {// pass
    return client.getAccountResource(encode58Check(address));
  }

  public Contract.AssetIssueContract getAssetIssueByName(String assetName) {// pass
    if (!emptySolidityNode) {
      return client.getAssetIssueByName(assetName, SOLIDITY_NODE);
    } else {
      return client.getAssetIssueByName(assetName, FULL_NODE);
    }
  }

  public Response.AssetIssueList getAssetIssueListByName(String assetName) {// pass
    if (!emptySolidityNode) {
      return client.getAssetIssueListByName(assetName, SOLIDITY_NODE);
    } else {
      return client.getAssetIssueListByName(assetName, FULL_NODE);
    }
  }

  public Contract.AssetIssueContract getAssetIssueById(String assetId) {// pass
    if (!emptySolidityNode) {
      return client.getAssetIssueById(assetId, SOLIDITY_NODE);
    } else {
      return client.getAssetIssueById(assetId, FULL_NODE);
    }
  }

  public long getNextMaintenanceTime() {// pass
    return client.getNextMaintenanceTime();
  }

  public Response.TransactionInfo getTransactionInfoById(String txId) throws IllegalException {// pass
    if (!emptySolidityNode) {
      return client.getTransactionInfoById(txId, SOLIDITY_NODE);
    } else {
      return client.getTransactionInfoById(txId, FULL_NODE);
    }
  }

  public Response.TransactionExtention withdrawExpireUnfreeze(byte[] ownerAddress) throws IllegalException {// pass
    return client.withdrawExpireUnfreeze(encode58Check(ownerAddress));
  }

  public Chain.Block getBlockById(String blockID) {// pass
    return client.getBlockById(blockID);
  }// pass

  public Response.BlockListExtention getBlockByLimitNext(long start, long end) throws IllegalException {// pass
    return client.getBlockByLimitNext(start, end);
  }

  public Response.BlockListExtention getBlockByLatestNum2(long num) throws IllegalException {// pass
    return client.getBlockByLatestNum(num);
  }

  public Response.ProposalList listProposals() {// pass
    return client.listProposals();
  }

  public Response.DelegatedResourceList getDelegatedResource(String fromAddress, String toAddress) {// pass
    if (!emptySolidityNode) {
      return client.getDelegatedResource(fromAddress, toAddress, SOLIDITY_NODE);
    } else {
      return client.getDelegatedResource(fromAddress, toAddress, FULL_NODE);
    }
  }

  public Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndex(String ownerAddress) {// pass
    if (!emptySolidityNode) {
      return client.getDelegatedResourceAccountIndex(ownerAddress, SOLIDITY_NODE);
    } else {
      return client.getDelegatedResourceAccountIndex(ownerAddress, FULL_NODE);
    }
  }

  public Response.DelegatedResourceList getDelegatedResourceV2(String fromAddress, String toAddress) {// pass
    if (!emptySolidityNode) {
      return client.getDelegatedResourceV2(fromAddress, toAddress, SOLIDITY_NODE);
    } else {
      return client.getDelegatedResourceV2(fromAddress, toAddress, FULL_NODE);
    }
  }

  public Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndexV2(String ownerAddress) throws IllegalException {// pass
    if (!emptySolidityNode) {
      return client.getDelegatedResourceAccountIndexV2(ownerAddress, SOLIDITY_NODE);
    } else {
      return client.getDelegatedResourceAccountIndexV2(ownerAddress, FULL_NODE);
    }
  }

  public Response.Proposal getProposal(String id) {// pass
    return client.getProposalById(id);
  }

  public long getCanWithdrawUnfreezeAmount(byte[] ownerAddress, long timestamp) {// pass
    if (!emptySolidityNode) {
      return client.getCanWithdrawUnfreezeAmount(encode58Check(ownerAddress), timestamp, SOLIDITY_NODE);
    } else  {
      return client.getCanWithdrawUnfreezeAmount(encode58Check(ownerAddress), timestamp, FULL_NODE);
    }
  }

  public long getCanDelegatedMaxSize(byte[] ownerAddress, int type) {// pass
    if (!emptySolidityNode) {
      return client.getCanDelegatedMaxSize(encode58Check(ownerAddress), type, SOLIDITY_NODE);
    } else  {
      return client.getCanDelegatedMaxSize(encode58Check(ownerAddress), type, FULL_NODE);
    }
  }

  public long getAvailableUnfreezeCount(byte[] ownerAddress) {// pass
    if (!emptySolidityNode) {
      return client.getAvailableUnfreezeCount(encode58Check(ownerAddress), SOLIDITY_NODE);
    } else  {
      return client.getAvailableUnfreezeCount(encode58Check(ownerAddress), FULL_NODE);
    }
  }

  public Response.ExchangeList listExchanges() {// pass
    if (!emptySolidityNode) {
      return client.listExchanges(SOLIDITY_NODE);
    } else  {
      return client.listExchanges(FULL_NODE);
    }
  }

  public Response.Exchange getExchange(String id) throws IllegalException {// pass
    if (!emptySolidityNode) {
      return client.getExchangeById(id, SOLIDITY_NODE);
    } else  {
      return client.getExchangeById(id, FULL_NODE);
    }
  }

  public Response.ChainParameters getChainParameters() throws IllegalException {// pass
    return client.getChainParameters();
  }

  public Common.SmartContract getContract(byte[] address) {// pass
    return client.getSmartContract(encode58Check(address));
  }

  public Response.SmartContractDataWrapper getContractInfo(byte[] address) {// pass
    return client.getContractInfo(encode58Check(address));
  }

  public long getBrokerage(byte[] owner) {// pass
    if (!emptySolidityNode) {
      return client.getBrokerageInfo(encode58Check(owner), SOLIDITY_NODE);
    } else  {
      return client.getBrokerageInfo(encode58Check(owner), FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getBandwidthPrices() {// pass
    if (!emptySolidityNode) {
      return client.getBandwidthPrices(SOLIDITY_NODE);
    } else {
      return client.getBandwidthPrices(FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getEnergyPrices() {// pass
    if (!emptySolidityNode) {
      return client.getEnergyPrices(SOLIDITY_NODE);
    } else  {
      return client.getEnergyPrices(FULL_NODE);
    }
  }

  public Response.PricesResponseMessage getMemoFee() {// pass
    return client.getMemoFee();
  }

  public Response.TransactionInfoList getTransactionInfoByBlockNum(long blockNum) throws IllegalException {// pass
    if (!emptySolidityNode) {
      return client.getTransactionInfoByBlockNum(blockNum, SOLIDITY_NODE);
    } else {
      return client.getTransactionInfoByBlockNum(blockNum, FULL_NODE);
    }
  }

  public Response.MarketOrderList getMarketOrderByAccount(byte[] address) {// pass
    if (!emptySolidityNode) {
      return client.getMarketOrderByAccount(encode58Check(address), SOLIDITY_NODE);
    } else {
      return client.getMarketOrderByAccount(encode58Check(address), FULL_NODE);
    }
  }

  public Response.BlockExtention getBlock(String idOrNum, boolean detail) {// pass
    if (!emptySolidityNode) {
      return client.getBlock(idOrNum, detail, SOLIDITY_NODE);
    } else {
      return client.getBlock(idOrNum, detail, FULL_NODE);
    }
  }

  public Response.MarketOrder getMarketOrderById(byte[] order) {// pass
    if (!emptySolidityNode) {
      return client.getMarketOrderById(Hex.toHexString(order), SOLIDITY_NODE);
    } else {
      return client.getMarketOrderById(Hex.toHexString(order), FULL_NODE);
    }
  }

  public Response.MarketOrderPairList getMarketPairList() {// pass
    if (!emptySolidityNode) {
      return client.getMarketPairList(SOLIDITY_NODE);
    } else {
      return client.getMarketPairList(FULL_NODE);
    }
  }

  public Response.MarketOrderList getMarketOrderListByPair(byte[] sellTokenId, byte[] buyTokenId) {// pass
    if (!emptySolidityNode) {
      return client.getMarketOrderListByPair(byte2String(sellTokenId), byte2String(buyTokenId), SOLIDITY_NODE);
    } else {
      return client.getMarketOrderListByPair(byte2String(sellTokenId), byte2String(buyTokenId), FULL_NODE);
    }
  }

  public Response.MarketPriceList getMarketPriceByPair(byte[] sellTokenId, byte[] buyTokenId) {// pass
    if (!emptySolidityNode) {
      return client.getMarketPriceByPair(byte2String(sellTokenId), byte2String(buyTokenId), SOLIDITY_NODE);
    } else {
      return client.getMarketPriceByPair(byte2String(sellTokenId), byte2String(buyTokenId), FULL_NODE);
    }
  }

  public Response.WitnessList listWitnesses() {// pass
    if (!emptySolidityNode) {
      return client.listWitnesses(SOLIDITY_NODE);
    } else  {
      return client.listWitnesses(FULL_NODE);
    }
  }

  public Response.TransactionExtention clearContractABI(byte[] owner, byte[] contractAddress) throws IllegalException {// pass
    return client.clearContractABI(encode58Check(owner), encode58Check(contractAddress));
  }

  public Response.TransactionExtention triggerConstantContract(byte[] address, byte[] contractAddress, byte[] data) {// Shielded
    return client.triggerConstantContract(encode58Check(address), encode58Check(contractAddress), Hex.toHexString(data), FULL_NODE);
  }

  public Response.TransactionExtention triggerConstantContract(byte[] owner, byte[] contractAddress, byte[] data, long callValue, long tokenValue, String tokenId) {// pass
    if (!emptySolidityNode) {
      return client.triggerConstantContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, SOLIDITY_NODE);
    } else {
      return client.triggerConstantContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, FULL_NODE);
    }
  }

  public Response.TransactionExtention triggerContract(byte[] owner, byte[] contractAddress, byte[] data, long callValue, long tokenValue, String tokenId, long feeLimit) throws Exception {// pass
    return client.triggerContract(encode58Check(owner), encode58Check(contractAddress), Hex.toHexString(data), callValue, tokenValue, tokenId, feeLimit);
  }

  public Response.TransactionExtention deployContract(String contractName, String abi, String code, List<Type<?>> constructorParams, long feeLimit, long consumeUserResourcePercent, long originEnergyLimit, long value, String tokenId, long tokenValue) throws Exception {// pass
    return client.deployContract(contractName, abi, code, constructorParams, feeLimit, consumeUserResourcePercent, originEnergyLimit, value, tokenId, tokenValue);
  }
}
