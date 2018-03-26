package org.tron.explorer.controller;

import com.google.protobuf.ByteString;
import java.io.IOException;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.AssetIssueVo;
import org.tron.explorer.domain.ParticipateAssetIssueVo;
import org.tron.explorer.domain.TransferAsset;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;


@RestController
public class AssetIssueController {

  protected final Log log = LogFactory.getLog(getClass());

  @ModelAttribute
  AssetIssueVo setAssetIssueVo() {
    return new AssetIssueVo();
  }

  @ModelAttribute
  TransferAsset setTransferAsset() {
    return new TransferAsset();
  }

  @ModelAttribute
  ParticipateAssetIssueVo setParticipateAssetIssueVo() {
    return new ParticipateAssetIssueVo();
  }


  @GetMapping("/createAssetIssue")
  public ModelAndView viewCreateWitness() {
    return new ModelAndView("createAssetIssue");
  }


  @PostMapping("/createAssetIssueToView")
  public byte[] getTransactionToView(@ModelAttribute AssetIssueVo assetIssueVo) {
    try {
      if (assetIssueVo == null) {
        return null;
      }
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
    } catch (Exception e) {
      System.out.printf("error=====" + e.getMessage());
      e.printStackTrace();
      return null;
    }
  }

  @GetMapping("/getAssetIssueList")
  public byte[] getAssetIssueList() throws IOException {
    try {
      Optional<AssetIssueList> result = WalletClient.getAssetIssueList();
      if (result.isPresent()) {
        AssetIssueList assetIssueList = result.get();
        return assetIssueList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  @GetMapping("/getAssetIssueByAccount")
  public byte[] getAssetIssueByAccount(String address) throws IOException {
    try {
      if (!WalletClient.addressValid(address)) {
        return null;
      }
      byte[] owner = ByteArray.fromHexString(address);

      Optional<AssetIssueList> result = WalletClient.getAssetIssueByAccount(owner);
      if (result.isPresent()) {
        AssetIssueList assetIssueList = result.get();
        return assetIssueList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  @PostMapping("/TransferAssetToView")
  public byte[] getTransactionToView(@ModelAttribute TransferAsset transferAsset) {
    try {
      if (transferAsset == null) {
        return null;
      }
      Transaction transaction = WalletClient
          .createTransferAssetTransaction(ByteArray.fromHexString(transferAsset.getToAddress()),
              ByteArray.fromString(transferAsset.getAssetName()),
              ByteArray.fromHexString(transferAsset.getAddress()),
              Long.parseLong(transferAsset.getAmount()));
      transaction = TransactionUtils.setTimestamp(transaction);
      return transaction.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }

  @PostMapping("/ParticipateAssetIssueToView")
  public byte[] getTransactionToView(@ModelAttribute ParticipateAssetIssueVo articipateAssetIssue) {
    try {
      if (articipateAssetIssue == null) {
        return null;
      }
      Transaction transaction = WalletClient
          .participateAssetIssueTransaction(
              ByteArray.fromHexString(articipateAssetIssue.getToAddress()),
              ByteArray.fromHexString(articipateAssetIssue.getName()),
              ByteArray.fromHexString(articipateAssetIssue.getOwnerAddress()),
              articipateAssetIssue.getAmount());
      transaction = TransactionUtils.setTimestamp(transaction);
      return transaction.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }


}
