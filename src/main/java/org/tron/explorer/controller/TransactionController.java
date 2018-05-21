//package org.tron.explorer.controller;
//
//import org.springframework.web.bind.annotation.RestController;
//import org.tron.api.GrpcAPI.TransactionList;
//import org.tron.walletserver.WalletClient;
//
//import java.util.Optional;
//
//@RestController
//public class TransactionController {
//
// // @GetMapping("/getTotalTransaction")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTotalTransaction() {
//    return WalletClient.getTotalTransaction().toByteArray();
//  }
//
// // @GetMapping("/getTransactionsFromThis")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionsFromThis(String address) {
//    try {
//      byte[] owner = WalletClient.decodeFromBase58Check(address);
//      if (owner == null) {
//        return null;
//      }
//
//      Optional<TransactionList> result = WalletClient.getTransactionsFromThis(owner);
//      if (result.isPresent()) {
//        TransactionList transactionList = result.get();
//        return transactionList.toByteArray();
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
//    return null;
//  }
//
////  @GetMapping("/getTransactionsToThis")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionsToThis(String address) {
//    try {
//      byte[] owner = WalletClient.decodeFromBase58Check(address);
//      if (owner == null) {
//        return null;
//      }
//
//      Optional<TransactionList> result = WalletClient.getTransactionsToThis(owner);
//      if (result.isPresent()) {
//        TransactionList transactionList = result.get();
//        return transactionList.toByteArray();
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
//    return null;
//  }
//}
