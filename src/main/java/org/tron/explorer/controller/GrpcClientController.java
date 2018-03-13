package org.tron.explorer.controller;

import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import io.swagger.annotations.ApiImplicitParam;
import io.swagger.annotations.ApiOperation;
import java.io.UnsupportedEncodingException;
import java.util.List;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.domain.AccountVo;
import org.tron.protos.Contract.AccountCreateContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletClient;


@RestController
public class GrpcClientController {

  protected final Log log = LogFactory.getLog(getClass());


  @GetMapping("/")
  public ModelAndView viewIndex() {
    return new ModelAndView("esign-test");
  }


  @ModelAttribute
  AccountVo setAccountVo() {
    return new AccountVo();
  }

  @ApiOperation(value = "get Balance", notes = "query balance")
  @ApiImplicitParam(name = "address", value = "address", required = true, dataType = "String")
  @PostMapping("/balance")
  public ModelAndView getBalance(@ModelAttribute AccountVo accountVo) {

    long balance = WalletClient.getBalance(ByteArray.fromHexString(accountVo.getAddress()));
    ModelAndView modelAndView = new ModelAndView("balance");
    modelAndView.addObject("address", accountVo.getAddress());
    modelAndView.addObject("balance", balance);

    return modelAndView;
  }

  @ApiOperation(value = "get AcountList", notes = "query AcountList")
  @GetMapping("/accountList")
  public ModelAndView getAcountList() {

    List<Account> accountList = WalletClient.listAccounts().get().getAccountsList();
    ModelAndView modelAndView = new ModelAndView("accountList");
    modelAndView.addObject("accountList", accountList);

    return modelAndView;
  }

  @GetMapping("/witnessList")
  public ModelAndView getWitnessList() {

    List<Witness> witnessList = WalletClient.listWitnesses().get().getWitnessesList();
    ModelAndView modelAndView = new ModelAndView("witnessList");
    modelAndView.addObject("witnessList", witnessList);

    return modelAndView;
  }

  @PostMapping("/register")
  public ModelAndView registerAccount(@ModelAttribute AccountVo account) {
    ModelAndView modelAndView;
    try {
      Transaction transaction = WalletClient
          .createAccountTransaction(AccountType.Normal, account.getName().getBytes(),
              ByteArray.fromHexString(account.getAddress()));
      Any contract = transaction.getRawData().getContract(0).getParameter();
      AccountCreateContract accountCreateContract = contract.unpack(AccountCreateContract.class);
      modelAndView = new ModelAndView("register");
      modelAndView.addObject("name",
          new String(accountCreateContract.getAccountName().toByteArray(), "ISO-8859-1"));
      modelAndView.addObject("address",
          ByteArray.toHexString(accountCreateContract.getOwnerAddress().toByteArray()));
    } catch (InvalidProtocolBufferException e) {
      e.printStackTrace();
      modelAndView = new ModelAndView("error");
      modelAndView.addObject("message", "invalid transaction!!!");
    } catch (UnsupportedEncodingException e) {
      e.printStackTrace();
      modelAndView = new ModelAndView("error");
      modelAndView.addObject("message", "invalid transaction!!!");
    }
    return modelAndView;
  }
}
