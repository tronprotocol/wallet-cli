package org.tron.ledger.listener;

import lombok.Getter;
import lombok.Setter;
import org.hid4java.HidDevice;
import org.hid4java.event.HidServicesEvent;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.utils.TransactionUtils;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerConstant;
import org.tron.ledger.sdk.LedgerProtocol;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.ledger.wrapper.HidServicesWrapper;
import org.tron.ledger.wrapper.LedgerSignResult;
import org.tron.protos.Protocol;
import org.tron.walletserver.WalletApi;

import java.util.Arrays;
import java.util.Optional;
import java.util.Scanner;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;
import static org.tron.ledger.sdk.CommonUtil.bytesToHex;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_SIGN_CANCEL;

public class LedgerEventListener extends BaseListener {
  private static final int TRANSACTION_SIGN_TIMEOUT = 30;

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
    Thread inputThread = new Thread(() -> {
      Scanner scanner = new Scanner(System.in);
      System.out.printf(ANSI_YELLOW + "Press 'c' to continue on other operation.\n" + ANSI_RESET);
      System.out.printf(ANSI_YELLOW + "If the transaction signature hasn't timed out and the Ledger confirms the signature, the transaction will still be broadcast.\n" + ANSI_RESET);
      System.out.printf(ANSI_YELLOW + "Current transaction sign will be closed after %ds.\n" + ANSI_RESET, TRANSACTION_SIGN_TIMEOUT);
      String input = scanner.nextLine();
      while (!"c".equalsIgnoreCase(input)) {
        input = scanner.nextLine();
        if ("c".equalsIgnoreCase(input)) {
          break;
        }
      }
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_RED + "Input thread finished\n" + ANSI_RESET);
      }
    });
    Thread shutdownThread = new Thread(() -> {
      sleepNoInterruption(TRANSACTION_SIGN_TIMEOUT);
      shutdownHidServices();
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_RED + "Shutdown thread finished\n" + ANSI_RESET);
      }
    });

    inputThread.start();
    shutdownThread.setDaemon(true);
    shutdownThread.start();

    try {
      inputThread.join();
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


  public boolean executeSignListen(HidDevice hidDevice, Protocol.Transaction transaction, String path) {
    boolean ret = false;
    try {
      byte[] sendResult = handleTransSign(hidDevice, transaction, path);
      if (sendResult == null) {
        System.out.println("Transaction sign request is sent to Ledger");
        TransactionSignManager.getInstance().setHidDevice(hidDevice);
        isTimeOutShutdown.compareAndSet(true,false);
        String transactionId = TransactionUtils.getTransactionId(transaction).toString();
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

  public byte[] handleTransSign(HidDevice hidDevice, Protocol.Transaction transaction, String path) {
    final int TIMEOUT_MILLIS = 1000;
    final int MAX_WAIT_TIME_MILLIS = 1000; // 1.5 seconds

    String transactionRaw = bytesToHex(transaction.getRawData().toByteArray());
    //String path = "m/44'/195'/0'/0/0";
    byte[] apdu = ApduMessageBuilder.buildTransactionSignApduMessage(path, transactionRaw);
    byte[] respone = ApduExchangeHandler.exchangeApdu(hidDevice, apdu
        ,TIMEOUT_MILLIS, MAX_WAIT_TIME_MILLIS);
    if (respone!=null) {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("HandleTransSign respone: " + bytesToHex(respone));
      }
    } else {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("HandleTransSign respone is null");
      }
    }
    return respone;
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {
    super.hidDataReceived(event);
    if (event.getHidDevice().getVendorId() != LedgerConstant.LEDGER_VENDOR) {
      return;
    }

    byte[] response = event.getDataReceived();
    byte[] unwrappedResponse = LedgerProtocol.unwrapResponseAPDU(
        LedgerConstant.CHANNEL, response, LedgerConstant.PACKET_SIZE, false);
    if (DebugConfig.isDebugEnabled()) {
      System.out.println("Received unwrappedResponse: " + CommonUtil.bytesToHex(unwrappedResponse));
    }

    if (LEDGER_SIGN_CANCEL.equalsIgnoreCase(CommonUtil.bytesToHex(unwrappedResponse))) {
      HidDevice hidDevice = HidServicesWrapper.getInstance().getHidDevice();
      LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());

      System.out.println("\nCancel sign from Ledger");
      doLedgerSignEnd();
      hidDevice.close();
    } else {
      Protocol.Transaction transaction = TransactionSignManager.getInstance().getTransaction();
      if (transaction == null) {
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Transaction is null");
        }
        HidDevice hidDevice = HidServicesWrapper.getInstance().getHidDevice();
        LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Do updateAllSigningToReject");
        }
        hidDevice.close();
      } else {
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("Transaction is not null");
        }
        String transactionId = TransactionUtils.getTransactionId(transaction).toString();
        if (!isTimeOutShutdown.get()) {
          System.out.println("\nConfirm sign from ledger");
          byte[] signature = Arrays.copyOfRange(unwrappedResponse, 0, 65);
          if (DebugConfig.isDebugEnabled()) {
            System.out.println("Signature: " + CommonUtil.bytesToHex(signature));
          }
          TransactionSignManager.getInstance().addTransactionSign(signature);
          boolean ret = WalletApi.broadcastTransaction(TransactionSignManager.getInstance().getTransaction());
          if (ret) {
            System.out.println("TransactionId: " + transactionId);
            System.out.println("BroadcastTransaction successful !!!");
          } else {
            System.out.println("BroadcastTransaction failed !!!");
          }
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
    TransactionSignManager.getInstance().setTransaction(null);
    if (TransactionSignManager.getInstance().getHidDevice() != null) {
      TransactionSignManager.getInstance().getHidDevice().close();
      TransactionSignManager.getInstance().setHidDevice(null);
    }
  }

}
