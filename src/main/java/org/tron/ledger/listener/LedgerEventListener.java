package org.tron.ledger.listener;

import static org.tron.common.utils.TransactionUtils.getTransactionId;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;
import static org.tron.ledger.sdk.ApduMessageBuilder.buildTransactionSignApduMessage;
import static org.tron.ledger.sdk.CommonUtil.bytesToHex;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_SIGN_CANCEL;

import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.Getter;
import lombok.Setter;
import org.apache.commons.lang3.ArrayUtils;
import org.hid4java.HidDevice;
import org.hid4java.event.HidServicesEvent;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerConstant;
import org.tron.ledger.sdk.LedgerProtocol;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.ledger.wrapper.LedgerSignResult;
import org.tron.trident.proto.Chain;

public class LedgerEventListener extends BaseListener {
  private static final int TRANSACTION_SIGN_TIMEOUT = 60;

  @Getter
  private AtomicBoolean isTimeOutShutdown = new AtomicBoolean(false);
  @Getter
  @Setter
  private AtomicBoolean ledgerSignEnd = new AtomicBoolean(false);

  private LedgerEventListener() {
  }
  private static class Holder {
    private static final LedgerEventListener INSTANCE = new LedgerEventListener();
  }
  public static LedgerEventListener getInstance() {
    return Holder.INSTANCE;
  }


  public boolean waitAndShutdownWithInput() {
    Thread shutdownThread = new Thread(() -> {
      System.out.printf(ANSI_YELLOW + "If the Ledger confirms the signature, the transaction will be broadcast.\n" + ANSI_RESET);
      System.out.printf(ANSI_YELLOW + "Current transaction sign will be closed after %ds.\n" + ANSI_RESET, TRANSACTION_SIGN_TIMEOUT);
      sleepNoInterruption(TRANSACTION_SIGN_TIMEOUT);
      shutdownHidServices();
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_RED + "Shutdown thread finished\n" + ANSI_RESET);
      }
    });

    shutdownThread.start();

    try {
      shutdownThread.join();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }

    return true;
  }

  private synchronized void shutdownHidServices() {
    if (!isTimeOutShutdown.get()) {
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_YELLOW + "Ledger sign shutdown...%n" + ANSI_RESET);
      }
      ledgerSignEnd.compareAndSet(false, true);
      isTimeOutShutdown.compareAndSet(false,true);
    }
  }


  public boolean executeSignListen(HidDevice hidDevice, Chain.Transaction transaction, String path, boolean gasfree) {
    boolean ret = false;
    try {
      byte[] sendResult = handleTransSign(hidDevice, transaction, path, gasfree);
      if (sendResult == null) {
        System.out.println("Transaction sign request is sent to Ledger");
        TransactionSignManager.getInstance().setHidDevice(hidDevice);
        isTimeOutShutdown.compareAndSet(true,false);
        String transactionId = getTransactionId(transaction).toString();
        LedgerSignResult.createFileIfNotExists(hidDevice.getPath());
        LedgerSignResult.appendLineIfNotExists(
            hidDevice.getPath(), transactionId, LedgerSignResult.SIGN_RESULT_SIGNING);
        ret = waitAndShutdownWithInput();
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }

    return ret;
  }

  /**
   * @param path example "m/44'/195'/0'/0/0"
   */
  public byte[] handleTransSign(HidDevice hidDevice, Chain.Transaction transaction, String path, boolean gasfree) {
    final int TIMEOUT_MILLIS = 1000;
    final int MAX_WAIT_TIME_MILLIS = 1000; // 1.5 seconds
    final int BYTE_LENGTH_THRESHOLD = 255;
    final String SIGN_BY_HASH = "6a8c";
    final String APP_IS_OPEN = "6511";

    byte[] rawBytes = transaction.getRawData().toByteArray();
    String transactionRaw;
    String ins;
    String p1;
    String p2 = "00";
    if (rawBytes.length < BYTE_LENGTH_THRESHOLD && !gasfree) {
      transactionRaw = bytesToHex(rawBytes);
      ins = "04";
      p1 = "10";
    } else {
      transactionRaw = bytesToHex(getTransactionId(transaction).getBytes());
      if (gasfree) {
        transactionRaw = bytesToHex(transaction.getRawData().getData().toByteArray());
      }
      ins = "05";
      p1 = "00";
    }
    byte[] apdu = buildTransactionSignApduMessage(path, transactionRaw, ins, p1, p2);
    byte[] response = ApduExchangeHandler.exchangeApdu(hidDevice, apdu,
        TIMEOUT_MILLIS, MAX_WAIT_TIME_MILLIS);

    if (ArrayUtils.isNotEmpty(response)) {
      if (SIGN_BY_HASH.equals(bytesToHex(response))) {
        System.out.println(ANSI_RED + "Please first set 'Sign By Hash' to 'Allowed' in Ledger TRON Settings." + ANSI_RESET);
      }
      if (APP_IS_OPEN.equals(bytesToHex(response))) {
        System.out.println(ANSI_RED + "Please ensure The Tron app is open in your Ledger device. Usually, 'Application is ready' will be displayed on your ledger device." + ANSI_RESET);
      }
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("HandleTransSign response: " + bytesToHex(response));
      }
    } else {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("HandleTransSign response is null");
      }
    }
    return response;
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {
    super.hidDataReceived(event);
    if (event.getHidDevice().getVendorId() != LedgerConstant.LEDGER_VENDOR_ID) {
      return;
    }

    byte[] response = event.getDataReceived();
    byte[] unwrappedResponse = LedgerProtocol.unwrapResponseAPDU(
        LedgerConstant.CHANNEL, response, LedgerConstant.PACKET_SIZE, false);
    if (DebugConfig.isDebugEnabled()) {
      System.out.println("Received unwrappedResponse: " + CommonUtil.bytesToHex(unwrappedResponse));
    }

    if (LEDGER_SIGN_CANCEL.equalsIgnoreCase(CommonUtil.bytesToHex(unwrappedResponse))) {
      HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
      LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());

      System.out.println("\nCancel sign from Ledger");
      doLedgerSignEnd();
      hidDevice.close();
    } else {
      Chain.Transaction transaction = TransactionSignManager.getInstance().getTransaction();
      if (transaction == null) {
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Transaction is null");
        }
        HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
        LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Do updateAllSigningToReject");
        }
        hidDevice.close();
      } else {
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Transaction is not null");
        }
        String transactionId = getTransactionId(transaction).toString();
        if (!isTimeOutShutdown.get()) {
          System.out.println("\nConfirm sign from Ledger");
          byte[] signature = Arrays.copyOfRange(unwrappedResponse, 0, 65);
          if (DebugConfig.isDebugEnabled()) {
            System.out.println("Signature: " + CommonUtil.bytesToHex(signature));
          }
          TransactionSignManager.getInstance().generateGasFreeSignature(signature);
          TransactionSignManager.getInstance().addTransactionSign(signature);
          LedgerSignResult.updateState(
              TransactionSignManager.getInstance().getHidDevice().getPath()
              , transactionId, LedgerSignResult.SIGN_RESULT_SUCCESS
          );
        } else {
          System.out.println("TransactionId: " + transactionId);
          System.out.println("This transaction has expired, please resign and submit again.");
          LedgerSignResult.updateState(
              TransactionSignManager.getInstance().getHidDevice().getPath()
              , transactionId, LedgerSignResult.SIGN_RESULT_CANCEL
          );
        }
        doLedgerSignEnd();
      }
    }
  }

  private void doLedgerSignEnd() {
    ledgerSignEnd.compareAndSet(false, true);
    if (TransactionSignManager.getInstance().getHidDevice() != null) {
      TransactionSignManager.getInstance().getHidDevice().close();
      TransactionSignManager.getInstance().setHidDevice(null);
    }
  }
}
