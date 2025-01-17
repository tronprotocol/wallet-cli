package org.tron.trident;

import org.tron.api.GrpcAPI;
import org.tron.protos.Protocol;
import org.tron.protos.contract.AssetIssueContractOuterClass;
import org.tron.protos.contract.ShieldContract;
import org.tron.protos.contract.SmartContractOuterClass;
import org.tron.trident.core.ApiWrapper;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Response;

import java.util.Optional;

import static org.tron.walletserver.WalletApi.encode58Check;

public class TridentQueryWrapper {
  public static Protocol.Account queryAccount(
      ApiWrapper rpcWrapper, byte[] address) {
    Response.Account account = rpcWrapper.getAccount(encode58Check(address));
    return TridentUtil.convertAccount(account);
  }

  public static Protocol.Account queryAccountById(
      ApiWrapper rpcWrapper, String accountId) {
    Response.Account account = rpcWrapper.getAccountById(accountId);
    return TridentUtil.convertAccount(account);
  }

  public static GrpcAPI.BlockExtention getBlock2(
      ApiWrapper rpcWrapper, long blockNum) {
    try {
      Response.BlockExtention blockExtention = rpcWrapper.getBlockByNum(blockNum);
      return TridentUtil.convert2ProtoBlockExtention(blockExtention);
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return null;
    }
  }

  public static long getTransactionCountByBlockNum(long blockNum) {
    System.err.println("getTransactionCountByBlockNum call failed");
    System.err.println("please check your config.conf");
    return 0;
  }

  public static Optional<GrpcAPI.WitnessList> listWitnesses(ApiWrapper rpcWrapper) {
    Response.WitnessList responseWitnessList = rpcWrapper.listWitnesses();
    return TridentUtil.convertWitnessList(responseWitnessList);
  }

  public static Optional<GrpcAPI.AssetIssueList> getAssetIssueList(ApiWrapper rpcWrapper) {
    Response.AssetIssueList assetIssueList = rpcWrapper.getAssetIssueList();
    return Optional.ofNullable(TridentUtil.convertAssetIssueList(assetIssueList));
  }

  public static Optional<GrpcAPI.AssetIssueList> getAssetIssueList(
      ApiWrapper rpcWrapper, long offset, long limit) {
    Response.AssetIssueList assetIssueList = rpcWrapper.getPaginatedAssetIssueList(offset, limit);
    return Optional.ofNullable(TridentUtil.convertAssetIssueList(assetIssueList));
  }

  public static Optional<GrpcAPI.ProposalList> getProposalListPaginated(long offset, long limit) {
    System.err.println("getProposalListPaginated call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.ExchangeList> getExchangeListPaginated(long offset, long limit) {
    System.err.println("getExchangeListPaginated call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.NodeList> listNodes(ApiWrapper rpcWrapper) {
    try {
      Response.NodeList nodeList = rpcWrapper.listNodes();
      return Optional.ofNullable(TridentUtil.convertNodeList(nodeList));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<GrpcAPI.AssetIssueList> getAssetIssueByAccount(
      ApiWrapper rpcWrapper, byte[] address) {
    String addressStr = encode58Check(address);
    Response.AssetIssueList assetIssueList = rpcWrapper.getAssetIssueByAccount(addressStr);
    return Optional.ofNullable(TridentUtil.convertAssetIssueList(assetIssueList));
  }

  public static GrpcAPI.AccountNetMessage getAccountNet(ApiWrapper rpcWrapper, byte[] address) {
    String addressStr = encode58Check(address);
    Response.AccountNetMessage accountNetMessage = rpcWrapper.getAccountNet(addressStr);
    return TridentUtil.convertAccountNetMessage(accountNetMessage);
  }

  public static GrpcAPI.AccountResourceMessage getAccountResource(
      ApiWrapper rpcWrapper, byte[] address) {
    String addressStr = encode58Check(address);
    Response.AccountResourceMessage accountResourceMessage = rpcWrapper.getAccountResource(addressStr);
    return TridentUtil.convertAccountResourceMessage(accountResourceMessage);
  }

  public static AssetIssueContractOuterClass.AssetIssueContract getAssetIssueByName(
      ApiWrapper rpcWrapper, String assetName) {
    org.tron.trident.proto.Contract.AssetIssueContract assetIssueContract
        = rpcWrapper.getAssetIssueByName(assetName);
    return TridentUtil.convertAssetIssueContract(assetIssueContract);
  }

  public static Optional<GrpcAPI.AssetIssueList> getAssetIssueListByName(
      ApiWrapper rpcWrapper, String assetName) {
    Response.AssetIssueList assetIssueList = rpcWrapper.getAssetIssueListByName(assetName);
    return Optional.ofNullable(TridentUtil.convertAssetIssueList(assetIssueList));
  }

  public static AssetIssueContractOuterClass.AssetIssueContract getAssetIssueById(
      ApiWrapper rpcWrapper, String assetId) {
    org.tron.trident.proto.Contract.AssetIssueContract assetIssueContract
        = rpcWrapper.getAssetIssueById(assetId);
    return TridentUtil.convertAssetIssueContract(assetIssueContract);
  }

  public static GrpcAPI.NumberMessage getTotalTransaction() {
    System.err.println("getTotalTransaction call failed");
    System.err.println("please check your config.conf");
    return GrpcAPI.NumberMessage.newBuilder().build();
  }

  public static GrpcAPI.NumberMessage getNextMaintenanceTime(ApiWrapper rpcWrapper) {
    long nextMaintenanceTime = rpcWrapper.getNextMaintenanceTime();
    return GrpcAPI.NumberMessage.newBuilder().setNum(nextMaintenanceTime).build();
  }

  public static Optional<GrpcAPI.TransactionList> getTransactionsFromThis(
      byte[] address, int offset, int limit) {
    System.err.println("getTransactionsFromThis call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.TransactionListExtention> getTransactionsFromThis2(
      byte[] address, int offset, int limit) {
    System.err.println("getTransactionsFromThis2 call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.TransactionList> getTransactionsToThis(
      byte[] address, int offset, int limit) {
    System.err.println("getTransactionsToThis call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.TransactionListExtention> getTransactionsToThis2(
      byte[] address, int offset, int limit) {
    System.err.println("getTransactionsToThis2 call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<Protocol.Transaction> getTransactionById(
      ApiWrapper rpcWrapper, String txID) {
    try {
      Chain.Transaction transaction = rpcWrapper.getTransactionById(txID);
      return Optional.ofNullable(TridentUtil.convert2ProtoTransaction(transaction));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<Protocol.TransactionInfo> getTransactionInfoById(
      ApiWrapper rpcWrapper, String txID) {
    try {
      Response.TransactionInfo transactionInfo = rpcWrapper.getTransactionInfoById(txID);
      return Optional.ofNullable(TridentUtil.convertTransactionInfo(transactionInfo));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<Protocol.Block> getBlockById(ApiWrapper rpcWrapper, String blockID) {
    Chain.Block block = rpcWrapper.getBlockById(blockID);
    return Optional.ofNullable(TridentUtil.convertBlock(block));
  }

  public static Optional<GrpcAPI.BlockList> getBlockByLimitNext(long start, long end) {
    System.err.println("getBlockByLimitNext call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BlockListExtention> getBlockByLimitNext2(
      ApiWrapper rpcWrapper, long start, long end) {
    try {
      Response.BlockListExtention blockListExtention = rpcWrapper.getBlockByLimitNext(start, end);
      return Optional.ofNullable(TridentUtil.convertBlockListExtention(blockListExtention));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<GrpcAPI.BlockList> getBlockByLatestNum(long num) {
    System.err.println("getBlockByLatestNum call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BlockListExtention> getBlockByLatestNum2(
      ApiWrapper rpcWrapper, long num) {
    try {
      Response.BlockListExtention blockListExtention = rpcWrapper.getBlockByLatestNum(num);
      return Optional.ofNullable(TridentUtil.convertBlockListExtention(blockListExtention));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<GrpcAPI.ProposalList> listProposals(ApiWrapper rpcWrapper) {
    Response.ProposalList proposalList = rpcWrapper.listProposals();
    return Optional.ofNullable(TridentUtil.convertProposalList(proposalList));
  }

  public static Optional<Protocol.Proposal> getProposal(String id) {
    System.err.println("getProposal call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DelegatedResourceList> getDelegatedResource(
      ApiWrapper rpcWrapper, String fromAddress, String toAddress) {
    Response.DelegatedResourceList delegatedResourceList
        = rpcWrapper.getDelegatedResource(fromAddress, toAddress);
    return Optional.ofNullable(
        TridentUtil.convertDelegatedResourceList(delegatedResourceList)
    );
  }

  public static Optional<Protocol.DelegatedResourceAccountIndex> getDelegatedResourceAccountIndex(
      ApiWrapper rpcWrapper, String ownerAddress) {
    Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex
        = rpcWrapper.getDelegatedResourceAccountIndex(ownerAddress);
    return Optional.ofNullable(
        TridentUtil.convertDelegatedResourceAccountIndex(delegatedResourceAccountIndex)
    );
  }

  public static Optional<GrpcAPI.DelegatedResourceList> getDelegatedResourceV2(
      ApiWrapper rpcWrapper, String fromAddress, String toAddress) {
    Response.DelegatedResourceList delegatedResourceList
        = rpcWrapper.getDelegatedResourceV2(fromAddress, toAddress);
    return Optional.ofNullable(
        TridentUtil.convertDelegatedResourceList(delegatedResourceList)
    );
  }

  public static Optional<Protocol.DelegatedResourceAccountIndex> getDelegatedResourceAccountIndexV2(
      ApiWrapper rpcWrapper, String ownerAddress) {
    try {
      Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex
          = rpcWrapper.getDelegatedResourceAccountIndexV2(ownerAddress);
      return Optional.ofNullable(
          TridentUtil.convertDelegatedResourceAccountIndex(delegatedResourceAccountIndex)
      );
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<GrpcAPI.CanWithdrawUnfreezeAmountResponseMessage> getCanWithdrawUnfreezeAmount(
      byte[] ownerAddress, long timestamp) {
    System.err.println("getCanWithdrawUnfreezeAmount call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.CanDelegatedMaxSizeResponseMessage> getCanDelegatedMaxSize(
      ApiWrapper rpcWrapper, byte[] ownerAddress, int type) {
    String ownerAddressStr = encode58Check(ownerAddress);
    long maxSize = rpcWrapper.getCanDelegatedMaxSize(ownerAddressStr, type);
    GrpcAPI.CanDelegatedMaxSizeResponseMessage responseMessage
        = GrpcAPI.CanDelegatedMaxSizeResponseMessage.newBuilder()
        .setMaxSize(maxSize)
        .build();
    return Optional.ofNullable(responseMessage);
  }

  public static Optional<GrpcAPI.GetAvailableUnfreezeCountResponseMessage> getAvailableUnfreezeCount(
      ApiWrapper rpcWrapper, byte[] ownerAddress) {
    String ownerAddressStr = encode58Check(ownerAddress);
    long count = rpcWrapper.getAvailableUnfreezeCount(ownerAddressStr);
    GrpcAPI.GetAvailableUnfreezeCountResponseMessage responseMessage
        = GrpcAPI.GetAvailableUnfreezeCountResponseMessage.newBuilder()
        .setCount(count)
        .build();
    return Optional.ofNullable(responseMessage);
  }

  public static Optional<GrpcAPI.ExchangeList> listExchanges(ApiWrapper rpcWrapper) {
    Response.ExchangeList exchangeList = rpcWrapper.listExchanges();
    return Optional.ofNullable(TridentUtil.convertExchangeList(exchangeList));
  }

  public static Optional<Protocol.Exchange> getExchange(ApiWrapper rpcWrapper, String id) {
    try {
      Response.Exchange exchange = rpcWrapper.getExchangeById(id);
      return Optional.ofNullable(TridentUtil.convertExchange(exchange));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static Optional<Protocol.ChainParameters> getChainParameters(ApiWrapper rpcWrapper) {
    try {
      Response.ChainParameters chainParameters = rpcWrapper.getChainParameters();
      return Optional.ofNullable(TridentUtil.convertChainParameters(chainParameters));
    } catch (IllegalException e) {
      System.err.println("get illegal exception: " + e.getMessage());
      return Optional.empty();
    }
  }

  public static SmartContractOuterClass.SmartContract getContract(byte[] address) {
    System.err.println("getContract call failed");
    System.err.println("please check your config.conf");
    return null;
  }

  public static SmartContractOuterClass.SmartContractDataWrapper getContractInfo(byte[] address) {
    System.err.println("getContractInfo call failed");
    System.err.println("please check your config.conf");
    return null;
  }

  public static Optional<ShieldContract.IncrementalMerkleVoucherInfo> GetMerkleTreeVoucherInfo(
      ShieldContract.OutputPointInfo info, boolean showErrorMsg) {
    System.err.println("GetMerkleTreeVoucherInfo call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DecryptNotes> scanNoteByIvk(
      GrpcAPI.IvkDecryptParameters ivkDecryptParameters, boolean showErrorMsg) {
    System.err.println("scanNoteByIvk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DecryptNotes> scanNoteByOvk(
      GrpcAPI.OvkDecryptParameters ovkDecryptParameters, boolean showErrorMsg) {
    System.err.println("scanNoteByOvk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BytesMessage> getSpendingKey() {
    System.err.println("getSpendingKey call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.ExpandedSpendingKeyMessage> getExpandedSpendingKey(
      GrpcAPI.BytesMessage spendingKey) {
    System.err.println("getExpandedSpendingKey call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BytesMessage> getAkFromAsk(GrpcAPI.BytesMessage ask) {
    System.err.println("getAkFromAsk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BytesMessage> getNkFromNsk(GrpcAPI.BytesMessage nsk) {
    System.err.println("getNkFromNsk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.IncomingViewingKeyMessage> getIncomingViewingKey(
      GrpcAPI.ViewingKeyMessage viewingKeyMessage) {
    System.err.println("getIncomingViewingKey call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DiversifierMessage> getDiversifier() {
    System.err.println("getIncomingViewingKey call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.SpendResult> isNoteSpend(
      GrpcAPI.NoteParameters noteParameters, boolean showErrorMsg) {
    System.err.println("isNoteSpend call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BytesMessage> getRcm() {
    System.err.println("getRcm call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.BytesMessage> createShieldedNullifier(
      GrpcAPI.NfParameters parameters) {
    System.err.println("createShieldedNullifier call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.PaymentAddressMessage> getZenPaymentAddress(
      GrpcAPI.IncomingViewingKeyDiversifierMessage msg) {
    System.err.println("getZenPaymentAddress call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DecryptNotesMarked> scanAndMarkNoteByIvk(
      GrpcAPI.IvkDecryptAndMarkParameters parameters) {
    System.err.println("scanAndMarkNoteByIvk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static GrpcAPI.NumberMessage getReward(ApiWrapper rpcWrapper, byte[] owner) {
    String ownerAddress = encode58Check(owner);
    org.tron.trident.api.GrpcAPI.NumberMessage numberMessage
        = rpcWrapper.getRewardSolidity(ownerAddress);
    return GrpcAPI.NumberMessage.newBuilder()
        .setNum(numberMessage.getNum())
        .build();
  }

  public static GrpcAPI.NumberMessage getBrokerage(ApiWrapper rpcWrapper, byte[] owner) {
    String ownerAddress = encode58Check(owner);
    long brokerageInfo = rpcWrapper.getBrokerageInfo(ownerAddress);
    return GrpcAPI.NumberMessage.newBuilder()
        .setNum(brokerageInfo)
        .build();
  }

  public static GrpcAPI.PricesResponseMessage getBandwidthPrices(
      ApiWrapper rpcWrapper) {
    Response.PricesResponseMessage responseMessage = rpcWrapper.getBandwidthPrices();
    return TridentUtil.convertPricesResponseMessage(responseMessage);
  }

  public static GrpcAPI.PricesResponseMessage getEnergyPrices(
      ApiWrapper rpcWrapper) {
    Response.PricesResponseMessage responseMessage = rpcWrapper.getEnergyPrices();
    return TridentUtil.convertPricesResponseMessage(responseMessage);
  }

  public static GrpcAPI.PricesResponseMessage getMemoFee(
      ApiWrapper rpcWrapper) {
    Response.PricesResponseMessage responseMessage = rpcWrapper.getMemoFee();
    return TridentUtil.convertPricesResponseMessage(responseMessage);
  }

  public static Optional<GrpcAPI.DecryptNotesTRC20> scanShieldedTRC20NoteByIvk(
      GrpcAPI.IvkDecryptTRC20Parameters parameters, boolean showErrorMsg) {
    System.err.println("scanShieldedTRC20NoteByIvk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<GrpcAPI.DecryptNotesTRC20> scanShieldedTRC20NoteByOvk(
      GrpcAPI.OvkDecryptTRC20Parameters parameters, boolean showErrorMsg) {
    System.err.println("scanShieldedTRC20NoteByOvk call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public String constantCallShieldedContract(
      byte[] contractAddress, byte[] data, String functionName) {
    System.err.println("constantCallShieldedContract call failed");
    System.err.println("please check your config.conf");
    return null;
  }

  public static Optional<GrpcAPI.NullifierResult> isShieldedTRC20ContractNoteSpent(
      GrpcAPI.NfTRC20Parameters parameters, boolean showErrorMsg) {
    System.err.println("isShieldedTRC20ContractNoteSpent call failed");
    System.err.println("please check your config.conf");
    return null;
  }

  public static Optional<GrpcAPI.TransactionInfoList> getTransactionInfoByBlockNum(
      ApiWrapper rpcWrapper, long blockNum) {
    try {
      Response.TransactionInfoList transactionInfoList
          = rpcWrapper.getTransactionInfoByBlockNum(blockNum);
      return Optional.ofNullable(TridentUtil.convertTransactionInfoList(transactionInfoList));
    } catch (IllegalException e) {
      return Optional.empty();
    }
  }

  public static Optional<Protocol.MarketOrderList> getMarketOrderByAccount(byte[] address) {
    System.err.println("getMarketOrderByAccount call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<Protocol.MarketPriceList> getMarketPriceByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    System.err.println("getMarketPriceByPair call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<Protocol.MarketOrderList> getMarketOrderListByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    System.err.println("getMarketOrderListByPair call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<Protocol.MarketOrderPairList> getMarketPairList() {
    System.err.println("getMarketPairList call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static Optional<Protocol.MarketOrder> getMarketOrderById(byte[] order) {
    System.err.println("getMarketOrderById call failed");
    System.err.println("please check your config.conf");
    return Optional.empty();
  }

  public static GrpcAPI.BlockExtention getBlock(String idOrNum, boolean detail) {
    System.err.println("getBlock call failed");
    System.err.println("please check your config.conf");
    return null;
  }
}
