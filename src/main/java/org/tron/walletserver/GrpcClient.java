package org.tron.walletserver;

import com.google.protobuf.ByteString;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;

import java.util.concurrent.TimeUnit;

import org.tron.api.GrpcAPI;
import org.tron.api.WalletGrpc;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Transaction;

public class GrpcClient {

  private final ManagedChannel channel;
  private final WalletGrpc.WalletBlockingStub blockingStub;

  public GrpcClient(String host, int port) {
    channel = ManagedChannelBuilder.forAddress(host, port)
        .usePlaintext(true)
        .build();
    blockingStub = WalletGrpc.newBlockingStub(channel);
  }

  public void shutdown() throws InterruptedException {
    channel.shutdown().awaitTermination(5, TimeUnit.SECONDS);
  }

  public long getBalance(byte[] address) {
    ByteString addressBS = ByteString.copyFrom(address);
    Account request = Account.newBuilder().setAddress(addressBS).build();
    Account response = blockingStub.getBalance(request);
    return response.getBalance();
  }

  public Transaction createTransaction(Contract.TransferContract contract) {
    return blockingStub.createTransaction(contract);
  }

  public Transaction createAccount(Contract.AccountCreateContract contract) {
    return blockingStub.createAccount(contract);
  }

  public Transaction createAssetIssue(Contract.AssetIssueContract contract) {
    return blockingStub.createAssetIssue(contract);
  }

  public Transaction voteWitnessAccount(Contract.VoteWitnessContract contract) {
    return blockingStub.voteWitnessAccount(contract);
  }

  public Transaction createWitness(Contract.WitnessCreateContract contract) {
    return blockingStub.createWitness(contract);
  }

  public boolean broadcastTransaction(Transaction signaturedTransaction) {
    GrpcAPI.Return response = blockingStub.broadcastTransaction(signaturedTransaction);
    return response.getResult();
  }
}
