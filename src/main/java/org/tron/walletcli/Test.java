package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.TXInput;
import org.tron.protos.Protocol.TXOutput;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Contract.TransferContract;
import com.google.protobuf.Any;

public class Test {

  public static Transaction createTransaction() {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();
    TXInput.Builder txInputBuilder = TXInput.newBuilder();
    TXOutput.Builder txOutputBuilder = TXOutput.newBuilder();

    ByteString bsTxID = ByteString.copyFrom(ByteArray
        .fromHexString("00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF"));
    ByteString bsTo = ByteString.copyFrom(ByteArray
        .fromHexString("00112233445566778899AABBCCDDEEFF00112233"));

    txInputBuilder.getRawDataBuilder().setTxID(bsTxID);

    txInputBuilder.getRawDataBuilder().setVout(0);
    TXInput txInput = txInputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVin(0, txInput);
    txInputBuilder.getRawDataBuilder().setVout(0);
    txInput = txInputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVin(1, txInput);

    txOutputBuilder.setValue(10);
    txOutputBuilder.setPubKeyHash(bsTo);
    TXOutput txOutput = txOutputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVout(0, txOutput);
    transactionBuilder.getRawDataBuilder().setType(Transaction.TransactionType.UtxoType);
    Transaction transaction = transactionBuilder.build();
    return transaction;
  }

  public static Transaction createTransaction(TransferContract contract) {
    return null;
  }

  public static Transaction createTransactionEx(String toAddress, long amount) {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();

    for ( int i = 0; i < 10; i++ ) {
      Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
      Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract.newBuilder();
      transferContractBuilder.setAmount(amount);
      ByteString bsTo = ByteString.copyFrom(ByteArray
          .fromHexString(toAddress));
      ByteString bsOwner = ByteString.copyFrom(ByteArray
          .fromHexString("e1a17255ccf15d6b12dcc074ca1152477ccf9b84"));
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
      amount++;
    }
    transactionBuilder.getRawDataBuilder().setType(Transaction.TransactionType.ContractType);


    Transaction transaction = transactionBuilder.build();
    return transaction;
  }
}
