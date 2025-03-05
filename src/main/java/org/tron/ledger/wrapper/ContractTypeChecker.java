package org.tron.ledger.wrapper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

public class ContractTypeChecker {
  private static final String[] CONTRACT_TYPES = {
      "ProposalCreateContract",
      "ProposalApproveContract",
      "ProposalDeleteContract",
      "DelegateResourceContract",
      "UnDelegateResourceContract",
      "FreezeBalanceContract",
      "FreezeBalanceV2Contract",
      "UnfreezeBalanceContract",
      "UnfreezeBalanceV2Contract",
      "TransferContract",
      "AccountUpdateContract",
      "AccountPermissionUpdateContract",
      "VoteWitnessContract",
      "WithdrawBalanceContract",
      "WithdrawExpireUnfreezeContract",
      "TriggerSmartContract",
      "ExchangeCreateContract",
      "ExchangeInjectContract",
      "ExchangeWithdrawContract",
      "ExchangeTransactionContract",
      "TransferAssetContract",
  };

  private static final Set<String> CONTRACT_TYPE_SET = new HashSet<>(Arrays.asList(CONTRACT_TYPES));

  public static boolean canUseLedgerSign(String contractType) {
    boolean ret =  CONTRACT_TYPE_SET.contains(contractType);
    if (!ret) {
      System.out.println(ANSI_RED +
          "Transaction type is not supported ledger sign, Please check your transaction type!!" +
          ANSI_RESET);
    }
    return ret;
  }

}
