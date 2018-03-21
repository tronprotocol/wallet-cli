package org.tron.explorer.controller;

import static org.tron.common.crypto.Hash.sha256;

import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import com.googlecode.protobuf.format.JsonFormat;
import io.swagger.annotations.ApiImplicitParam;
import io.swagger.annotations.ApiOperation;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.math.BigInteger;
import java.security.SignatureException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Base64.Encoder;
import java.util.List;
import java.util.Optional;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.api.GrpcAPI.AccountList;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.ECKey.ECDSASignature;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.AccountVo;
import org.tron.protos.Contract.AccountCreateContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletcli.Test;
import org.tron.walletserver.WalletClient;


@RestController
public class AccountController {

  protected final Log log = LogFactory.getLog(getClass());

  @PostMapping("/queryAccount")
  public byte[] queryAccount(@ModelAttribute AccountVo accountVo) {
    try {
      if (accountVo == null) {
        return null;
      }
      String address = accountVo.getAddress();
      if (!WalletClient.addressValid(address)) {
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