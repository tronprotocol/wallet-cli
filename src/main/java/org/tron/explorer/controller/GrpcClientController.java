package org.tron.explorer.controller;

import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.explorer.domain.AccountVo;
import org.tron.protos.Contract.AccountCreateContract;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletcli.Test;
import org.tron.walletserver.WalletClient;

import java.io.UnsupportedEncodingException;


@RestController
public class GrpcClientController {

  protected final Log log = LogFactory.getLog(getClass());


  @ModelAttribute
  AccountVo setAccountVo() {
    return new AccountVo();
  }


  @GetMapping("/")
  public ModelAndView viewIndex() {
    return new ModelAndView("index");
  }

  @GetMapping("/getTransaction")
  public byte[] getTransaction() {
    Transaction transaction = Test.createTransactionAccount();
    transaction = TransactionUtils.setTimestamp(transaction);
    return transaction.toByteArray();
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

  //send account transaction to view
  @PostMapping("/transactionForView")
  public byte[] getTransactionToView(@ModelAttribute AccountVo account) {
    Transaction transaction = WalletClient
        .createAccountTransaction(AccountType.Normal, account.getName().getBytes(),
            ByteArray.fromHexString(account.getAddress()));
    transaction = TransactionUtils.setTimestamp(transaction);
    return transaction.toByteArray();
  }

  //get account transaction from view
  @PostMapping("/transactionFromView")
  public boolean transactionFromView(String transactionData) throws InvalidProtocolBufferException {
    if ( transactionData == null || transactionData.equals("")){
      return false;
    }
    final byte[] bytes = ByteArray.fromHexString(transactionData);
    return WalletClient.broadcastTransaction(bytes);
  }
}
