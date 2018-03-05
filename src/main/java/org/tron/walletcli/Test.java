package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Contract;
import org.tron.protos.Protocal.TXInput;
import org.tron.protos.Protocal.TXOutput;
import org.tron.protos.Protocal.Transaction;
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
        transactionBuilder.getRawDataBuilder().setType(Transaction.TranscationType.UtxoType);
        Transaction transaction = transactionBuilder.build();
        return transaction;
    }

    public static Transaction createTransaction(TransferContract contract) {
        return null;
    }

    public static Transaction createTransactionEx() {
        Transaction.Builder transactionBuilder = Transaction.newBuilder();
        Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
        Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract.newBuilder();

        transferContractBuilder.setAmount(10);
        ByteString bsTo = ByteString.copyFrom(ByteArray
                .fromHexString("00112233445566778899AABBCCDDEEFF00112233"));
        ByteString bsOwner = ByteString.copyFrom(ByteArray
                .fromHexString("00112233445566778899AABBCCDDEEFF00112233"));
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
        transactionBuilder.getRawDataBuilder().setType(Transaction.TranscationType.ContractType);


        Transaction transaction = transactionBuilder.build();
        return transaction;
    }
}
