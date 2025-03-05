package org.tron.ledger.wrapper;

import org.tron.ledger.console.ConsoleColor;
import org.tron.walletcli.WalletApiWrapper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class LegerUserHelper {

  private static final String[] LEDGER_FORBIT_OP_ARR = {
      "addtransactionsign",
      "backupshieldedtrc20wallet",
      "backupwallet",
      "backupwallet2base64",
      "exportwalletmnemonic",
  };

  private static final Set<String> LEDGER_FORBIT_OP_SET = new HashSet<>(Arrays.asList(LEDGER_FORBIT_OP_ARR));

  public static boolean ledgerUserForbit(WalletApiWrapper walletApiWrapper, String cmdLowerCase) {
    boolean forbit = false;
    if (walletApiWrapper.isLoginState() && walletApiWrapper.getLedgerUser()) {
      forbit = LEDGER_FORBIT_OP_SET.contains(cmdLowerCase);
    }

    if (forbit) {
      System.out.println("ledger user can't use this command");
      return true;
    }

    return false;
  }


  public static void showHidDeviceConnectionError() {
    System.out.println(ConsoleColor.ANSI_RED + "Please ensure the following 4 steps are OK:" + ConsoleColor.ANSI_RESET);
    System.out.println(ConsoleColor.ANSI_YELLOW + "\t1.The Ledger device is connected to your computer.");
    System.out.println("\t2.The Ledger device is unlocked (PIN code entered).");
    System.out.println("\t3.The Tron app is installed on your Ledger device.");
    System.out.println("\t4.The Tron app is open on your Ledger device." + ConsoleColor.ANSI_RESET);
  }

  public static void main(String[] args) {
    //showHidDeviceConnectionError();
  }

}
