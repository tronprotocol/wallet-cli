package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocal.TXInput;
import org.tron.protos.Protocal.TXOutput;
import org.tron.protos.Protocal.Transaction;

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
    transactionBuilder.getRawDataBuilder().setType(Transaction.TranscationType.Transfer);
    Transaction transaction = transactionBuilder.build();
    return transaction;
  }

}
