package org.tron.ledger.wrapper;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

public class ContractTypeChecker {
  private static final Set<String> SUPPORTED_CONTRACT_TYPE_SET = new HashSet<>(Arrays.asList(
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
      "TransferAssetContract"
  ));


  public static boolean canUseLedgerSign(String contractType) {
    if (contractType == null || contractType.isEmpty()) {
      return false;
    }

    boolean isSupported =  SUPPORTED_CONTRACT_TYPE_SET.contains(contractType);
    if (!isSupported) {
      System.out.println(ANSI_RED +
          "Transaction type is not supported Ledger sign, Please check your transaction type!!" +
          ANSI_RESET);
    }
    return isSupported;
  }

}
