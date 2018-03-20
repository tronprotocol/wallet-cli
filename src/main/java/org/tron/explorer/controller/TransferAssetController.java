package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.Transfer;
import org.tron.explorer.domain.TransferAsset;
import org.tron.protos.Contract.TransferAssetContract;
import org.tron.protos.Contract.TransferContract;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;


@RestController
public class TransferAssetController {

  protected final Log log = LogFactory.getLog(getClass());

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
