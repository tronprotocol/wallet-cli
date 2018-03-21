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
import org.tron.api.GrpcAPI.WitnessList;
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

  @PostMapping("/testAddress")
  public boolean testAddress(String priKeyHex, String pubKeyHex, String addressHex) {
    ECKey eCkey = null;
    try {
      BigInteger priK = new BigInteger(priKeyHex, 16);
      eCkey = ECKey.fromPrivate(priK);
    } catch (Exception ex) {
      ex.printStackTrace();
      return false;
    }
    byte[] priKey = eCkey.getPrivKeyBytes();
    byte[] pubKey = eCkey.getPubKey();
    byte[] address = eCkey.getAddress();

    String priKeyString = ByteArray.toHexString(priKey);
    String pubKeyString = ByteArray.toHexString(pubKey);
    String addressString = ByteArray.toHexString(address);

    if (!priKeyHex.equalsIgnoreCase(priKeyString)) {
      System.out.println("priKeyHex:::" + priKeyHex);
      System.out.println("priKeyString:::" + priKeyString);
      return false;
    }

    if (!pubKeyHex.equalsIgnoreCase(pubKeyString)) {
      System.out.println("priKeyHex:::" + priKeyHex);
      System.out.println("priKeyString:::" + priKeyString);

      System.out.println("pubKeyHex:::" + pubKeyHex);
      System.out.println("pubKeyString:::" + pubKeyString);
      return false;
    }

    if (!addressHex.equalsIgnoreCase(addressString)) {
      System.out.println("pubKeyHex:::" + pubKeyHex);
      System.out.println("pubKeyString:::" + pubKeyString);

      System.out.println("addressHex:::" + addressHex);
      System.out.println("addressString:::" + addressString);
      return false;
    }

    return true;
  }


  @PostMapping("/testSign")
  public boolean testSign(String signHex, String pubKeyHex, String msgHex, String hashHex)
      throws SignatureException {
    byte[] sign = ByteArray.fromHexString(signHex);
    byte[] pubKey = ByteArray.fromHexString(pubKeyHex);
    byte[] msg = ByteArray.fromHexString(msgHex);
    byte[] hash = sha256(msg);
    byte[] r = new byte[32];
    byte[] s = new byte[32];
    byte v = sign[64];
    v += 27;
    System.arraycopy(sign, 0, r, 0, 32);
    System.arraycopy(sign, 32, s, 0, 32);
    ECDSASignature signature = ECDSASignature.fromComponents(r, s, v);
    byte[] pubKey1 = ECKey.signatureToKey(hash, signature).getPubKey();
    if (!Arrays.equals(pubKey, pubKey1)) {
      System.out.println("signHex:::" + signHex);
      System.out.println("msgHex:::" + msgHex);
      System.out.println("pubKey js:::" + pubKeyHex);
      System.out.println("pubKey java:::" + ByteArray.toHexString(pubKey1));
      System.out.println("hash js:::" + hashHex);
      System.out.println("hash java:::" + ByteArray.toHexString(hash));
      return false;
    }
    System.out.println("test Sign complet");
    return true;
  }
}
