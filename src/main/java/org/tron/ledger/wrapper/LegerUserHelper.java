package org.tron.ledger.wrapper;

import org.hid4java.HidDevice;
import org.tron.ledger.console.ConsoleColor;
import org.tron.walletcli.WalletApiWrapper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.tron.ledger.console.ConsoleColor.ANSI_BLUE;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;

public class LegerUserHelper {

  private static final String[] LEDGER_FORBIT_OP_ARR = {
      "addtransactionsign",
      "backupshieldedtrc20wallet",
      "backupwallet",
      "backupwallet2base64",
      "exportwalletmnemonic",
  };

  // if Ledger user login, and do this ops, need check Ledger Connection first
  private static final String[] LEDGER_CMD_CHECK_CONNECTION = {
      "createproposal",
      "approveproposal",
      "deleteproposal",
      "delegateresource",
      "undelegateresource",
      "freezebalance",
      "freezebalancev2",
      "unfreezebalance",
      "unfreezebalancev2",
      "sendcoin",
      "updateaccount",
      "updateaccountpermission",
      "votewitness",
      "withdrawbalance",
      "withdrawexpireunfreeze",
      "triggercontract",
      "triggerconstantcontract",
      "deployconstantcontract",
      "exchangecreate",
      "exchangeinject",
      "exchangewithdraw",
      "exchangetransaction",
      "transferasset",
  };

  private static final Set<String> LEDGER_FORBIT_OP_SET = new HashSet<>(Arrays.asList(LEDGER_FORBIT_OP_ARR));

  public static boolean ledgerUserForbit(WalletApiWrapper walletApiWrapper, String cmdLowerCase) {
    boolean forbit = false;
    if (walletApiWrapper.isLoginState() && walletApiWrapper.getLedgerUser()) {
      forbit = LEDGER_FORBIT_OP_SET.contains(cmdLowerCase);
    }

    if (forbit) {
      System.out.println("Ledger user can't use this command");
      return true;
    }

    return false;
  }

  public static void showHidDeviceConnectionError() {
    System.out.println(ANSI_RED + "Please ensure the following steps are OK:" + ANSI_RESET);
    System.out.println(ANSI_YELLOW + "\t1.The Ledger device is connected to your computer.");
    System.out.println("\t2.The Ledger device is unlocked (PIN code entered).");
    System.out.println("\t3.The Tron app is installed in your Ledger device.");
    System.out.println("\t4.The Tron app is open in your Ledger device.");
    System.out.println("\tIf it still doesn't work after above steps are OK, please Quit&Reopen Tron app in Ledger to ensure the connection is OK." + ANSI_RESET);
  }

  // return true, check ok , false, check failed
  public static boolean checkLedgerConnection(WalletApiWrapper walletApiWrapper, String cmdLowerCase) {
    boolean result = true;
    // when Ledger user login, init connection with Ledger device
    if (walletApiWrapper.isLoginState() && walletApiWrapper.getLedgerUser()) {
      if (Arrays.asList(LEDGER_CMD_CHECK_CONNECTION).contains(cmdLowerCase)) {
        HidDevice hidDevice = null;
        try {
          hidDevice = HidServicesWrapper.getInstance().getHidDevice();
        } catch (IllegalStateException e) {
          if (DebugConfig.isDebugEnabled()) {
            e.printStackTrace();
          }
          result = false;
        }
        if (hidDevice == null) {
          result = false;
          LegerUserHelper.showHidDeviceConnectionError();
        }
      }
    }
    return result;
  }

}
