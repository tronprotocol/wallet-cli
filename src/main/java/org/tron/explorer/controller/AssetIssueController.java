package org.tron.explorer.controller;

import com.google.protobuf.ByteString;
import java.io.IOException;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.List;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.AssetIssueVo;
import org.tron.explorer.domain.TransferAsset;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletClient;


@RestController
public class AssetIssueController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/createAssetIssue")
  public ModelAndView viewCreateWitness() {
    return new ModelAndView("createAssetIssue");
  }


  @PostMapping("/createAssetIssueToView")
  public byte[] getTransactionToView(@ModelAttribute AssetIssueVo assetIssueVo) {
    Decoder decoder = Base64.getDecoder();

    Contract.AssetIssueContract.Builder builder = Contract.AssetIssueContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(decoder.decode(assetIssueVo.getOwnerAddress())));
    builder.setName(ByteString.copyFrom(assetIssueVo.getName().getBytes()));
    builder.setTotalSupply(assetIssueVo.getTotalSupply());
    builder.setTrxNum(assetIssueVo.getTrxNum());
    builder.setNum(assetIssueVo.getNum());
    builder.setStartTime(assetIssueVo.getStartTime());
    builder.setEndTime(assetIssueVo.getEndTime());
    builder.setDecayRatio(assetIssueVo.getDecayRatio());
    builder.setVoteScore(assetIssueVo.getVoteScore());
    builder.setDescription(ByteString.copyFrom(assetIssueVo.getDescription().getBytes()));
    builder.setUrl(ByteString.copyFrom(assetIssueVo.getUrl().getBytes()));

    Contract.AssetIssueContract contract = builder.build();
    Transaction transaction = WalletClient.createAssetIssueTransaction(contract);
    transaction = TransactionUtils.setTimestamp(transaction);
    return transaction.toByteArray();
  }

  @GetMapping("/getAssetIssueList")
  public byte[] getAssetIssueList()
      throws IOException {
    Optional<AssetIssueList> result = WalletClient.getAssetIssueList();
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      return assetIssueList.toByteArray();
    } else {
      return null;
    }
  }

  @PostMapping("/TransferAssetToView")
  public byte[] getTransactionToView(@ModelAttribute TransferAsset transferAsset) {
    Transaction transaction = WalletClient
        .createTransferAssetTransaction(ByteArray.fromHexString(transferAsset.getToAddress()),
            ByteArray.fromHexString(transferAsset.getAssetName()),
            ByteArray.fromHexString(transferAsset.getAddress()),
            Long.parseLong(transferAsset.getAmount()));
    transaction = TransactionUtils.setTimestamp(transaction);
    return transaction.toByteArray();
  }



}
