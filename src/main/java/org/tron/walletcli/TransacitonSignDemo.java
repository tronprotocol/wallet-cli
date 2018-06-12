package org.tron.walletcli;

import static java.util.Arrays.copyOfRange;

import ch.qos.logback.core.encoder.EchoEncoder;
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.math.BigInteger;
import java.util.Arrays;
import org.spongycastle.math.ec.ECPoint;
import org.springframework.util.StringUtils;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CipherException;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

public class TransacitonSignDemo {

  public static Transaction createTransaction(byte[] from, byte[] to, long amount) {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();

    Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
    Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract
        .newBuilder();
    transferContractBuilder.setAmount(amount);
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsOwner = ByteString.copyFrom(from);
    transferContractBuilder.setToAddress(bsTo);
    transferContractBuilder.setOwnerAddress(bsOwner);
    try {
      Any anyTo = Any.pack(transferContractBuilder.build());
      contractBuilder.setParameter(anyTo);
    } catch (Exception e) {
      return null;
    }
    contractBuilder.setType(Transaction.Contract.ContractType.TransferContract);
    transactionBuilder.getRawDataBuilder().addContract(contractBuilder);

    transactionBuilder.getRawDataBuilder();

    Transaction transaction = transactionBuilder.build();
    return transaction;
  }


  private static byte[] signTransaction2Byte(byte[] transaction, byte[] privateKey)
      throws InvalidProtocolBufferException {
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = Sha256Hash.hash(rawdata);
    byte[] sign = ecKey.sign(hash).toByteArray();
    return  transaction1.toBuilder().addSignature(ByteString.copyFrom(sign)).build().toByteArray();
  }

  private static Transaction signTransaction2Object(byte[] transaction, byte[] privateKey)
      throws InvalidProtocolBufferException {
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    Transaction transaction1 = Transaction.parseFrom(transaction);
    byte[] rawdata = transaction1.getRawData().toByteArray();
    byte[] hash = Sha256Hash.hash(rawdata);
    byte[] sign = ecKey.sign(hash).toByteArray();
    return  transaction1.toBuilder().addSignature(ByteString.copyFrom(sign)).build();
  }

  public static void main(String[] args) throws InvalidProtocolBufferException {
    String privateStr = "8EC126455714916EE7DB9A6382A23FFAC4D037E0FFD06316958CAC84A9CECD4C";
    byte[] privateBytes = ByteArray.fromHexString(privateStr);
    ECKey ecKey = ECKey.fromPrivate(privateBytes);
    byte[] from = ecKey.getAddress();
    byte[] to = ByteArray.fromHexString("4142CC25450496825F2571DE20DB42C4895CDB53E6");
    long amount = 1000_1000_1000L; //1000 TRX
    Transaction transaction = createTransaction(from, to, amount);
    byte[] transactionBytes = transaction.toByteArray();

    //=======================================//
    //if you get a transaction by object
    Transaction transaction1 = TransactionUtils.sign(transaction, ecKey);
    //if you need return bytes
    byte[] transaction2 = transaction1.toByteArray();
    System.out.println("transaction2 ::::: " + ByteArray.toHexString(transaction2));

    //if you get a transaction by bytes and need return a bytes
    byte[] transaction3 = signTransaction2Byte(transactionBytes, privateBytes);
    System.out.println("transaction3 ::::: " + ByteArray.toHexString(transaction3));

    //if you get a transaction by bytes and need return a objetc
    Transaction transaction4 = signTransaction2Object(transactionBytes, privateBytes);
    System.out.println("transaction4 ::::: " + ByteArray.toHexString(transaction4.toByteArray()));
  }
}
