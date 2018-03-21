package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.*;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.VoteWitness;
import org.tron.explorer.domain.Witness;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

import java.util.HashMap;
import java.util.List;
import java.util.Optional;


@RestController
public class VoteWitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @ModelAttribute
  VoteWitness setVoteWitness() {
    return new VoteWitness();
  }

 @GetMapping("/voteWitnessList")
  public byte[] getVoteWitnessList() {
    Optional<WitnessList> result = WalletClient.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      return witnessList.toByteArray();
    } else {
      return null;
    }
  }



  @PostMapping("/createVoteWitnessToView")
  public byte[] getTransactionToView(@RequestBody VoteWitness voteWitness) {
    try {
      if (voteWitness.getOwnerAddress() == null || voteWitness.getList() == null) {
        return null;
      }
      if (!WalletClient.addressValid(voteWitness.getOwnerAddress())) {
        return null;
      }
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
      transaction = TransactionUtils.setTimestamp(transaction);

      return transaction.toByteArray();

    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }

}
