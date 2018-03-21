package org.tron.explorer.controller;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.domain.AccountVo;
import org.tron.explorer.domain.VoteWitness;
import org.tron.explorer.domain.Witness;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;


@RestController
public class VoteWitnessController {

  protected final Log log = LogFactory.getLog(getClass());

 // @GetMapping("/voteWitnessList")
  @RequestMapping(value = "/voteWitnessList",produces = "application/x-protobuf", method =
      { RequestMethod.GET })
  public byte[] getVoteWitnessList()
      throws IOException {
    Optional<WitnessList> result = WalletClient.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      return witnessList.toByteArray();
    } else {
      return null;
    }
  }


  @RequestMapping(value = "/voteWitnessListForTest", method =
      { RequestMethod.GET })
  public WitnessList getVoteWitnessListForTest()
      throws IOException {
    Optional<WitnessList> result = WalletClient.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      return witnessList;
    } else {
      return null;
    }
  }

  @ModelAttribute
  VoteWitness setVoteWitness() {
    return new VoteWitness();
  }

  @PostMapping("/createVoteWitnessToView")
  public byte[] getTransactionToView(@ModelAttribute  VoteWitness voteWitness) {
    List<Witness> list = voteWitness.getList();
    String ownerAddress = voteWitness.getOwnerAddress();
    HashMap m = new HashMap<>();

    for (int i = 0; i <= list.size(); i++) {
      String address = list.get(i).getAddress();
      String acount = list.get(i).getAmount();
      m.put(address, acount);
    }

    Transaction transaction = WalletClient
        .createVoteWitnessTransaction(ByteArray.fromHexString(ownerAddress), m);
    return transaction.toByteArray();
  }

}
