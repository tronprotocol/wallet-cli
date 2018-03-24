package org.tron.explorer.controller;

import org.apache.catalina.servlet4preview.http.HttpServletRequest;
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

  @RequestMapping("/addUser2")
  public String addUser2(HttpServletRequest request) {
    System.out.println("request" + request.getParameter("sss"));
    return "";
  }

  @PostMapping("/createVoteWitnessToView")
  public byte[] getTransactionToView(@RequestBody VoteWitness voteWitness) {
      
      System.out.println("voteWitness=" + voteWitness.getOwnerAddress());
    try {
      if (voteWitness.getOwnerAddress() == null || voteWitness.getWitnessList() == null) {
        return null;
      }
      if (!WalletClient.addressValid(voteWitness.getOwnerAddress())) {
        return null;
      }
      List<Witness> list = voteWitness.getWitnessList();
      String ownerAddress = voteWitness.getOwnerAddress();
      HashMap voteMap = new HashMap<>();

      for (int i = 0; i <= list.size(); i++) {
        String addressHex = list.get(i).getAddress();
        String count = list.get(i).getAmount();
        voteMap.put(addressHex, count);
      }

      Transaction transaction = WalletClient
          .createVoteWitnessTransaction(ByteArray.fromHexString(ownerAddress), voteMap);
      transaction = TransactionUtils.setTimestamp(transaction);

      return transaction.toByteArray();

    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }
}
