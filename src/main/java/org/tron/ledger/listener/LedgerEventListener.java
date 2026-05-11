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
  private volatile byte[] lastSendResult;
  @Setter
  private volatile boolean standardCliQuiet;

  /**
   * Bytes returned by the most recent {@link #handleTransSign} call. May be {@code null} if no
   * sign has been attempted yet, or if the call threw before assigning. Standard CLI's
   * non-interactive Ledger bridge reads this to map APDU error codes (0x6511, 0x6a8c, …) to
   * structured outcomes. REPL does not consult this field.
   */
  public byte[] getLastSendResultBytes() {
    return lastSendResult;
  }
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
      print(ANSI_YELLOW + "If the Ledger confirms the signature, the transaction will be broadcast.\n" + ANSI_RESET);
      printf(ANSI_YELLOW + "Current transaction sign will be closed after %ds.\n" + ANSI_RESET, TRANSACTION_SIGN_TIMEOUT);
      sleepNoInterruption(TRANSACTION_SIGN_TIMEOUT);
      shutdownHidServices();
      if (DebugConfig.isDebugEnabled()) {
        print(ANSI_RED + "Shutdown thread finished\n" + ANSI_RESET);
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
        printf(ANSI_YELLOW + "Ledger sign shutdown...%n" + ANSI_RESET);
      }
      ledgerSignEnd.compareAndSet(false, true);
      isTimeOutShutdown.compareAndSet(false,true);
    }
  }


  public boolean executeSignListen(HidDevice hidDevice, Chain.Transaction transaction, String path, boolean gasfree) {
    boolean ret = false;
    // Reset before each sign so a prior call's APDU bytes never leak into the next sign's
    // outcome computation if handleTransSign throws on this invocation.
    this.lastSendResult = null;
    try {
      byte[] sendResult = handleTransSign(hidDevice, transaction, path, gasfree);
      this.lastSendResult = sendResult;
      if (sendResult == null) {
        println("Transaction sign request is sent to Ledger");
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
        println(ANSI_RED + "Please first set 'Sign By Hash' to 'Allowed' in Ledger TRON Settings." + ANSI_RESET);
      }
      if (APP_IS_OPEN.equals(bytesToHex(response))) {
        println(ANSI_RED + "Please ensure The Tron app is open in your Ledger device. Usually, 'Application is ready' will be displayed on your ledger device." + ANSI_RESET);
      }
      if (DebugConfig.isDebugEnabled()) {
        println("HandleTransSign response: " + bytesToHex(response));
      }
    } else {
      if (DebugConfig.isDebugEnabled()) {
        println("HandleTransSign response is null");
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
      println("Received unwrappedResponse: " + CommonUtil.bytesToHex(unwrappedResponse));
    }

    if (LEDGER_SIGN_CANCEL.equalsIgnoreCase(CommonUtil.bytesToHex(unwrappedResponse))) {
      HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
      LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());

      println("\nCancel sign from Ledger");
      doLedgerSignEnd();
      hidDevice.close();
    } else {
      Chain.Transaction transaction = TransactionSignManager.getInstance().getTransaction();
      if (transaction == null) {
        if (DebugConfig.isDebugEnabled()) {
          println("Transaction is null");
        }
        HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
        LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());
        if (DebugConfig.isDebugEnabled()) {
          println("Do updateAllSigningToReject");
        }
        hidDevice.close();
        standardCliQuiet = false;
      } else {
        if (DebugConfig.isDebugEnabled()) {
          println("Transaction is not null");
        }
        String transactionId = getTransactionId(transaction).toString();
        if (!isTimeOutShutdown.get()) {
          println("\nConfirm sign from Ledger");
          byte[] signature = Arrays.copyOfRange(unwrappedResponse, 0, 65);
          if (DebugConfig.isDebugEnabled()) {
            println("Signature: " + CommonUtil.bytesToHex(signature));
          }
          TransactionSignManager.getInstance().generateGasFreeSignature(signature);
          TransactionSignManager.getInstance().addTransactionSign(signature);
          LedgerSignResult.updateState(
              TransactionSignManager.getInstance().getHidDevice().getPath()
              , transactionId, LedgerSignResult.SIGN_RESULT_SUCCESS
          );
        } else {
          println("TransactionId: " + transactionId);
          println("This transaction has expired, please resign and submit again.");
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
    standardCliQuiet = false;
  }

  private void println(String message) {
    if (!standardCliQuiet) {
      System.out.println(message);
    }
  }

  private void print(String message) {
    if (!standardCliQuiet) {
      System.out.print(message);
    }
  }

  private void printf(String format, Object... args) {
    if (!standardCliQuiet) {
      System.out.printf(format, args);
    }
  }
}
