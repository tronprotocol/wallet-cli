package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.TransferAsset;
import org.tron.protos.Contract.TransferContract;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

@RestController
public class AssetTransferController {

  protected final Log log = LogFactory.getLog(getClass());

  @PostMapping("/sendAssetCoinToView")
  public byte[] getTransactionToView(@ModelAttribute TransferAsset transferAsset) {
    Transaction transaction;
    try {
      if (transferAsset == null) {
        return null;
      }
      byte[] address = WalletClient.decodeFromBase58Check(transferAsset.getAddress());
      byte[] toAddress = WalletClient.decodeFromBase58Check(transferAsset.getToAddress());
      if (address == null || toAddress == null) {
        return null;
      }
      if (transferAsset.getAssetName() != "TRX") {
        transaction = WalletClient
            .createTransferAssetTransaction(toAddress,
                ByteArray.fromHexString(transferAsset.getAssetName()),
                address,
                Long.parseLong(transferAsset.getAmount()));
      } else {
        TransferContract contract = WalletClient
            .createTransferContract(toAddress, address, Long.parseLong(transferAsset.getAmount()));
        transaction = WalletClient.createTransaction4Transfer(contract);
      }

      transaction = TransactionUtils.setTimestamp(transaction);
      return transaction.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }


  }

}
