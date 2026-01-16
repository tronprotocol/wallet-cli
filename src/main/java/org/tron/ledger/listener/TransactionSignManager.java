package org.tron.ledger.listener;

import com.google.protobuf.ByteString;
import org.bouncycastle.util.encoders.Hex;
import org.hid4java.HidDevice;
import org.tron.trident.proto.Chain;

public class TransactionSignManager {
  private Chain.Transaction transaction;
  private HidDevice hidDevice;
  private String gasfreeSignature;

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

  public synchronized void setGasfreeSignature(String gasfreeSignature) {
    this.gasfreeSignature = gasfreeSignature;
  }

  public synchronized void setHidDevice(HidDevice hidDevice) {
    this.hidDevice = hidDevice;
  }


  public synchronized Chain.Transaction getTransaction() {
    return this.transaction;
  }

  public synchronized String getGasfreeSignature() {
    return this.gasfreeSignature;
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

  public synchronized void generateGasFreeSignature(byte[] signedHash) {
    this.gasfreeSignature = Hex.toHexString(signedHash);
  }
}