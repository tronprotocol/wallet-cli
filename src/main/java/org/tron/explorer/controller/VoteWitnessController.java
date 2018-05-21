//package org.tron.explorer.controller;
//
//import org.apache.commons.logging.Log;
//import org.apache.commons.logging.LogFactory;
//import org.springframework.web.bind.annotation.RequestBody;
//import org.springframework.web.bind.annotation.RestController;
//import org.tron.api.GrpcAPI.WitnessList;
//import org.tron.common.utils.TransactionUtils;
//import org.tron.explorer.domain.VoteWitness;
//import org.tron.explorer.domain.Witness;
//import org.tron.protos.Protocol;
//import org.tron.walletserver.WalletClient;
//
//import java.util.HashMap;
//import java.util.List;
//import java.util.Optional;
//
//
//@RestController
//public class VoteWitnessController {
//
//  protected final Log log = LogFactory.getLog(getClass());
//
////  @GetMapping("/voteWitnessList")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getVoteWitnessList() {
//    Optional<WitnessList> result = WalletClient.listWitnesses();
//    if (result.isPresent()) {
//      WitnessList witnessList = result.get();
//      return witnessList.toByteArray();
//    } else {
//      return null;
//    }
//  }
//
// // @PostMapping("/createVoteWitnessToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(@RequestBody VoteWitness voteWitness) {
//    try {
//      if (voteWitness.getOwner() == null || voteWitness.getList() == null) {
//        return null;
//      }
//      byte[] owner = WalletClient.decodeFromBase58Check(voteWitness.getOwner());
//      if (owner == null) {
//        return null;
//      }
//      List<Witness> list = voteWitness.getList();
//      HashMap voteMap = new HashMap<>();
//
//      for (int i = 0; i < list.size(); i++) {
//        String addressBase58 = list.get(i).getAddress();
//        String count = list.get(i).getAmount();
//        voteMap.put(addressBase58, count);
//      }
//      Protocol.Transaction transaction = WalletClient.createVoteWitnessTransaction(owner, voteMap);
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//}