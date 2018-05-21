package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.walletserver.WalletClient;

import java.util.Optional;


@RestController
public class WitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/queryWitness")
  /**
   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
   */
  public ModelAndView viewQueryWitness() {
    return new ModelAndView("witnessList");
  }

  @GetMapping("/createWitness")
  /**
   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
   */
  public ModelAndView viewCreateWitness() {
    return new ModelAndView("createWitness");
  }

  @GetMapping("/witnessList")
  /**
   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
   */
  public byte[] getWitnessList() {
    try {
      Optional<WitnessList> result = WalletClient.listWitnesses();
      if (result.isPresent()) {
        WitnessList witnessList = result.get();
        return witnessList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }
//
// // @PostMapping("/createWitnessToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(String address, String onwerUrl) {
//    try {
//      if (onwerUrl == null || onwerUrl.equals("")) {
//        return null;
//      }
//      byte[] owner = WalletClient.decodeFromBase58Check(address);
//      if (owner == null) {
//        return null;
//      }
//      Transaction transaction = WalletClient.createWitnessTransaction(owner, onwerUrl.getBytes());
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
}
