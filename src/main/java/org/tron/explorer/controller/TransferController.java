//package org.tron.explorer.controller;
//
//import org.apache.commons.logging.Log;
//import org.apache.commons.logging.LogFactory;
//import org.springframework.web.bind.annotation.ModelAttribute;
//import org.springframework.web.bind.annotation.RestController;
//import org.springframework.web.servlet.ModelAndView;
//import org.tron.common.utils.TransactionUtils;
//import org.tron.explorer.domain.Transfer;
//import org.tron.protos.Contract.TransferContract;
//import org.tron.protos.Protocol.Transaction;
//import org.tron.walletserver.WalletClient;
//
//
//@RestController
//public class TransferController {
//
//  protected final Log log = LogFactory.getLog(getClass());
//
////  @GetMapping("/sendCoin")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public ModelAndView sendCoin() {
//    return new ModelAndView("sendCoin");
//  }
//
//  @ModelAttribute
//  Transfer setTransfer() {
//    return new Transfer();
//  }
//
////  @PostMapping("/sendCoinToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(@ModelAttribute Transfer transfer) {
//    System.out.println(transfer.getAddress());
//    try {
//      if (transfer.getAddress() == null || transfer.getAmount() == null
//          || transfer.getToAddress() == null) {
//        return null;
//      }
//      byte[] address = WalletClient.decodeFromBase58Check(transfer.getAddress());
//      byte[] toAddress = WalletClient.decodeFromBase58Check(transfer.getToAddress());
//      if (address == null || toAddress == null) {
//        return null;
//      }
//      TransferContract contract = WalletClient
//          .createTransferContract(toAddress, address, Long.parseLong(transfer.getAmount()));
//      Transaction transaction = WalletClient.createTransaction4Transfer(contract);
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//}
