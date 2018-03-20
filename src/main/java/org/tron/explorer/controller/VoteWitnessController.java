package org.tron.explorer.controller;

import java.util.List;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletClient;


@RestController
public class VoteWitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/voteWitness")
  public ModelAndView sendCoin() {
    return new ModelAndView("voteWitness");
  }

  @PostMapping("/createVoteWitnessToView")
  public List<Witness> getTransactionToView(String owner, String list) {
    List<Witness> witnessesList = WalletClient.listWitnesses().get().getWitnessesList();
    return witnessesList;

  }


}
