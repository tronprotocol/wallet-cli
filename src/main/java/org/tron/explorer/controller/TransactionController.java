package org.tron.explorer.controller;

import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.TransactionList;
import org.tron.walletserver.WalletClient;

@RestController
public class TransactionController {

  @GetMapping("/getTotalTransaction")
  public byte[] getTotalTransaction() {
    return WalletClient.getTotalTransaction().toByteArray();
  }

  @GetMapping("/getTransactionsFromThis")
  public byte[] getTransactionsFromThis(String address) {
    try {
      byte[] owner = WalletClient.decodeFromBase58Check(address);
      if (owner == null) {
        return null;
      }

      Optional<TransactionList> result = WalletClient.getTransactionsFromThis(owner);
      if (result.isPresent()) {
        TransactionList transactionList = result.get();
        return transactionList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  @GetMapping("/getTransactionsToThis")
  public byte[] getTransactionsToThis(String address) {
    try {
      byte[] owner = WalletClient.decodeFromBase58Check(address);
      if (owner == null) {
        return null;
      }

      Optional<TransactionList> result = WalletClient.getTransactionsToThis(owner);
      if (result.isPresent()) {
        TransactionList transactionList = result.get();
        return transactionList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }
}
