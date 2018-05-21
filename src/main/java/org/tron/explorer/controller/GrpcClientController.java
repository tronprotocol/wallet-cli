//package org.tron.explorer.controller;
//
//import com.google.protobuf.InvalidProtocolBufferException;
//import org.apache.commons.logging.Log;
//import org.apache.commons.logging.LogFactory;
//import org.springframework.web.bind.annotation.GetMapping;
//import org.springframework.web.bind.annotation.ModelAttribute;
//import org.springframework.web.bind.annotation.RestController;
//import org.springframework.web.servlet.ModelAndView;
//import org.tron.common.utils.ByteArray;
//import org.tron.common.utils.TransactionUtils;
//import org.tron.explorer.domain.AccountVo;
//import org.tron.protos.Protocol.Transaction;
//import org.tron.walletcli.Test;
//import org.tron.walletserver.WalletClient;
//
//
//@RestController
//public class GrpcClientController {
//
//  protected final Log log = LogFactory.getLog(getClass());
//
//
//  @ModelAttribute
//  AccountVo setAccountVo() {
//    return new AccountVo();
//  }
//
//
//  @GetMapping("/")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public ModelAndView viewIndex() {
//    return new ModelAndView("index");
//  }
//
////  @GetMapping("/getTransaction")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransaction() {
//    Transaction transaction = Test.createTransactionAccount();
//    transaction = TransactionUtils.setTimestamp(transaction);
//    return transaction.toByteArray();
//  }
//
//  //get account transaction from view
// // @PostMapping("/transactionFromView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public boolean transactionFromView(String transactionData) throws InvalidProtocolBufferException {
//    if (transactionData == null || transactionData.equals("")) {
//      return false;
//    }
//    final byte[] bytes = ByteArray.fromHexString(transactionData);
//    return WalletClient.broadcastTransaction(bytes);
//  }
//}
