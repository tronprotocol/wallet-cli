package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.protos.Protocol.Block;
import org.tron.walletserver.WalletClient;


@RestController
public class BlockMessageController {

  protected final Log log = LogFactory.getLog(getClass());


  @GetMapping("/getBlockToView")
  public byte[] getBlockToView() {
    Block currentBlock = WalletClient.GetBlock(-1);
    return currentBlock.toByteArray();
  }
}
