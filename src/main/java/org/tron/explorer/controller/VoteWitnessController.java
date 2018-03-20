package org.tron.explorer.controller;

import java.util.HashMap;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;


@RestController
public class VoteWitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/voteWitness")
  public ModelAndView sendCoin() {
    return new ModelAndView("voteWitness");
  }

  @PostMapping("/createVoteWitnessToView")
  public byte[] getTransactionToView(String owner, String list) {
    String[] sourceStrArray = list.split(",");
    HashMap m = new HashMap<>();

    for (int i = 0; i + 1 < sourceStrArray.length; i += 2) {
      String address = sourceStrArray[i];
      String acount = sourceStrArray[i + 1];
      m.put(address, acount);
    }
    Transaction transaction = WalletClient
        .createVoteWitnessTransaction(ByteArray.fromHexString(owner), m);
    return transaction.toByteArray();
  }


}
