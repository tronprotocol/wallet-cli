package org.tron.explorer.controller;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.api.GrpcAPI.AccountList;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.domain.AccountVo;
import org.tron.protos.Protocol.Account;
import org.tron.walletserver.WalletClient;

import java.util.Optional;


@RestController
public class AccountController {

  protected final Log log = LogFactory.getLog(getClass());

  @ModelAttribute
  AccountVo setAccountVo() {
    return new AccountVo();
  }

  @PostMapping("/queryAccount")
  public byte[] queryAccount(String address) {
    try {
      if (address == null) {
        return null;
      }
      byte[] baAddress = WalletClient.decodeFromBase58Check(address);
      if (baAddress == null) {
        return null;
      }
      Account account = WalletClient.queryAccount(ByteArray.fromHexString(address));
      return account.toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }

  @GetMapping("/accountList")
  public byte[] getAcountList() {
    try {
      Optional<AccountList> result = WalletClient.listAccounts();
      if (result.isPresent()) {
        AccountList accountList = result.get();
        return accountList.toByteArray();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }
}