package org.tron.explorer.controller;

import java.io.IOException;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.List;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.TransactionUtils;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletClient;


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
      Decoder decoder = Base64.getDecoder();
      byte[] owner = decoder.decode(address.getBytes());
      Transaction transaction = WalletClient.createWitnessTransaction(owner, onwerUrl.getBytes());
      transaction = TransactionUtils.setTimestamp(transaction);
      return transaction.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }


}
