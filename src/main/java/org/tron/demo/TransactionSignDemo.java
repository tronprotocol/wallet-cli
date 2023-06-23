package org.tron.demo;

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import org.tron.api.GrpcAPI.Return;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CancelException;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.walletserver.WalletApi;

import java.util.Arrays;

public class TransactionSignDemo {

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
    TransferContract.Builder transferContractBuilder = TransferContract.newBuilder();
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
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = Sha256Sm3Hash.hash(rawdata);
    byte[] sign = ecKey.sign(hash).toByteArray();
    return transaction1.toBuilder().addSignature(ByteString.copyFrom(sign)).build().toByteArray();
  }

  private static Transaction signTransaction2Object(byte[] transaction, byte[] privateKey)
      throws InvalidProtocolBufferException {
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = Sha256Sm3Hash.hash(rawdata);
    byte[] sign = ecKey.sign(hash).toByteArray();
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
    ECKey ecKey = ECKey.fromPrivate(privateBytes);
    byte[] from = ecKey.getAddress();
    byte[] to = WalletApi.decodeFromBase58Check("TGehVcNhud84JDCGrNHKVz9jEAVKUpbuiv");
    long amount = 100_000_000L; // 100 TRX, api only receive trx in Sun, and 1 trx = 1000000 Sun
    Transaction transaction = createTransaction(from, to, amount);
    byte[] transactionBytes = transaction.toByteArray();

    /*
    //sign a transaction
    Transaction transaction1 = TransactionUtils.sign(transaction, ecKey);
    //get byte transaction
    byte[] transaction2 = transaction1.toByteArray();
    System.out.println("transaction2 ::::: " + ByteArray.toHexString(transaction2));

    //sign a transaction in byte format and return a Transaction object
    Transaction transaction3 = signTransaction2Object(transactionBytes, privateBytes);
    System.out.println("transaction3 ::::: " + ByteArray.toHexString(transaction3.toByteArray()));
    */

    // sign a transaction in byte format and return a Transaction in byte format
    byte[] transaction4 = signTransaction2Byte(transactionBytes, privateBytes);
    System.out.println("transaction4 ::::: " + ByteArray.toHexString(transaction4));
    Transaction transactionSigned;
    if (WalletApi.getRpcVersion() == 2) {
      TransactionExtention transactionExtention =
          WalletApi.signTransactionByApi2(transaction, ecKey.getPrivKeyBytes());
      if (transactionExtention == null) {
        System.out.println("transactionExtention is null");
        return;
      }
      Return ret = transactionExtention.getResult();
      if (!ret.getResult()) {
        System.out.println("Code = " + ret.getCode());
        System.out.println("Message = " + ret.getMessage().toStringUtf8());
        return;
      }
      System.out.println(
          "Receive txid = " + ByteArray.toHexString(transactionExtention.getTxid().toByteArray()));
      transactionSigned = transactionExtention.getTransaction();
    } else {
      transactionSigned = WalletApi.signTransactionByApi(transaction, ecKey.getPrivKeyBytes());
    }
    byte[] transaction5 = transactionSigned.toByteArray();
    System.out.println("transaction5 ::::: " + ByteArray.toHexString(transaction5));
    if (!Arrays.equals(transaction4, transaction5)) {
      System.out.println("transaction4 is not equals to transaction5 !!!!!");
    }
    boolean result = broadcast(transaction4);

    System.out.println(result);
  }
}
