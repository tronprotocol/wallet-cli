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
import org.tron.ledger.sdk.LedgerProtocol;
import org.tron.ledger.wrapper.DebugConfig;
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
  private static final int TRANSACTION_SIGN_TIMEOUT = 120;

  @Getter
  private AtomicBoolean isShutdown = new AtomicBoolean(false);
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
      System.out.printf(ANSI_YELLOW + "Press 'c' to cancel sign and continue on other operation.\n" + ANSI_RESET);
      System.out.printf(ANSI_YELLOW + "如果交易签名没超时且ledger确认签名，这个交易还是会广播\n" + ANSI_RESET);
      System.out.printf(ANSI_YELLOW + "current transaction sign will be closed after %ds.\n" + ANSI_RESET, TRANSACTION_SIGN_TIMEOUT);
      String input = scanner.nextLine();
      while (!"c".equalsIgnoreCase(input)) {
        input = scanner.nextLine();
        if ("c".equalsIgnoreCase(input)) {
          break;
        }
      }
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_RED + "input thread finished\n" + ANSI_RESET);
      }
    });
    Thread shutdownThread = new Thread(() -> {
      sleepNoInterruption(TRANSACTION_SIGN_TIMEOUT);
      shutdownHidServices();
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_RED + "shutdown thread finished\n" + ANSI_RESET);
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
    if (!isShutdown.get()) {
      if (DebugConfig.isDebugEnabled()) {
        System.out.printf(ANSI_YELLOW + "ledger sign shutdown...%n" + ANSI_RESET);
      }
      doLedgerSignEnd();
      isShutdown.set(true);
    }
  }


  public boolean executeSignListen(HidDevice hidDevice, Protocol.Transaction transaction) {
    boolean ret = false;
    try {
      byte[] sendResult = handleTransSign(hidDevice, transaction);
      if (sendResult == null) {
        System.out.println("transaction sign request is sent to ledger");
        TransactionSignManager.getInstance().setHidDevice(hidDevice);
        if (this.isShutdown.get()) {
          this.isShutdown.set(false);
        }
      }
      ret = waitAndShutdownWithInput();
    } catch (Exception e) {
      e.printStackTrace();
    }

    return ret;
  }

  public byte[] handleTransSign(HidDevice hidDevice, Protocol.Transaction transaction) {
    final int TIMEOUT_MILLIS = 1000;
    final int MAX_WAIT_TIME_MILLIS = 1000; // 1.5 seconds

    String transactionRaw = bytesToHex(transaction.getRawData().toByteArray());
    String path = "m/44'/195'/0'/0/0";
    byte[] apdu = ApduMessageBuilder.buildTransactionSignApduMessage(path, transactionRaw);
    byte[] respone = ApduExchangeHandler.exchangeApdu(hidDevice, apdu
        ,TIMEOUT_MILLIS, MAX_WAIT_TIME_MILLIS);
    if (respone!=null) {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("handleTransSign respone: " + bytesToHex(respone));
      }
    } else {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("handleTransSign respone is null");
      }
    }
    return respone;
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {
    super.hidDataReceived(event);
    final int CHANNEL = 0x0101;
    final int PACKET_SIZE = 64;
    byte[] response = event.getDataReceived();
    byte[] unwrappedResponse = LedgerProtocol.unwrapResponseAPDU(
        CHANNEL, response, PACKET_SIZE, false);
    if (DebugConfig.isDebugEnabled()) {
      System.out.println("received unwrappedResponse: " + CommonUtil.bytesToHex(unwrappedResponse));
    }

    if (LEDGER_SIGN_CANCEL.equalsIgnoreCase(CommonUtil.bytesToHex(unwrappedResponse))) {
      HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
      LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());

      if (!isShutdown.get()) {
        System.out.println("cancel sign from ledger");
        doLedgerSignEnd();
      }
    } else {
      HidDevice hidDevice = TransactionSignManager.getInstance().getHidDevice();
      Optional<String> state = LedgerSignResult.getLastTransactionState(hidDevice.getPath());
      if (state.isPresent() && LedgerSignResult.SIGN_RESULT_SIGNING.equals(state.get())) {
        System.out.println("last transaction is signing");
        System.out.println("transaction sign is rejected");
        LedgerSignResult.updateAllSigningToReject(hidDevice.getPath());
        doLedgerSignEnd();
        return;
      }

      if (!isShutdown.get()) {
        System.out.println("confirm sign from ledger");
        byte[] signature = Arrays.copyOfRange(unwrappedResponse, 0, 65);
        TransactionSignManager.getInstance().addTransactionSign(signature);
        Protocol.Transaction transaction = TransactionSignManager.getInstance().getTransaction();
        boolean ret = WalletApi.broadcastTransaction(transaction);
        if (ret) {
          String transactionId = TransactionUtils.getTransactionId(transaction).toString();
          System.out.println("TransactionId: " + transactionId);
          System.out.println("BroadcastTransaction successful !!!");

          hidDevice = TransactionSignManager.getInstance().getHidDevice();
          LedgerSignResult.updateState(
              hidDevice.getPath(), transactionId, LedgerSignResult.SIGN_RESULT_SUCCESS
          );
        } else {
          System.out.println("BroadcastTransaction failed !!!");
        }
      }
      doLedgerSignEnd();
    }
  }


  private void doLedgerSignEnd() {
    ledgerSignEnd.set(true);
    TransactionSignManager.getInstance().setTransaction(null);
    if (TransactionSignManager.getInstance().getHidDevice() != null) {
      TransactionSignManager.getInstance().getHidDevice().close();
      TransactionSignManager.getInstance().setHidDevice(null);
    }
  }


  public byte[] generateContractAddress(byte[] ownerAddress, Protocol.Transaction trx) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }


  public static void main(String[] args) {
    /*
    try {
      String s = "0a6a5a68080112640a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412330a15410547286e6b520b6e77df7a6b1c4d2184d04866d3121541ccf2f3d3d97bb7dc6d89353bd2b5a956eda5c4ad18c090b82a";
      byte[] data = hexStringToByteArray(s);
      Protocol.Transaction transaction = Protocol.Transaction.parseFrom(data);

      LedgerEventListener listener = new LedgerEventListener();
      listener.executeSignListen(transaction);

    System.out.println("other input wait");
    LineReader lineReader = LineReaderBuilder.builder()
        .option(LineReader.Option.CASE_INSENSITIVE, true)
        .build();
    while (true) {
      String cmdLine = lineReader.readLine().trim();
      System.out.println(cmdLine);
      if (cmdLine.equalsIgnoreCase("q")) {
        break;
      }
    }
    } catch (Exception e) {
      e.printStackTrace();
    }
     */
  }

}
