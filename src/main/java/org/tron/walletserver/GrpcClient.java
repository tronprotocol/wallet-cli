package org.tron.walletserver;

import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import com.google.protobuf.ByteString;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang.StringUtils;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.*;
import org.tron.api.GrpcAPI.Return.response_code;
import org.tron.api.GrpcAPI.TransactionApprovedList;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.api.GrpcAPI.TransactionInfoList;
import org.tron.api.GrpcAPI.TransactionList;
import org.tron.api.GrpcAPI.TransactionListExtention;
import org.tron.api.GrpcAPI.TransactionSignWeight;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.api.WalletExtensionGrpc;
import org.tron.api.WalletGrpc;
import org.tron.api.WalletSolidityGrpc;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.DelegatedResourceAccountIndex;
import org.tron.protos.Protocol.Exchange;
import org.tron.protos.Protocol.MarketOrder;
import org.tron.protos.Protocol.MarketOrderList;
import org.tron.protos.Protocol.MarketOrderPair;
import org.tron.protos.Protocol.MarketOrderPairList;
import org.tron.protos.Protocol.MarketPriceList;
import org.tron.protos.Protocol.Proposal;
import org.tron.protos.contract.AccountContract.AccountCreateContract;
import org.tron.protos.contract.AccountContract.AccountPermissionUpdateContract;
import org.tron.protos.contract.AccountContract.AccountUpdateContract;
import org.tron.protos.contract.AccountContract.SetAccountIdContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.AssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.ParticipateAssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.TransferAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UnfreezeAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UpdateAssetContract;
import org.tron.protos.contract.BalanceContract.FreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.protos.contract.BalanceContract.UnfreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.WithdrawBalanceContract;
import org.tron.protos.contract.ExchangeContract.ExchangeCreateContract;
import org.tron.protos.contract.ExchangeContract.ExchangeInjectContract;
import org.tron.protos.contract.ExchangeContract.ExchangeTransactionContract;
import org.tron.protos.contract.ExchangeContract.ExchangeWithdrawContract;
import org.tron.protos.contract.ProposalContract.ProposalApproveContract;
import org.tron.protos.contract.ProposalContract.ProposalCreateContract;
import org.tron.protos.contract.ProposalContract.ProposalDeleteContract;
import org.tron.protos.contract.ShieldContract.IncrementalMerkleVoucherInfo;
import org.tron.protos.contract.ShieldContract.OutputPointInfo;
import org.tron.protos.contract.SmartContractOuterClass.ClearABIContract;
import org.tron.protos.contract.SmartContractOuterClass.CreateSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.SmartContract;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.protos.Protocol.TransactionSign;
import org.tron.protos.contract.SmartContractOuterClass.SmartContractDataWrapper;
import org.tron.protos.contract.SmartContractOuterClass.TriggerSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateEnergyLimitContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateSettingContract;
import org.tron.protos.contract.StorageContract.BuyStorageBytesContract;
import org.tron.protos.contract.StorageContract.BuyStorageContract;
import org.tron.protos.contract.StorageContract.SellStorageContract;
import org.tron.protos.contract.StorageContract.UpdateBrokerageContract;
import org.tron.protos.contract.WitnessContract.VoteWitnessContract;
import org.tron.protos.contract.WitnessContract.WitnessCreateContract;
import org.tron.protos.contract.WitnessContract.WitnessUpdateContract;
import org.tron.protos.contract.MarketContract.MarketCancelOrderContract;
import org.tron.protos.contract.MarketContract.MarketSellAssetContract;

@Slf4j
public class GrpcClient {

  private ManagedChannel channelFull = null;
  private ManagedChannel channelSolidity = null;
  private WalletGrpc.WalletBlockingStub blockingStubFull = null;
  private WalletSolidityGrpc.WalletSolidityBlockingStub blockingStubSolidity = null;
  private WalletExtensionGrpc.WalletExtensionBlockingStub blockingStubExtension = null;

//  public GrpcClient(String host, int port) {
//    channel = ManagedChannelBuilder.forAddress(host, port)
//        .usePlaintext(true)
//        .build();
//    blockingStub = WalletGrpc.newBlockingStub(channel);
//  }

  public GrpcClient(String fullnode, String soliditynode) {
    if (!StringUtils.isEmpty(fullnode)) {
      channelFull = ManagedChannelBuilder.forTarget(fullnode)
          .usePlaintext(true)
          .build();
      blockingStubFull = WalletGrpc.newBlockingStub(channelFull);
    }
    if (!StringUtils.isEmpty(soliditynode)) {
      channelSolidity = ManagedChannelBuilder.forTarget(soliditynode)
          .usePlaintext(true)
          .build();
      blockingStubSolidity = WalletSolidityGrpc.newBlockingStub(channelSolidity);
      blockingStubExtension = WalletExtensionGrpc.newBlockingStub(channelSolidity);
    }
  }

  public void shutdown() throws InterruptedException {
    if (channelFull != null) {
      channelFull.shutdown().awaitTermination(5, TimeUnit.SECONDS);
    }
    if (channelSolidity != null) {
      channelSolidity.shutdown().awaitTermination(5, TimeUnit.SECONDS);
    }
  }

  public Account queryAccount(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getAccount(request);
    } else {
      return blockingStubFull.getAccount(request);
    }
  }

  public Account queryAccountById(String accountId) {
    ByteString bsAccountId = ByteString.copyFromUtf8(accountId);
    Account request = Account.newBuilder().setAccountId(bsAccountId).build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getAccountById(request);
    } else {
      return blockingStubFull.getAccountById(request);
    }
  }

  //Warning: do not invoke this interface provided by others.
  public Transaction signTransaction(TransactionSign transactionSign) {
    return blockingStubFull.getTransactionSign(transactionSign);
  }

  //Warning: do not invoke this interface provided by others.
  public TransactionExtention signTransaction2(TransactionSign transactionSign) {
    return blockingStubFull.getTransactionSign2(transactionSign);
  }

  //Warning: do not invoke this interface provided by others.
  public TransactionExtention addSign(TransactionSign transactionSign) {
    return blockingStubFull.addSign(transactionSign);
  }

  public TransactionSignWeight getTransactionSignWeight(Transaction transaction) {
    return blockingStubFull.getTransactionSignWeight(transaction);
  }

  public TransactionApprovedList getTransactionApprovedList(Transaction transaction) {
    return blockingStubFull.getTransactionApprovedList(transaction);
  }

  //Warning: do not invoke this interface provided by others.
  public byte[] createAdresss(byte[] passPhrase) {
    BytesMessage.Builder builder = BytesMessage.newBuilder();
    builder.setValue(ByteString.copyFrom(passPhrase));

    BytesMessage result = blockingStubFull.createAddress(builder.build());
    return result.getValue().toByteArray();
  }

  //Warning: do not invoke this interface provided by others.
  public EasyTransferResponse easyTransfer(byte[] passPhrase, byte[] toAddress, long amount) {
    EasyTransferMessage.Builder builder = EasyTransferMessage.newBuilder();
    builder.setPassPhrase(ByteString.copyFrom(passPhrase));
    builder.setToAddress(ByteString.copyFrom(toAddress));
    builder.setAmount(amount);

    return blockingStubFull.easyTransfer(builder.build());
  }

  //Warning: do not invoke this interface provided by others.
  public EasyTransferResponse easyTransferByPrivate(byte[] privateKey, byte[] toAddress,
      long amount) {
    EasyTransferByPrivateMessage.Builder builder = EasyTransferByPrivateMessage.newBuilder();
    builder.setPrivateKey(ByteString.copyFrom(privateKey));
    builder.setToAddress(ByteString.copyFrom(toAddress));
    builder.setAmount(amount);

    return blockingStubFull.easyTransferByPrivate(builder.build());
  }

  //Warning: do not invoke this interface provided by others.
  public EasyTransferResponse easyTransferAsset(byte[] passPhrase, byte[] toAddress,
      String assetId, long amount) {
    EasyTransferAssetMessage.Builder builder = EasyTransferAssetMessage.newBuilder();
    builder.setPassPhrase(ByteString.copyFrom(passPhrase));
    builder.setToAddress(ByteString.copyFrom(toAddress));
    builder.setAssetId(assetId);
    builder.setAmount(amount);

    return blockingStubFull.easyTransferAsset(builder.build());
  }

  //Warning: do not invoke this interface provided by others.
  public EasyTransferResponse easyTransferAssetByPrivate(byte[] privateKey, byte[] toAddress,
      String assetId, long amount) {
    EasyTransferAssetByPrivateMessage.Builder builder = EasyTransferAssetByPrivateMessage
        .newBuilder();
    builder.setPrivateKey(ByteString.copyFrom(privateKey));
    builder.setToAddress(ByteString.copyFrom(toAddress));
    builder.setAssetId(assetId);
    builder.setAmount(amount);

    return blockingStubFull.easyTransferAssetByPrivate(builder.build());
  }

  public Transaction createTransaction(AccountUpdateContract contract) {
    return blockingStubFull.updateAccount(contract);
  }

  public TransactionExtention createTransaction2(AccountUpdateContract contract) {
    return blockingStubFull.updateAccount2(contract);
  }

  public Transaction createTransaction(SetAccountIdContract contract) {
    return blockingStubFull.setAccountId(contract);
  }

  public Transaction createTransaction(UpdateAssetContract contract) {
    return blockingStubFull.updateAsset(contract);
  }

  public TransactionExtention createTransaction2(UpdateAssetContract contract) {
    return blockingStubFull.updateAsset2(contract);
  }

  public Transaction createTransaction(TransferContract contract) {
    return blockingStubFull.createTransaction(contract);
  }

  public TransactionExtention createTransaction2(TransferContract contract) {
    return blockingStubFull.createTransaction2(contract);
  }

  public Transaction createTransaction(FreezeBalanceContract contract) {
    return blockingStubFull.freezeBalance(contract);
  }

  public TransactionExtention createTransaction(BuyStorageContract contract) {
    return blockingStubFull.buyStorage(contract);
  }

  public TransactionExtention createTransaction(BuyStorageBytesContract contract) {
    return blockingStubFull.buyStorageBytes(contract);
  }

  public TransactionExtention createTransaction(SellStorageContract contract) {
    return blockingStubFull.sellStorage(contract);
  }

  public TransactionExtention createTransaction2(FreezeBalanceContract contract) {
    return blockingStubFull.freezeBalance2(contract);
  }

  public Transaction createTransaction(WithdrawBalanceContract contract) {
    return blockingStubFull.withdrawBalance(contract);
  }

  public TransactionExtention createTransaction2(WithdrawBalanceContract contract) {
    return blockingStubFull.withdrawBalance2(contract);
  }

  public Transaction createTransaction(UnfreezeBalanceContract contract) {
    return blockingStubFull.unfreezeBalance(contract);
  }

  public TransactionExtention createTransaction2(UnfreezeBalanceContract contract) {
    return blockingStubFull.unfreezeBalance2(contract);
  }

  public Transaction createTransaction(UnfreezeAssetContract contract) {
    return blockingStubFull.unfreezeAsset(contract);
  }

  public TransactionExtention createTransaction2(UnfreezeAssetContract contract) {
    return blockingStubFull.unfreezeAsset2(contract);
  }

  public Transaction createTransferAssetTransaction(TransferAssetContract contract) {
    return blockingStubFull.transferAsset(contract);
  }

  public TransactionExtention createTransferAssetTransaction2(
      TransferAssetContract contract) {
    return blockingStubFull.transferAsset2(contract);
  }

  public Transaction createParticipateAssetIssueTransaction(
      ParticipateAssetIssueContract contract) {
    return blockingStubFull.participateAssetIssue(contract);
  }

  public TransactionExtention createParticipateAssetIssueTransaction2(
      ParticipateAssetIssueContract contract) {
    return blockingStubFull.participateAssetIssue2(contract);
  }

  public Transaction createAssetIssue(AssetIssueContract contract) {
    return blockingStubFull.createAssetIssue(contract);
  }

  public TransactionExtention createAssetIssue2(AssetIssueContract contract) {
    return blockingStubFull.createAssetIssue2(contract);
  }

  public Transaction voteWitnessAccount(VoteWitnessContract contract) {
    return blockingStubFull.voteWitnessAccount(contract);
  }

  public TransactionExtention voteWitnessAccount2(VoteWitnessContract contract) {
    return blockingStubFull.voteWitnessAccount2(contract);
  }

  public TransactionExtention proposalCreate(ProposalCreateContract contract) {
    return blockingStubFull.proposalCreate(contract);
  }

  public Optional<ProposalList> listProposals() {
    ProposalList proposalList = blockingStubFull.listProposals(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(proposalList);
  }

  public Optional<Proposal> getProposal(String id) {
    BytesMessage request = BytesMessage.newBuilder().setValue(ByteString.copyFrom(
        ByteArray.fromLong(Long.parseLong(id))))
        .build();
    Proposal proposal = blockingStubFull.getProposalById(request);
    return Optional.ofNullable(proposal);
  }

  public Optional<DelegatedResourceList> getDelegatedResource(String fromAddress,
      String toAddress) {

    ByteString fromAddressBS = ByteString.copyFrom(
        Objects.requireNonNull(WalletApi.decodeFromBase58Check(fromAddress)));
    ByteString toAddressBS = ByteString.copyFrom(
        Objects.requireNonNull(WalletApi.decodeFromBase58Check(toAddress)));

    DelegatedResourceMessage request = DelegatedResourceMessage.newBuilder()
        .setFromAddress(fromAddressBS)
        .setToAddress(toAddressBS)
        .build();
    DelegatedResourceList delegatedResource;
    if (blockingStubSolidity != null) {
      delegatedResource = blockingStubSolidity.getDelegatedResource(request);
    } else {
      delegatedResource = blockingStubFull.getDelegatedResource(request);
    }
    return Optional.ofNullable(delegatedResource);
  }

  public Optional<DelegatedResourceAccountIndex> getDelegatedResourceAccountIndex(String address) {

    ByteString addressBS = ByteString.copyFrom(
        Objects.requireNonNull(WalletApi.decodeFromBase58Check(address)));

    BytesMessage bytesMessage = BytesMessage.newBuilder().setValue(addressBS).build();
    DelegatedResourceAccountIndex accountIndex;
    if (blockingStubSolidity != null) {
      accountIndex = blockingStubSolidity.getDelegatedResourceAccountIndex(bytesMessage);
    } else {
      accountIndex = blockingStubFull.getDelegatedResourceAccountIndex(bytesMessage);
    }
    return Optional.ofNullable(accountIndex);
  }


  public Optional<ExchangeList> listExchanges() {
    ExchangeList exchangeList;
    if (blockingStubSolidity != null) {
      exchangeList = blockingStubSolidity.listExchanges(EmptyMessage.newBuilder().build());
    } else {
      exchangeList = blockingStubFull.listExchanges(EmptyMessage.newBuilder().build());
    }

    return Optional.ofNullable(exchangeList);
  }

  public Optional<Exchange> getExchange(String id) {
    BytesMessage request = BytesMessage.newBuilder().setValue(ByteString.copyFrom(
        ByteArray.fromLong(Long.parseLong(id))))
        .build();

    Exchange exchange;
    if (blockingStubSolidity != null) {
      exchange = blockingStubSolidity.getExchangeById(request);
    } else {
      exchange = blockingStubFull.getExchangeById(request);
    }

    return Optional.ofNullable(exchange);
  }

  public Optional<ChainParameters> getChainParameters() {
    ChainParameters chainParameters = blockingStubFull
        .getChainParameters(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(chainParameters);
  }

  public TransactionExtention proposalApprove(ProposalApproveContract contract) {
    return blockingStubFull.proposalApprove(contract);
  }

  public TransactionExtention proposalDelete(ProposalDeleteContract contract) {
    return blockingStubFull.proposalDelete(contract);
  }

  public TransactionExtention exchangeCreate(ExchangeCreateContract contract) {
    return blockingStubFull.exchangeCreate(contract);
  }

  public TransactionExtention exchangeInject(ExchangeInjectContract contract) {
    return blockingStubFull.exchangeInject(contract);
  }

  public TransactionExtention exchangeWithdraw(ExchangeWithdrawContract contract) {
    return blockingStubFull.exchangeWithdraw(contract);
  }

  public TransactionExtention exchangeTransaction(ExchangeTransactionContract contract) {
    return blockingStubFull.exchangeTransaction(contract);
  }

  public Transaction createAccount(AccountCreateContract contract) {
    return blockingStubFull.createAccount(contract);
  }

  public TransactionExtention createAccount2(AccountCreateContract contract) {
    return blockingStubFull.createAccount2(contract);
  }

  public AddressPrKeyPairMessage generateAddress(EmptyMessage emptyMessage) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.generateAddress(emptyMessage);
    } else {
      return blockingStubFull.generateAddress(emptyMessage);
    }
  }

  public Transaction createWitness(WitnessCreateContract contract) {
    return blockingStubFull.createWitness(contract);
  }

  public TransactionExtention createWitness2(WitnessCreateContract contract) {
    return blockingStubFull.createWitness2(contract);
  }

  public Transaction updateWitness(WitnessUpdateContract contract) {
    return blockingStubFull.updateWitness(contract);
  }

  public TransactionExtention updateWitness2(WitnessUpdateContract contract) {
    return blockingStubFull.updateWitness2(contract);
  }

  public boolean broadcastTransaction(Transaction signaturedTransaction) {
    int i = 10;
    GrpcAPI.Return response = blockingStubFull.broadcastTransaction(signaturedTransaction);
    while (response.getResult() == false && response.getCode() == response_code.SERVER_BUSY
        && i > 0) {
      i--;
      response = blockingStubFull.broadcastTransaction(signaturedTransaction);
      System.out.println("repeat times = " + (11 - i));
      try {
        Thread.sleep(1000);
      } catch (InterruptedException e) {
        e.printStackTrace();
      }
    }
    if (response.getResult() == false) {
      System.out.println("Code = " + response.getCode());
      System.out.println("Message = " + response.getMessage().toStringUtf8());
    }
    return response.getResult();
  }

  public Block getBlock(long blockNum) {
    if (blockNum < 0) {
      if (blockingStubSolidity != null) {
        return blockingStubSolidity.getNowBlock(EmptyMessage.newBuilder().build());
      } else {
        return blockingStubFull.getNowBlock(EmptyMessage.newBuilder().build());
      }
    }
    NumberMessage.Builder builder = NumberMessage.newBuilder();
    builder.setNum(blockNum);
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getBlockByNum(builder.build());
    } else {
      return blockingStubFull.getBlockByNum(builder.build());
    }
  }

  public long getTransactionCountByBlockNum(long blockNum) {
    NumberMessage.Builder builder = NumberMessage.newBuilder();
    builder.setNum(blockNum);
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getTransactionCountByBlockNum(builder.build()).getNum();
    } else {
      return blockingStubFull.getTransactionCountByBlockNum(builder.build()).getNum();
    }
  }

  public BlockExtention getBlock2(long blockNum) {
    if (blockNum < 0) {
      if (blockingStubSolidity != null) {
        return blockingStubSolidity.getNowBlock2(EmptyMessage.newBuilder().build());
      } else {
        return blockingStubFull.getNowBlock2(EmptyMessage.newBuilder().build());
      }
    }
    NumberMessage.Builder builder = NumberMessage.newBuilder();
    builder.setNum(blockNum);
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getBlockByNum2(builder.build());
    } else {
      return blockingStubFull.getBlockByNum2(builder.build());
    }
  }

//  public Optional<AccountList> listAccounts() {
//    AccountList accountList = blockingStubSolidity
//        .listAccounts(EmptyMessage.newBuilder().build());
//    return Optional.ofNullable(accountList);
//
//  }

  public Optional<WitnessList> listWitnesses() {
    if (blockingStubSolidity != null) {
      WitnessList witnessList = blockingStubSolidity
          .listWitnesses(EmptyMessage.newBuilder().build());
      return Optional.ofNullable(witnessList);
    } else {
      WitnessList witnessList = blockingStubFull.listWitnesses(EmptyMessage.newBuilder().build());
      return Optional.ofNullable(witnessList);
    }
  }

  public Optional<AssetIssueList> getAssetIssueList() {
    if (blockingStubSolidity != null) {
      AssetIssueList assetIssueList = blockingStubSolidity
          .getAssetIssueList(EmptyMessage.newBuilder().build());
      return Optional.ofNullable(assetIssueList);
    } else {
      AssetIssueList assetIssueList = blockingStubFull
          .getAssetIssueList(EmptyMessage.newBuilder().build());
      return Optional.ofNullable(assetIssueList);
    }
  }

  public Optional<AssetIssueList> getAssetIssueList(long offset, long limit) {
    PaginatedMessage.Builder pageMessageBuilder = PaginatedMessage.newBuilder();
    pageMessageBuilder.setOffset(offset);
    pageMessageBuilder.setLimit(limit);
    if (blockingStubSolidity != null) {
      AssetIssueList assetIssueList = blockingStubSolidity.
          getPaginatedAssetIssueList(pageMessageBuilder.build());
      return Optional.ofNullable(assetIssueList);
    } else {
      AssetIssueList assetIssueList = blockingStubFull
          .getPaginatedAssetIssueList(pageMessageBuilder.build());
      return Optional.ofNullable(assetIssueList);
    }
  }

  public Optional<ProposalList> getProposalListPaginated(long offset, long limit) {
    PaginatedMessage.Builder pageMessageBuilder = PaginatedMessage.newBuilder();
    pageMessageBuilder.setOffset(offset);
    pageMessageBuilder.setLimit(limit);
    ProposalList proposalList = blockingStubFull
        .getPaginatedProposalList(pageMessageBuilder.build());
    return Optional.ofNullable(proposalList);

  }

  public Optional<ExchangeList> getExchangeListPaginated(long offset, long limit) {
    PaginatedMessage.Builder pageMessageBuilder = PaginatedMessage.newBuilder();
    pageMessageBuilder.setOffset(offset);
    pageMessageBuilder.setLimit(limit);
    ExchangeList exchangeList = blockingStubFull
        .getPaginatedExchangeList(pageMessageBuilder.build());
    return Optional.ofNullable(exchangeList);

  }

  public Optional<NodeList> listNodes() {
    NodeList nodeList = blockingStubFull.listNodes(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(nodeList);
  }

  public Optional<AssetIssueList> getAssetIssueByAccount(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    AssetIssueList assetIssueList = blockingStubFull.getAssetIssueByAccount(request);
    return Optional.ofNullable(assetIssueList);
  }

  public AccountNetMessage getAccountNet(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    return blockingStubFull.getAccountNet(request);
  }

  public AccountResourceMessage getAccountResource(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    return blockingStubFull.getAccountResource(request);
  }

  public AssetIssueContract getAssetIssueByName(String assetName) {
    ByteString assetNameBs = ByteString.copyFrom(assetName.getBytes());
    BytesMessage request = BytesMessage.newBuilder().setValue(assetNameBs).build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getAssetIssueByName(request);
    } else {
      return blockingStubFull.getAssetIssueByName(request);
    }
  }

  public Optional<AssetIssueList> getAssetIssueListByName(String assetName) {
    ByteString assetNameBs = ByteString.copyFrom(assetName.getBytes());
    BytesMessage request = BytesMessage.newBuilder().setValue(assetNameBs).build();
    if (blockingStubSolidity != null) {
      AssetIssueList assetIssueList = blockingStubSolidity.getAssetIssueListByName(request);
      return Optional.ofNullable(assetIssueList);
    } else {
      AssetIssueList assetIssueList = blockingStubFull.getAssetIssueListByName(request);
      return Optional.ofNullable(assetIssueList);
    }
  }

  public AssetIssueContract getAssetIssueById(String assetId) {
    ByteString assetIdBs = ByteString.copyFrom(assetId.getBytes());
    BytesMessage request = BytesMessage.newBuilder().setValue(assetIdBs).build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getAssetIssueById(request);
    } else {
      return blockingStubFull.getAssetIssueById(request);
    }
  }

  public NumberMessage getTotalTransaction() {
    return blockingStubFull.totalTransaction(EmptyMessage.newBuilder().build());
  }

  public NumberMessage getNextMaintenanceTime() {
    return blockingStubFull.getNextMaintenanceTime(EmptyMessage.newBuilder().build());
  }

//  public Optional<AssetIssueList> getAssetIssueListByTimestamp(long time) {
//    NumberMessage.Builder timeStamp = NumberMessage.newBuilder();
//    timeStamp.setNum(time);
//    AssetIssueList assetIssueList = blockingStubSolidity
//        .getAssetIssueListByTimestamp(timeStamp.build());
//    return Optional.ofNullable(assetIssueList);
//  }

//  public Optional<TransactionList> getTransactionsByTimestamp(long start, long end, int offset,
//      int limit) {
//    TimeMessage.Builder timeMessage = TimeMessage.newBuilder();
//    timeMessage.setBeginInMilliseconds(start);
//    timeMessage.setEndInMilliseconds(end);
//    TimePaginatedMessage.Builder timePaginatedMessage = TimePaginatedMessage.newBuilder();
//    timePaginatedMessage.setTimeMessage(timeMessage);
//    timePaginatedMessage.setOffset(offset);
//    timePaginatedMessage.setLimit(limit);
//    TransactionList transactionList = blockingStubExtension
//        .getTransactionsByTimestamp(timePaginatedMessage.build());
//    return Optional.ofNullable(transactionList);
//  }

//  public NumberMessage getTransactionsByTimestampCount(long start, long end) {
//    TimeMessage.Builder timeMessage = TimeMessage.newBuilder();
//    timeMessage.setBeginInMilliseconds(start);
//    timeMessage.setEndInMilliseconds(end);
//    return blockingStubExtension.getTransactionsByTimestampCount(timeMessage.build());
//  }

  public Optional<TransactionList> getTransactionsFromThis(byte[] address, int offset, int limit) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account account = Account.newBuilder().setAddress(addressBS).build();
    AccountPaginated.Builder accountPaginated = AccountPaginated.newBuilder();
    accountPaginated.setAccount(account);
    accountPaginated.setOffset(offset);
    accountPaginated.setLimit(limit);
    TransactionList transactionList = blockingStubExtension
        .getTransactionsFromThis(accountPaginated.build());
    return Optional.ofNullable(transactionList);
  }

  public Optional<TransactionListExtention> getTransactionsFromThis2(byte[] address, int offset,
      int limit) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account account = Account.newBuilder().setAddress(addressBS).build();
    AccountPaginated.Builder accountPaginated = AccountPaginated.newBuilder();
    accountPaginated.setAccount(account);
    accountPaginated.setOffset(offset);
    accountPaginated.setLimit(limit);
    TransactionListExtention transactionList = blockingStubExtension
        .getTransactionsFromThis2(accountPaginated.build());
    return Optional.ofNullable(transactionList);
  }

//  public NumberMessage getTransactionsFromThisCount(byte[] address) {
//    ByteString addressBS = ByteString.copyFrom(address);
//    Account account = Account.newBuilder().setAddress(addressBS).build();
//    return blockingStubExtension.getTransactionsFromThisCount(account);
//  }

  public Optional<TransactionList> getTransactionsToThis(byte[] address, int offset, int limit) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account account = Account.newBuilder().setAddress(addressBS).build();
    AccountPaginated.Builder accountPaginated = AccountPaginated.newBuilder();
    accountPaginated.setAccount(account);
    accountPaginated.setOffset(offset);
    accountPaginated.setLimit(limit);
    TransactionList transactionList = blockingStubExtension
        .getTransactionsToThis(accountPaginated.build());
    return Optional.ofNullable(transactionList);
  }

  public Optional<TransactionListExtention> getTransactionsToThis2(byte[] address, int offset,
      int limit) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account account = Account.newBuilder().setAddress(addressBS).build();
    AccountPaginated.Builder accountPaginated = AccountPaginated.newBuilder();
    accountPaginated.setAccount(account);
    accountPaginated.setOffset(offset);
    accountPaginated.setLimit(limit);
    TransactionListExtention transactionList = blockingStubExtension
        .getTransactionsToThis2(accountPaginated.build());
    return Optional.ofNullable(transactionList);
  }
//  public NumberMessage getTransactionsToThisCount(byte[] address) {
//    ByteString addressBS = ByteString.copyFrom(address);
//    Account account = Account.newBuilder().setAddress(addressBS).build();
//    return blockingStubExtension.getTransactionsToThisCount(account);
//  }

  public Optional<Transaction> getTransactionById(String txID) {
    ByteString bsTxid = ByteString.copyFrom(ByteArray.fromHexString(txID));
    BytesMessage request = BytesMessage.newBuilder().setValue(bsTxid).build();
    Transaction transaction;
    if (blockingStubSolidity != null) {
      transaction = blockingStubSolidity.getTransactionById(request);
    } else {
      transaction = blockingStubFull.getTransactionById(request);
    }
    return Optional.ofNullable(transaction);
  }

  public Optional<TransactionInfo> getTransactionInfoById(String txID) {
    ByteString bsTxid = ByteString.copyFrom(ByteArray.fromHexString(txID));
    BytesMessage request = BytesMessage.newBuilder().setValue(bsTxid).build();
    TransactionInfo transactionInfo;
    if (blockingStubSolidity != null) {
      transactionInfo = blockingStubSolidity.getTransactionInfoById(request);
    } else {
      transactionInfo = blockingStubFull.getTransactionInfoById(request);
    }
    return Optional.ofNullable(transactionInfo);
  }

  public Optional<Block> getBlockById(String blockID) {
    ByteString bsTxid = ByteString.copyFrom(ByteArray.fromHexString(blockID));
    BytesMessage request = BytesMessage.newBuilder().setValue(bsTxid).build();
    Block block = blockingStubFull.getBlockById(request);
    return Optional.ofNullable(block);
  }

  public Optional<BlockList> getBlockByLimitNext(long start, long end) {
    BlockLimit.Builder builder = BlockLimit.newBuilder();
    builder.setStartNum(start);
    builder.setEndNum(end);
    BlockList blockList = blockingStubFull.getBlockByLimitNext(builder.build());
    return Optional.ofNullable(blockList);
  }

  public Optional<BlockListExtention> getBlockByLimitNext2(long start, long end) {
    BlockLimit.Builder builder = BlockLimit.newBuilder();
    builder.setStartNum(start);
    builder.setEndNum(end);
    BlockListExtention blockList = blockingStubFull.getBlockByLimitNext2(builder.build());
    return Optional.ofNullable(blockList);
  }

  public Optional<BlockList> getBlockByLatestNum(long num) {
    NumberMessage numberMessage = NumberMessage.newBuilder().setNum(num).build();
    BlockList blockList = blockingStubFull.getBlockByLatestNum(numberMessage);
    return Optional.ofNullable(blockList);
  }

  public Optional<BlockListExtention> getBlockByLatestNum2(long num) {
    NumberMessage numberMessage = NumberMessage.newBuilder().setNum(num).build();
    BlockListExtention blockList = blockingStubFull.getBlockByLatestNum2(numberMessage);
    return Optional.ofNullable(blockList);
  }

  public TransactionExtention updateSetting(UpdateSettingContract request) {
    return blockingStubFull.updateSetting(request);
  }

  public TransactionExtention updateEnergyLimit(
      UpdateEnergyLimitContract request) {
    return blockingStubFull.updateEnergyLimit(request);
  }

  public TransactionExtention clearContractABI(
      ClearABIContract request) {
    return blockingStubFull.clearContractABI(request);
  }

  public TransactionExtention deployContract(CreateSmartContract request) {
    return blockingStubFull.deployContract(request);
  }

  public TransactionExtention triggerContract(TriggerSmartContract request) {
    return blockingStubFull.triggerContract(request);
  }

  public TransactionExtention triggerConstantContract(TriggerSmartContract request) {
    return blockingStubFull.triggerConstantContract(request);
  }

  public SmartContract getContract(byte[] address) {
    ByteString byteString = ByteString.copyFrom(address);
    BytesMessage bytesMessage = BytesMessage.newBuilder().setValue(byteString).build();
    return blockingStubFull.getContract(bytesMessage);
  }

  public SmartContractDataWrapper getContractInfo(byte[] address) {
    ByteString byteString = ByteString.copyFrom(address);
    BytesMessage bytesMessage = BytesMessage.newBuilder().setValue(byteString).build();
    return blockingStubFull.getContractInfo(bytesMessage);
  }

  public TransactionExtention accountPermissionUpdate(
      AccountPermissionUpdateContract request) {
    return blockingStubFull.accountPermissionUpdate(request);
  }

  public TransactionExtention createShieldedTransaction(PrivateParameters privateParameters) {
    return blockingStubFull.createShieldedTransaction(privateParameters);
  }

  public IncrementalMerkleVoucherInfo GetMerkleTreeVoucherInfo(OutputPointInfo info) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getMerkleTreeVoucherInfo(info);
    } else {
      return blockingStubFull.getMerkleTreeVoucherInfo(info);
    }
  }

  public DecryptNotes scanNoteByIvk(IvkDecryptParameters ivkDecryptParameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.scanNoteByIvk(ivkDecryptParameters);
    } else {
      return blockingStubFull.scanNoteByIvk(ivkDecryptParameters);
    }
  }

  public DecryptNotes scanNoteByOvk(OvkDecryptParameters ovkDecryptParameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.scanNoteByOvk(ovkDecryptParameters);
    } else {
      return blockingStubFull.scanNoteByOvk(ovkDecryptParameters);
    }
  }

  public BytesMessage getSpendingKey() {
    return blockingStubFull.getSpendingKey(EmptyMessage.newBuilder().build());
  }

  public ExpandedSpendingKeyMessage getExpandedSpendingKey(BytesMessage spendingKey) {
    return blockingStubFull.getExpandedSpendingKey(spendingKey);
  }

  public BytesMessage getAkFromAsk(BytesMessage ask) {
    return blockingStubFull.getAkFromAsk(ask);
  }

  public BytesMessage getNkFromNsk(BytesMessage nsk) {
    return blockingStubFull.getNkFromNsk(nsk);
  }

  public IncomingViewingKeyMessage getIncomingViewingKey(ViewingKeyMessage viewingKeyMessage) {
    return blockingStubFull.getIncomingViewingKey(viewingKeyMessage);
  }

  public DiversifierMessage getDiversifier() {
    return blockingStubFull.getDiversifier(EmptyMessage.newBuilder().build());
  }

  public BytesMessage getRcm() {
    return blockingStubFull.getRcm(EmptyMessage.newBuilder().build());
  }

  public SpendResult isNoteSpend(NoteParameters noteParameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.isSpend(noteParameters);
    } else {
      return blockingStubFull.isSpend(noteParameters);
    }
  }

  public TransactionExtention createShieldedTransactionWithoutSpendAuthSig(
      PrivateParametersWithoutAsk privateParameters) {
    return blockingStubFull.createShieldedTransactionWithoutSpendAuthSig(privateParameters);
  }

  public BytesMessage getShieldedTransactionHash(Transaction transaction) {
    return blockingStubFull.getShieldTransactionHash(transaction);
  }

  public BytesMessage createSpendAuthSig(SpendAuthSigParameters parameters) {
    return blockingStubFull.createSpendAuthSig(parameters);
  }

  public BytesMessage createShieldedNullifier(NfParameters parameters) {
    return blockingStubFull.createShieldNullifier(parameters);
  }

  public PaymentAddressMessage getZenPaymentAddress(IncomingViewingKeyDiversifierMessage msg) {
    return blockingStubFull.getZenPaymentAddress(msg);
  }

  public DecryptNotesMarked scanAndMarkNoteByIvk(IvkDecryptAndMarkParameters parameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.scanAndMarkNoteByIvk(parameters);
    } else {
      return blockingStubFull.scanAndMarkNoteByIvk(parameters);
    }
  }

  public TransactionExtention updateBrokerage(UpdateBrokerageContract request) {
    return blockingStubFull.updateBrokerage(request);
  }

  public NumberMessage getReward(byte[] address) {
    BytesMessage bytesMessage = BytesMessage.newBuilder().setValue(ByteString.copyFrom(address))
        .build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getRewardInfo(bytesMessage);
    } else {
      return blockingStubFull.getRewardInfo(bytesMessage);
    }
  }

  public NumberMessage getBrokerage(byte[] address) {
    BytesMessage bytesMessage = BytesMessage.newBuilder().setValue(ByteString.copyFrom(address))
        .build();
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.getBrokerageInfo(bytesMessage);
    } else {
      return blockingStubFull.getBrokerageInfo(bytesMessage);
    }
  }

  public Optional<TransactionInfoList> getTransactionInfoByBlockNum(long blockNum) {
    TransactionInfoList transactionInfoList;
    NumberMessage.Builder builder = NumberMessage.newBuilder();
    builder.setNum(blockNum);

    if (blockingStubSolidity != null) {
      transactionInfoList = blockingStubSolidity.getTransactionInfoByBlockNum(builder.build());
    } else {
      transactionInfoList = blockingStubFull.getTransactionInfoByBlockNum(builder.build());
    }

    return Optional.ofNullable(transactionInfoList);
  }


  public DecryptNotesTRC20 scanShieldedTRC20NoteByIvk(IvkDecryptTRC20Parameters parameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.scanShieldedTRC20NotesByIvk(parameters);
    } else {
      return blockingStubFull.scanShieldedTRC20NotesByIvk(parameters);
    }
  }

  public DecryptNotesTRC20 scanShieldedTRC20NoteByOvk(OvkDecryptTRC20Parameters parameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.scanShieldedTRC20NotesByOvk(parameters);
    } else {
      return blockingStubFull.scanShieldedTRC20NotesByOvk(parameters);
    }
  }

  public ShieldedTRC20Parameters createShieldedContractParameters(
      PrivateShieldedTRC20Parameters parameters) {
    return blockingStubFull.createShieldedContractParameters(parameters);
  }

  public ShieldedTRC20Parameters createShieldedContractParametersWithoutAsk(
      PrivateShieldedTRC20ParametersWithoutAsk parameters) {
    return blockingStubFull.createShieldedContractParametersWithoutAsk(parameters);
  }

  public NullifierResult isShieldedTRC20ContractNoteSpent(NfTRC20Parameters prameters) {
    if (blockingStubSolidity != null) {
      return blockingStubSolidity.isShieldedTRC20ContractNoteSpent(prameters);
    } else {
      return blockingStubFull.isShieldedTRC20ContractNoteSpent(prameters);
    }
  }

  public BytesMessage getTriggerInputForShieldedTRC20Contract(
      ShieldedTRC20TriggerContractParameters parameters) {
    return blockingStubFull.getTriggerInputForShieldedTRC20Contract(parameters);
  }

  public TransactionExtention marketSellAsset(MarketSellAssetContract request) {
    return blockingStubFull.marketSellAsset(request);
  }

  public TransactionExtention marketCancelOrder(MarketCancelOrderContract request) {
    return blockingStubFull.marketCancelOrder(request);
  }

  public Optional<MarketOrderList> getMarketOrderByAccount(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    BytesMessage request = BytesMessage.newBuilder().setValue(addressBS).build();

    MarketOrderList marketOrderList;
    if (blockingStubSolidity != null) {
      marketOrderList = blockingStubSolidity.getMarketOrderByAccount(request);
    } else {
      marketOrderList = blockingStubFull.getMarketOrderByAccount(request);
    }
    return Optional.ofNullable(marketOrderList);
  }

  public Optional<MarketPriceList> getMarketPriceByPair(byte[] sellTokenId, byte[] buyTokenId) {
    MarketOrderPair request =
        MarketOrderPair.newBuilder()
            .setSellTokenId(ByteString.copyFrom(sellTokenId))
            .setBuyTokenId(ByteString.copyFrom(buyTokenId))
            .build();

    MarketPriceList marketPriceList;
    if (blockingStubSolidity != null) {
      marketPriceList = blockingStubSolidity.getMarketPriceByPair(request);
    } else {
      marketPriceList = blockingStubFull.getMarketPriceByPair(request);
    }
    return Optional.ofNullable(marketPriceList);
  }


  public Optional<MarketOrderList> getMarketOrderListByPair(byte[] sellTokenId, byte[] buyTokenId) {
    MarketOrderPair request =
        MarketOrderPair.newBuilder()
            .setSellTokenId(ByteString.copyFrom(sellTokenId))
            .setBuyTokenId(ByteString.copyFrom(buyTokenId))
            .build();

    MarketOrderList marketOrderList;
    if (blockingStubSolidity != null) {
      marketOrderList = blockingStubSolidity.getMarketOrderListByPair(request);
    } else {
      marketOrderList = blockingStubFull.getMarketOrderListByPair(request);
    }
    return Optional.ofNullable(marketOrderList);
  }


  public Optional<MarketOrderPairList> getMarketPairList() {
    MarketOrderPairList orderPairList;
    if (blockingStubSolidity != null) {
      orderPairList = blockingStubSolidity.getMarketPairList(EmptyMessage.newBuilder().build());
    } else {
      orderPairList = blockingStubFull.getMarketPairList(EmptyMessage.newBuilder().build());
    }
    return Optional.ofNullable(orderPairList);
  }

  public Optional<MarketOrder> getMarketOrderById(byte[] order) {
    ByteString orderBytes = ByteString.copyFrom(order);
    BytesMessage request = BytesMessage.newBuilder().setValue(orderBytes).build();
    MarketOrder orderPair;
    if (blockingStubSolidity != null) {
      orderPair = blockingStubSolidity.getMarketOrderById(request);
    } else {
      orderPair = blockingStubFull.getMarketOrderById(request);
    }
    return Optional.ofNullable(orderPair);
  }

}
