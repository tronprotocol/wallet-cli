package org.tron.ledger.wrapper;

import org.tron.common.utils.TransactionUtils;
import org.tron.protos.Protocol;
import org.tron.walletserver.WalletApi;

import java.util.Arrays;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

public class TransOwnerChecker {

  public static boolean checkOwner(byte[] loginAddress, Protocol.Transaction transaction) {

    byte[] transOwner = TransactionUtils.getOwner(transaction.getRawData().getContract(0));
    String transOwerAddress = WalletApi.encode58Check(transOwner);

    boolean ret =  Arrays.equals(loginAddress, transOwner);
    if (!ret) {
      System.out.println(ANSI_RED +
          "Transaction can only be signed by the owner_address:" + transOwerAddress +
          ANSI_RESET);
    }

    return ret;
  }

}
