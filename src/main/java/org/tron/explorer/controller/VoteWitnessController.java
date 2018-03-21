package org.tron.explorer.controller;

import java.io.IOException;
import java.util.HashMap;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;


@RestController
public class VoteWitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/voteWitnessList")
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


  @PostMapping("/createVoteWitnessToView")
  public byte[] getTransactionToView(String ownerAddress, String witnessList) {
    String[] sourceStrArray = witnessList.split(",");
    HashMap m = new HashMap<>();

    for (int i = 0; i + 1 < sourceStrArray.length; i += 2) {
      String address = sourceStrArray[i];
      String acount = sourceStrArray[i + 1];
      m.put(address, acount);
    }
    Transaction transaction = WalletClient
        .createVoteWitnessTransaction(ByteArray.fromHexString(ownerAddress), m);
    return transaction.toByteArray();
  }


}
