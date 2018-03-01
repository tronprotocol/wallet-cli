package org.tron.walletcli;

import com.google.protobuf.ByteString;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import java.util.concurrent.TimeUnit;
import org.tron.api.GrpcAPI;
import org.tron.api.WalletGrpc;
import org.tron.protos.Contract;
import org.tron.protos.Protocal.Account;
import org.tron.protos.Protocal.Transaction;

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

  public Transaction createTransaction(byte[] from, byte[] to, long amount) {
    ByteString fromBS = ByteString.copyFrom(from);
    ByteString toBS = ByteString.copyFrom(to);
    //Contract.TransferContractOrBuilder builder = Contract.TransferContract.newBuilder();
    Contract.TransferContract.Builder builder = Contract.TransferContract.newBuilder();
    builder = builder.setOwnerAddress(fromBS);
    builder = builder.setToAddress(toBS);
    builder = builder.setAmount(amount);
    Contract.TransferContract request = builder.build();

    Transaction transaction = blockingStub.createTransaction(request);
    return transaction;
  }

  public boolean broadcastTransaction(Transaction signaturedTransaction) {
    GrpcAPI.Return response = blockingStub.broadcastTransaction(signaturedTransaction);
    return response.getResult();
  }
}
