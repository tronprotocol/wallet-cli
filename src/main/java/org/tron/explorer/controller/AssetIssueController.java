//package org.tron.explorer.controller;
//
//import org.apache.commons.logging.Log;
//import org.apache.commons.logging.LogFactory;
//import org.springframework.web.bind.annotation.ModelAttribute;
//import org.springframework.web.bind.annotation.RestController;
//import org.springframework.web.servlet.ModelAndView;
//import org.tron.api.GrpcAPI.AssetIssueList;
//import org.tron.common.utils.ByteArray;
//import org.tron.common.utils.TransactionUtils;
//import org.tron.explorer.domain.AssetIssueVo;
//import org.tron.explorer.domain.ParticipateAssetIssueVo;
//import org.tron.explorer.domain.TransferAsset;
//import org.tron.protos.Contract.AssetIssueContract;
//import org.tron.protos.Protocol.Transaction;
//import org.tron.walletserver.WalletClient;
//
//import java.io.IOException;
//import java.util.Optional;
//
//
//@RestController
//public class AssetIssueController {
//
//  protected final Log log = LogFactory.getLog(getClass());
//
//  @ModelAttribute
//  AssetIssueVo setAssetIssueVo() {
//    return new AssetIssueVo();
//  }
//
//  @ModelAttribute
//  TransferAsset setTransferAsset() {
//    return new TransferAsset();
//  }
//
//  @ModelAttribute
//  ParticipateAssetIssueVo setParticipateAssetIssueVo() {
//    return new ParticipateAssetIssueVo();
//  }
//
//
////  @GetMapping("/createAssetIssue")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public ModelAndView viewCreateWitness() {
//    return new ModelAndView("createAssetIssue");
//  }
//
//
// // @PostMapping("/createAssetIssueToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(@ModelAttribute AssetIssueVo assetIssueVo) {
//    return null;
//    /*
//    try {
//      if (assetIssueVo == null) {
//        return null;
//      }
//      byte[] owner = WalletClient.decodeFromBase58Check(assetIssueVo.getOwnerAddress());
//      if (owner == null) {
//        return null;
//      }
//
//      Contract.AssetIssueContract.Builder builder = Contract.AssetIssueContract.newBuilder();
//      builder.setOwnerAddress(ByteString.copyFrom(owner));
//      builder.setName(ByteString.copyFrom(assetIssueVo.getName().getBytes()));
//      builder.setTotalSupply(assetIssueVo.getTotalSupply());
//      builder.setTrxNum(assetIssueVo.getTrxNum());
//      builder.setNum(assetIssueVo.getNum());
//      builder.setStartTime(assetIssueVo.getStartTime());
//      builder.setEndTime(assetIssueVo.getEndTime());
//      builder.setVoteScore(assetIssueVo.getVoteScore());
//      builder.setDescription(ByteString.copyFrom(assetIssueVo.getDescription().getBytes()));
//      builder.setUrl(ByteString.copyFrom(assetIssueVo.getUrl().getBytes()));
//      HashMap<String,String> frozenSupply = assetIssueVo.getFrozenSupply();
//      for (String amountStr : frozenSupply.keySet()) {
//        String daysStr = frozenSupply.get(amountStr);
//        long amount = Long.parseLong(amountStr);
//        long days = Long.parseLong(daysStr);
//        Contract.AssetIssueContract.FrozenSupply.Builder frozenSupplyBuilder
//            = Contract.AssetIssueContract.FrozenSupply.newBuilder();
//        frozenSupplyBuilder.setFrozenAmount(amount);
//        frozenSupplyBuilder.setFrozenDays(days);
//        builder.addFrozenSupply(frozenSupplyBuilder.build());
//      }
//
//      Contract.AssetIssueContract contract = builder.build();
//      Transaction transaction = WalletClient.createAssetIssueTransaction(contract);
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      System.out.printf("error=====" + e.getMessage());
//      e.printStackTrace();
//      return null;
//    }
//    */
//  }
//
////  @GetMapping("/getAssetIssueList")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getAssetIssueList() throws IOException {
//    try {
//      Optional<AssetIssueList> result = WalletClient.getAssetIssueList();
//      if (result.isPresent()) {
//        AssetIssueList assetIssueList = result.get();
//        return assetIssueList.toByteArray();
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
//    return null;
//  }
//
// // @GetMapping("/getAssetIssueByAccount")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getAssetIssueByAccount(String address) throws IOException {
//    try {
//      byte[] owner = WalletClient.decodeFromBase58Check(address);
//      if (owner == null) {
//        return null;
//      }
//
//      Optional<AssetIssueList> result = WalletClient.getAssetIssueByAccount(owner);
//      if (result.isPresent()) {
//        AssetIssueList assetIssueList = result.get();
//        return assetIssueList.toByteArray();
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
//    return null;
//  }
//
// // @PostMapping("/getAssetIssueByName")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getAssetIssueByName(String assetName) throws IOException {
//    try {
//      AssetIssueContract assetIssueContract = WalletClient.getAssetIssueByName(assetName);
//      if (assetIssueContract != null) {
//        return assetIssueContract.toByteArray();
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
//    return null;
//  }
//
// // @PostMapping("/TransferAssetToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(@ModelAttribute TransferAsset transferAsset) {
//    try {
//      if (transferAsset == null) {
//        return null;
//      }
//      byte[] address = WalletClient.decodeFromBase58Check(transferAsset.getAddress());
//      byte[] toAddress = WalletClient.decodeFromBase58Check(transferAsset.getToAddress());
//      if (address == null || toAddress == null) {
//        return null;
//      }
//      Transaction transaction = WalletClient.createTransferAssetTransaction(toAddress,
//          ByteArray.fromString(transferAsset.getAssetName()), address,
//          Long.parseLong(transferAsset.getAmount()));
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//
// // @PostMapping("/ParticipateAssetIssueToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getTransactionToView(@ModelAttribute ParticipateAssetIssueVo articipateAssetIssue) {
//    try {
//      if (articipateAssetIssue == null) {
//        return null;
//      }
//      byte[] owner = WalletClient.decodeFromBase58Check(articipateAssetIssue.getOwnerAddress());
//      byte[] to = WalletClient.decodeFromBase58Check(articipateAssetIssue.getToAddress());
//      if (owner == null || to == null) {
//        return null;
//      }
//      Transaction transaction = WalletClient.participateAssetIssueTransaction(to,
//          ByteArray.fromHexString(articipateAssetIssue.getName()), owner,
//          articipateAssetIssue.getAmount());
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//}
