package org.tron.ledger;

import org.hid4java.HidDevice;
import org.tron.ledger.listener.LedgerEventListener;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.ContractTypeChecker;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.ledger.wrapper.HidServicesWrapper;
import org.tron.ledger.wrapper.LedgerSignResult;
import org.tron.ledger.wrapper.LedgerUserHelper;
import org.tron.ledger.wrapper.TransOwnerChecker;
import org.tron.protos.Protocol;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

public class LedgerSignUtil {

  public static boolean requestLedgerSignLogic(Protocol.Transaction transaction, String path, byte[] address) {
    try {
      if (!ContractTypeChecker.canUseLedgerSign(
          transaction.getRawData().getContract(0).getType().toString())) {
        return true;
      }
      if (!TransOwnerChecker.checkOwner(address, transaction)) {
        return true;
      }

      if (TransactionSignManager.getInstance().getTransaction() == null) {
        HidDevice hidDevice = null;
        // try to reuse the hiddevice
        if (TransactionSignManager.getInstance().getHidDevice() != null) {
          hidDevice = TransactionSignManager.getInstance().getHidDevice();
          if (DebugConfig.isDebugEnabled()) {
            System.out.println("Reuse TransactionSignManager.getInstance().getHidDevice() hiddevice");
          }
        } else {
          try {
            hidDevice = HidServicesWrapper.getInstance().getHidDevice();
          } catch (IllegalStateException e) {
            if (DebugConfig.isDebugEnabled()) {
              e.printStackTrace();
            }
            hidDevice = null;
          }
          if (hidDevice == null) {
            LedgerUserHelper.showHidDeviceConnectionError();
            System.out.println("Please check your Ledger and try again");
            System.out.println("Sign with Ledger failed");
            return true;
          }
          if (DebugConfig.isDebugEnabled()) {
            System.out.println("reopen HidServicesWrapper.getInstance().getHidDevice");
          }
        }

        // judge last transaction sign is signing
        Optional<String> state = LedgerSignResult.getLastTransactionState(hidDevice.getPath());
        if (state.isPresent() && LedgerSignResult.SIGN_RESULT_SIGNING.equals(state.get())) {
          System.out.println("Last transaction is signing");
          System.out.println(ANSI_RED
              + "Please confirm/cancel the transaction in Ledger, or Quit&Reopen Tron app in Ledger" +
              ANSI_RESET);
          System.out.println("Transaction sign is rejected");
          return true;
        }

        LedgerEventListener.getInstance().setLedgerSignEnd(new AtomicBoolean(false));
        TransactionSignManager.getInstance().setTransaction(transaction);
        boolean ret = false;
        try {
          if (hidDevice.isClosed()) {
            hidDevice.open();
          }
          ret = LedgerEventListener.getInstance().executeSignListen(hidDevice, transaction, path);
        } catch (IllegalStateException e) {
          if (DebugConfig.isDebugEnabled()) {
            e.printStackTrace();
          }
          ret = false;
        }
        if (ret) {
          return true;
        } else {
          LedgerEventListener.getInstance().setLedgerSignEnd(new AtomicBoolean(true));
          TransactionSignManager.getInstance().setTransaction(null);
          LedgerUserHelper.showHidDeviceConnectionError();
          if (hidDevice != null) {
            hidDevice.close();
          }
          System.out.println("Sign with Ledger failed");
          System.out.println("Please check your Ledger and try again");
          return true;
        }
      } else {
        System.out.println("Please check your last sign with Ledger");
        System.out.println(ANSI_RED
            + "Please confirm/cancel the transaction in Ledger, or Quit&Reopen Tron app in Ledger" +
            ANSI_RESET);
        System.out.println("Sign with Ledger rejected");
        return true;
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return true;
    }
  }
}
