package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.VoteWitness;
import org.tron.explorer.domain.Witness;
import org.tron.protos.Protocol;
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

    @PostMapping("/createVoteWitnessToView")
    public byte[] getTransactionToView(@RequestBody VoteWitness voteWitness) {
        try {
            if (voteWitness.getOwner() == null || voteWitness.getList() == null) {
                return null;
            }
            if (!WalletClient.addressValid(voteWitness.getOwner())) {
                return null;
            }
            List<Witness> list = voteWitness.getList();
            String ownerAddress = voteWitness.getOwner();
            HashMap voteMap = new HashMap<>();

            for (int i = 0; i < list.size(); i++) {
                String addressHex = list.get(i).getAddress();
                String count = list.get(i).getAmount();
                voteMap.put(addressHex, count);
            }
            Protocol.Transaction transaction = WalletClient
                    .createVoteWitnessTransaction(ByteArray.fromHexString(ownerAddress), voteMap);
            transaction = TransactionUtils.setTimestamp(transaction);
            return transaction.toByteArray();
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
}