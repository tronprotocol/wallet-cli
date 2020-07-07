package org.tron.demo;

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.crypto.sm2.SM2;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CancelException;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.walletserver.WalletApi;

public class TransactionSignDemoForSM2 {

  public static Transaction setReference(Transaction transaction, Block newestBlock) {
    long blockHeight = newestBlock.getBlockHeader().getRawData().getNumber();
    byte[] blockHash = getBlockHash(newestBlock).getBytes();
    byte[] refBlockNum = ByteArray.fromLong(blockHeight);
    Transaction.raw rawData = transaction.getRawData().toBuilder()
            .setRefBlockHash(ByteString.copyFrom(ByteArray.subArray(blockHash, 8, 16)))
            .setRefBlockBytes(ByteString.copyFrom(ByteArray.subArray(refBlockNum, 6, 8)))
            .build();
    return transaction.toBuilder().setRawData(rawData).build();
  }

  public static Sha256Sm3Hash getBlockHash(Block block) {
    return Sha256Sm3Hash.of(block.getBlockHeader().getRawData().toByteArray());
  }

  public static String getTransactionHash(Transaction transaction) {
    String txid = ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()));
    return txid;
  }

  public static Transaction createTransaction(byte[] from, byte[] to, long amount) {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();
    Block newestBlock = WalletApi.getBlock(-1);

    Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
    TransferContract.Builder transferContractBuilder =
        TransferContract.newBuilder();
    transferContractBuilder.setAmount(amount);
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsOwner = ByteString.copyFrom(from);
    transferContractBuilder.setToAddress(bsTo);
    transferContractBuilder.setOwnerAddress(bsOwner);
    try {
      Any any = Any.pack(transferContractBuilder.build());
      contractBuilder.setParameter(any);
    } catch (Exception e) {
      return null;
    }
    contractBuilder.setType(Transaction.Contract.ContractType.TransferContract);
    transactionBuilder.getRawDataBuilder().addContract(contractBuilder)
        .setTimestamp(System.currentTimeMillis())
        .setExpiration(newestBlock.getBlockHeader().getRawData().getTimestamp() + 10 * 60 * 60 * 1000);
    Transaction transaction = transactionBuilder.build();
    Transaction refTransaction = setReference(transaction, newestBlock);
    return refTransaction;
  }

  private static byte[] signTransaction2Byte(byte[] transaction, byte[] privateKey)
      throws InvalidProtocolBufferException {
    SM2 sm2 = SM2.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = sm2.hash(rawdata);
    byte[] sign = sm2.sign(hash).toByteArray();
    return transaction1.toBuilder().addSignature(ByteString.copyFrom(sign)).build().toByteArray();
  }

  private static Transaction signTransaction2Object(byte[] transaction, byte[] privateKey)
      throws InvalidProtocolBufferException {
    SM2 sm2 = SM2.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = sm2.hash(rawdata);
    byte[] sign = sm2.sign(hash).toByteArray();
    return transaction1.toBuilder().addSignature(ByteString.copyFrom(sign)).build();
  }

  private static boolean broadcast(byte[] transactionBytes) throws InvalidProtocolBufferException {
    return WalletApi.broadcastTransaction(transactionBytes);
  }

  private static void base58checkToHexString() {
    String base58check = "TGehVcNhud84JDCGrNHKVz9jEAVKUpbuiv";
    String hexString = ByteArray.toHexString(WalletApi.decodeFromBase58Check(base58check));
    System.out.println(hexString);
  }

  private static void hexStringTobase58check() {
    String hexString = "414948c2e8a756d9437037dcd8c7e0c73d560ca38d";
    String base58check = WalletApi.encode58Check(ByteArray.fromHexString(hexString));
    System.out.println(base58check);
  }

  public static void main(String[] args) throws InvalidProtocolBufferException, CancelException {
    String privateStr = "D95611A9AF2A2A45359106222ED1AFED48853D9A44DEFF8DC7913F5CBA727366";
    byte[] privateBytes = ByteArray.fromHexString(privateStr);
    SM2 sm2 = SM2.fromPrivate(privateBytes);
    byte[] from = sm2.getAddress();
    byte[] to = WalletApi.decodeFromBase58Check("TGehVcNhud84JDCGrNHKVz9jEAVKUpbuiv");
    long amount = 100_000_000L; // 100 TRX, api only receive trx in Sun, and 1 TRX = 1000000 Sun
    Transaction transaction = createTransaction(from, to, amount);
    byte[] transactionBytes = transaction.toByteArray();

    // sign a transaction in byte format and return a Transaction in byte format
    byte[] transaction4 = signTransaction2Byte(transactionBytes, privateBytes);
    boolean result = broadcast(transaction4);

    System.out.println(result);
  }
}
