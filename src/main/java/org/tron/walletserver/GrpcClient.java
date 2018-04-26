package org.tron.walletserver;

import com.google.protobuf.ByteString;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.*;
import org.tron.api.WalletGrpc;
import org.tron.api.WalletSolidityGrpc;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Contract;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

public class GrpcClient {

  private final ManagedChannel channelFull;
  private final ManagedChannel channelSolidity;
  private final WalletGrpc.WalletBlockingStub blockingStubFull;
  private final WalletSolidityGrpc.WalletSolidityBlockingStub blockingStubSolidity;

//  public GrpcClient(String host, int port) {
//    channel = ManagedChannelBuilder.forAddress(host, port)
//        .usePlaintext(true)
//        .build();
//    blockingStub = WalletGrpc.newBlockingStub(channel);
//  }

  public GrpcClient(String fullnode, String soliditynode) {
    channelFull = ManagedChannelBuilder.forTarget(fullnode)
        .usePlaintext(true)
        .build();
    blockingStubFull = WalletGrpc.newBlockingStub(channelFull);

    channelSolidity = ManagedChannelBuilder.forTarget(soliditynode)
        .usePlaintext(true)
        .build();
    blockingStubSolidity = WalletSolidityGrpc.newBlockingStub(channelSolidity);
  }

  public void shutdown() throws InterruptedException {
    channelFull.shutdown().awaitTermination(5, TimeUnit.SECONDS);
    channelSolidity.shutdown().awaitTermination(5, TimeUnit.SECONDS);
  }

  public Account queryAccount(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    return blockingStubSolidity.getAccount(request);
  }

  public Transaction createTransaction(Contract.TransferContract contract) {
    return blockingStubFull.createTransaction(contract);
  }

  public Transaction createTransaction(Contract.AccountUpdateContract contract) {
    return blockingStubFull.updateAccount(contract);
  }

  public Transaction createTransferAssetTransaction(Contract.TransferAssetContract contract) {
    return blockingStubFull.transferAsset(contract);
  }

  public Transaction createParticipateAssetIssueTransaction(
      Contract.ParticipateAssetIssueContract contract) {
    return blockingStubFull.participateAssetIssue(contract);
  }

  public Transaction createAccount(Contract.AccountCreateContract contract) {
    return blockingStubFull.createAccount(contract);
  }

  public Transaction createAssetIssue(Contract.AssetIssueContract contract) {
    return blockingStubFull.createAssetIssue(contract);
  }

  public Transaction voteWitnessAccount(Contract.VoteWitnessContract contract) {
    return blockingStubFull.voteWitnessAccount(contract);
  }

  public Transaction createWitness(Contract.WitnessCreateContract contract) {
    return blockingStubFull.createWitness(contract);
  }

  public boolean broadcastTransaction(Transaction signaturedTransaction) {
    GrpcAPI.Return response = blockingStubFull.broadcastTransaction(signaturedTransaction);
    return response.getResult();
  }

  public Block getBlock(long blockNum) {
    if (blockNum < 0) {
      return blockingStubSolidity.getNowBlock(EmptyMessage.newBuilder().build());
    }
    NumberMessage.Builder builder = NumberMessage.newBuilder();
    builder.setNum(blockNum);
    return blockingStubSolidity.getBlockByNum(builder.build());
  }

  public Optional<AccountList> listAccounts() {
    AccountList accountList = blockingStubSolidity.listAccounts(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(accountList);
  }

  public Optional<WitnessList> listWitnesses() {
    WitnessList witnessList = blockingStubSolidity.listWitnesses(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(witnessList);
  }

  public Optional<AssetIssueList> getAssetIssueList() {
    AssetIssueList assetIssueList = blockingStubSolidity
        .getAssetIssueList(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(assetIssueList);
  }

  public Optional<NodeList> listNodes() {
    NodeList nodeList = blockingStubFull
        .listNodes(EmptyMessage.newBuilder().build());
    return Optional.ofNullable(nodeList);
  }

  public Optional<AssetIssueList> getAssetIssueByAccount(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    AssetIssueList assetIssueList = blockingStubSolidity
        .getAssetIssueByAccount(request);
    return Optional.ofNullable(assetIssueList);
  }

  public AssetIssueContract getAssetIssueByName(String assetName) {
    ByteString assetNameBs = ByteString.copyFrom(assetName.getBytes());
    BytesMessage request = BytesMessage.newBuilder().setValue(assetNameBs).build();
    return blockingStubSolidity.getAssetIssueByName(request);
  }

  public NumberMessage getTotalTransaction() {
    return blockingStubSolidity.totalTransaction(EmptyMessage.newBuilder().build());
  }

  public Optional<AssetIssueList> getAssetIssueListByTimestamp(long time) {
    NumberMessage.Builder timeStamp = NumberMessage.newBuilder();
    timeStamp.setNum(time);
    AssetIssueList assetIssueList = blockingStubSolidity.getAssetIssueListByTimestamp(timeStamp.build());
    return Optional.ofNullable(assetIssueList);
  }

  public Optional<TransactionList> getTransactionsByTimestamp(long start, long end) {
    TimeMessage.Builder timeMessage = TimeMessage.newBuilder();
    timeMessage.setBeginInMilliseconds(start);
    timeMessage.setEndInMilliseconds(end);
    TransactionList transactionList = blockingStubSolidity.getTransactionsByTimestamp(timeMessage.build());
    return Optional.ofNullable(transactionList);
  }

  public Optional<TransactionList> getTransactionsFromThis(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    TransactionList transactionList = blockingStubSolidity.getTransactionsFromThis(request);
    return Optional.ofNullable(transactionList);
  }

  public Optional<TransactionList> getTransactionsToThis(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    TransactionList transactionList = blockingStubSolidity.getTransactionsToThis(request);
    return Optional.ofNullable(transactionList);
  }

  public Optional<Transaction> getTransactionById(String txID){
    ByteString bsTxid = ByteString.copyFrom(ByteArray.fromHexString(txID));
    BytesMessage request = BytesMessage.newBuilder().setValue(bsTxid).build();
    Transaction transaction = blockingStubSolidity.getTransactionById(request);
    return Optional.ofNullable(transaction);
  }
}
