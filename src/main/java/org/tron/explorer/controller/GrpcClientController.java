package org.tron.explorer.controller;

import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import com.googlecode.protobuf.format.JsonFormat;
import io.swagger.annotations.ApiImplicitParam;
import io.swagger.annotations.ApiOperation;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Base64.Encoder;
import java.util.List;
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
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletcli.Test;
import org.tron.walletserver.WalletClient;


@RestController
public class GrpcClientController {

  protected final Log log = LogFactory.getLog(getClass());


  @GetMapping("/")
  public ModelAndView viewIndex() {
    return new ModelAndView("index");
  }

  @GetMapping("/queryAccount")
  public ModelAndView viewQueryAccount() {
    return new ModelAndView("accountList");
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

  @PostMapping("/getBalance")
  public AccountVo getBalanceForRest(@ModelAttribute AccountVo accountVo) {
    long balance = WalletClient.getBalance(ByteArray.fromHexString(accountVo.getAddress()));
    final AccountVo account = new AccountVo();
    account.setAddress(accountVo.getAddress());
    account.setBalance(balance);
    return account;
  }

  @GetMapping("/accountList")
  public byte[] getAcountList() {

    List<Account> objectList = WalletClient.listAccounts().get().getAccountsList();

    int objectsSize = 0;
    for (int i = 0; i < objectList.size(); i++) {
      Account object = objectList.get(i);
      objectsSize += object.getSerializedSize();
      objectsSize += 2;  //Length
    }

    byte[] returnBytes = new byte[objectsSize];

    objectsSize = 0;
    for (int i = 0; i < objectList.size(); i++) {
      Account object = objectList.get(i);
      byte[] objectBytes = object.toByteArray();
      int length = objectBytes.length;
      returnBytes[objectsSize++] = (byte) ((length & 0xFFFF) >> 8);
      returnBytes[objectsSize++] = (byte) (length & 0xFF);
      System.arraycopy(objectBytes, 0, returnBytes, objectsSize, length);
      objectsSize += length;
    }

    return returnBytes;
  }

  @GetMapping("/alTest")
  public byte[] getAcountListForTest()
      throws IOException {

    final List<Account> accountsList = WalletClient.listAccounts().get().getAccountsList();

    Account account = accountsList.get(0);

    final Encoder encoder = Base64.getEncoder();
    byte[] accountsBytes = account.toByteArray();
    final byte[] encode = encoder.encode(accountsBytes);

    String encodeString = new String(encode, "ISO-8859-1");

    System.out.println("Name::: " + ByteArray.toHexString(account.getAccountName().toByteArray()));
    System.out.println("Address::: " + ByteArray.toHexString(account.getAddress().toByteArray()));
    System.out.println("Balance::: " + account.getBalance());

    System.out.println("base64String::: " + encodeString);

    return accountsBytes;
  }


  @GetMapping("/aTest")
  public String getAcountForTest() {

    final List<Account> accountsList = WalletClient.listAccounts().get().getAccountsList();

    final JsonFormat jsonFormat = new JsonFormat();
    List list = new ArrayList();
    for (Account account : accountsList) {
      final String accountStr = ByteArray.toHexString(account.getAddress().toByteArray());

      final String s = jsonFormat.printToString(account);
      list.add(s);
      System.out.println("s :" + s);

    }
    return list.toString();

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
    final byte[] bytes = ByteArray.fromHexString(transactionData);
    return WalletClient.broadcastTransaction(bytes);
  }
}
