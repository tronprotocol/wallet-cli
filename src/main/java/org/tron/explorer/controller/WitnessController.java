package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

import java.util.Optional;


@RestController
public class WitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/queryWitness")
  public ModelAndView viewQueryWitness() {
    return new ModelAndView("witnessList");
  }

  @GetMapping("/createWitness")
  public ModelAndView viewCreateWitness() {
    return new ModelAndView("createWitness");
  }

  @GetMapping("/witnessList")
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

  @PostMapping("/createWitnessToView")
  public byte[] getTransactionToView(String address, String onwerUrl) {
    try {
      if (!WalletClient.addressValid(address)) {
        return null;
      }
      if (onwerUrl == null || onwerUrl.equals("")) {
        return null;
      }

      Transaction transaction = WalletClient
          .createWitnessTransaction(ByteArray.fromHexString(address), onwerUrl.getBytes());
      transaction = TransactionUtils.setTimestamp(transaction);
      return transaction.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }
}
