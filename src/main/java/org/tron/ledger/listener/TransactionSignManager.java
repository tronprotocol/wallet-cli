package org.tron.ledger.listener;

import com.google.protobuf.ByteString;
import org.hid4java.HidDevice;
import org.tron.protos.Protocol;
import org.tron.trident.proto.Chain;

public class TransactionSignManager {
  private Chain.Transaction transaction;
  private HidDevice hidDevice;

  private TransactionSignManager() {

  }

  private static class Holder {
    private static final TransactionSignManager INSTANCE = new TransactionSignManager();
  }

  public static TransactionSignManager getInstance() {
    return Holder.INSTANCE;
  }

  public synchronized void setTransaction(Chain.Transaction newTransaction) {
    this.transaction = newTransaction;
  }

  public synchronized void setHidDevice(HidDevice hidDevice) {
    this.hidDevice = hidDevice;
  }


  public synchronized Chain.Transaction getTransaction() {
    return this.transaction;
  }

  public synchronized HidDevice getHidDevice() {
    return this.hidDevice;
  }

  public synchronized void addTransactionSign(byte[] signByteArr) {
    Chain.Transaction.Builder transactionBuilderSigned = transaction.toBuilder();
    ByteString bsSign = ByteString.copyFrom(signByteArr);
    transactionBuilderSigned.addSignature(bsSign);
    transaction = transactionBuilderSigned.build();
  }
}