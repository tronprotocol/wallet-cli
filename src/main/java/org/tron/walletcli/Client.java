package org.tron.walletcli;

import com.beust.jcommander.JCommander;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.commons.lang3.ArrayUtils;
import org.bouncycastle.util.encoders.Hex;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.tron.api.GrpcAPI.AccountNetMessage;
import org.tron.api.GrpcAPI.AccountResourceMessage;
import org.tron.api.GrpcAPI.AddressPrKeyPairMessage;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.BlockExtention;
import org.tron.api.GrpcAPI.BlockList;
import org.tron.api.GrpcAPI.BlockListExtention;
import org.tron.api.GrpcAPI.DelegatedResourceList;
import org.tron.api.GrpcAPI.ExchangeList;
import org.tron.api.GrpcAPI.Node;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.api.GrpcAPI.NumberMessage;
import org.tron.api.GrpcAPI.ProposalList;
import org.tron.api.GrpcAPI.TransactionList;
import org.tron.api.GrpcAPI.TransactionListExtention;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.exception.EncodingException;
import org.tron.keystore.StringUtils;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.DelegatedResourceAccountIndex;
import org.tron.protos.Protocol.Exchange;
import org.tron.protos.Protocol.Proposal;
import org.tron.protos.Protocol.SmartContract;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.walletserver.WalletApi;

public class Client {

  private static final Logger logger = LoggerFactory.getLogger("Client");
  private WalletApiWrapper walletApiWrapper = new WalletApiWrapper();

  private char[] inputPassword2Twice() throws IOException {
    char[] password0;
    while (true) {
      System.out.println("Please input password.");
      password0 = Utils.inputPassword(true);
      System.out.println("Please input password again.");
      char[] password1 = Utils.inputPassword(true);
      boolean flag = Arrays.equals(password0, password1);
      StringUtils.clear(password1);
      if (flag) {
        break;
      }
      System.out.println("The passwords do not match, please input again.");
    }
    return password0;
  }

  private byte[] inputPrivateKey() throws IOException {
    byte[] temp = new byte[128];
    byte[] result = null;
    System.out.println("Please input private key.");
    while (true) {
      int len = System.in.read(temp, 0, temp.length);
      if (len >= 64) {
        byte[] privateKey = Arrays.copyOfRange(temp, 0, 64);
        result = StringUtils.hexs2Bytes(privateKey);
        StringUtils.clear(privateKey);
        if (WalletApi.priKeyValid(result)) {
          break;
        }
      }
      StringUtils.clear(result);
      System.out.println("Invalid private key, please input again.");
    }
    StringUtils.clear(temp);
    return result;
  }

  private byte[] inputPrivateKey64() throws IOException {
    Decoder decoder = Base64.getDecoder();
    byte[] temp = new byte[128];
    byte[] result;
    System.out.println("Please input private key by base64.");
    while (true) {
      int len = System.in.read(temp, 0, temp.length);
      if (len >= 44) {
        byte[] priKey64 = Arrays.copyOfRange(temp, 0, 44);
        result = decoder.decode(priKey64);
        StringUtils.clear(priKey64);
        if (WalletApi.priKeyValid(result)) {
          break;
        }
      }
      System.out.println("Invalid base64 private key, please input again.");
    }
    StringUtils.clear(temp);
    return result;
  }

  private void registerWallet() throws CipherException, IOException {
    char[] password = inputPassword2Twice();
    String fileName = walletApiWrapper.registerWallet(password);
    StringUtils.clear(password);

    if (null == fileName) {
      logger.info("Register wallet failed !!");
      return;
    }
    logger.info("Register a wallet successful, keystore file name is " + fileName);
  }

  private void importWallet() throws CipherException, IOException {
    char[] password = inputPassword2Twice();
    byte[] priKey = inputPrivateKey();

    String fileName = walletApiWrapper.importWallet(password, priKey);
    StringUtils.clear(password);
    StringUtils.clear(priKey);

    if (null == fileName) {
      System.out.println("Import wallet failed !!");
      return;
    }
    System.out.println("Import a wallet successful, keystore file name is " + fileName);
  }

  private void importwalletByBase64() throws CipherException, IOException {
    char[] password = inputPassword2Twice();
    byte[] priKey = inputPrivateKey64();

    String fileName = walletApiWrapper.importWallet(password, priKey);
    StringUtils.clear(password);
    StringUtils.clear(priKey);

    if (null == fileName) {
      System.out.println("Import wallet failed !!");
      return;
    }
    System.out.println("Import a wallet successful, keystore file name is " + fileName);
  }

  private void changePassword() throws IOException, CipherException {
    System.out.println("Please input old password.");
    char[] oldPassword = Utils.inputPassword(false);
    System.out.println("Please input new password.");
    char[] newPassword = inputPassword2Twice();

    if (walletApiWrapper.changePassword(oldPassword, newPassword)) {
      System.out.println("ChangePassword successful !!");
    } else {
      System.out.println("ChangePassword failed !!");
    }
    StringUtils.clear(oldPassword);
    StringUtils.clear(newPassword);
  }

  private void login() throws IOException, CipherException {
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);

    boolean result = walletApiWrapper.login(password);
    StringUtils.clear(password);

    if (result) {
      System.out.println("Login successful !!!");
    } else {
      System.out.println("Login failed !!!");
    }
  }

  private void logout() {
    walletApiWrapper.logout();
    System.out.println("Logout successful !!!");
  }

  private void backupWallet() throws IOException, CipherException {
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);

    byte[] priKey = walletApiWrapper.backupWallet(password);
    StringUtils.clear(password);

    if (!ArrayUtils.isEmpty(priKey)) {
      System.out.println("BackupWallet successful !!");
      for (int i = 0; i < priKey.length; i++) {
        StringUtils.printOneByte(priKey[i]);
      }
      System.out.println();
    }
    StringUtils.clear(priKey);
  }

  private void backupWallet2Base64() throws IOException, CipherException {
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);

    byte[] priKey = walletApiWrapper.backupWallet(password);
    StringUtils.clear(password);

    if (!ArrayUtils.isEmpty(priKey)) {
      Encoder encoder = Base64.getEncoder();
      byte[] priKey64 = encoder.encode(priKey);
      StringUtils.clear(priKey);
      System.out.println("BackupWallet successful !!");
      for (int i = 0; i < priKey64.length; i++) {
        System.out.print((char) priKey64[i]);
      }
      System.out.println();
      StringUtils.clear(priKey64);
    }
  }

  private void getAddress() {
    String address = walletApiWrapper.getAddress();
    if (address != null) {
      logger.info("GetAddress successful !!");
      logger.info("address = " + address);
    }
  }

  private void getBalance() {
    Account account = walletApiWrapper.queryAccount();
    if (account == null) {
      logger.info("GetBalance failed !!!!");

    } else {
      long balance = account.getBalance();
      logger.info("Balance = " + balance);
    }
  }

  private void getAccount(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetAccount needs 1 parameter like the following: ");
      System.out.println("GetAccount Address ");
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    Account account = WalletApi.queryAccount(addressBytes);
    if (account == null) {
      logger.info("GetAccount failed !!!!");
    } else {
      logger.info("\n" + Utils.printAccount(account));
    }
  }

  private void getAccountById(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetAccountById needs 1 parameter like the following: ");
      System.out.println("GetAccountById accountId ");
      return;
    }
    String accountId = parameters[0];

    Account account = WalletApi.queryAccountById(accountId);
    if (account == null) {
      logger.info("GetAccountById failed !!!!");
    } else {
      logger.info("\n" + Utils.printAccount(account));
    }
  }


  private void updateAccount(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("UpdateAccount needs 1 parameter like the following: ");
      System.out.println("UpdateAccount AccountName ");
      return;
    }

    String accountName = parameters[0];
    byte[] accountNameBytes = ByteArray.fromString(accountName);

    boolean ret = walletApiWrapper.updateAccount(accountNameBytes);
    if (ret) {
      logger.info("Update Account successful !!!!");
    } else {
      logger.info("Update Account failed !!!!");
    }
  }

  private void setAccountId(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("SetAccountId needs 1 parameter like the following: ");
      System.out.println("SetAccountId AccountId ");
      return;
    }

    String accountId = parameters[0];
    byte[] accountIdBytes = ByteArray.fromString(accountId);

    boolean ret = walletApiWrapper.setAccountId(accountIdBytes);
    if (ret) {
      logger.info("Set AccountId successful !!!!");
    } else {
      logger.info("Set AccountId failed !!!!");
    }
  }


  private void updateAsset(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 4) {
      System.out.println("UpdateAsset needs 4 parameters like the following: ");
      System.out.println("UpdateAsset newLimit newPublicLimit description url");
      return;
    }

    String newLimitString = parameters[0];
    String newPublicLimitString = parameters[1];
    String description = parameters[2];
    String url = parameters[3];

    byte[] descriptionBytes = ByteArray.fromString(description);
    byte[] urlBytes = ByteArray.fromString(url);
    long newLimit = new Long(newLimitString);
    long newPublicLimit = new Long(newPublicLimitString);

    boolean ret = walletApiWrapper
        .updateAsset(descriptionBytes, urlBytes, newLimit, newPublicLimit);
    if (ret) {
      logger.info("Update Asset successful !!!!");
    } else {
      logger.info("Update Asset failed !!!!");
    }
  }

  private void getAssetIssueByAccount(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetAssetIssueByAccount needs 1 parameter like following: ");
      System.out.println("GetAssetIssueByAccount Address ");
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    Optional<AssetIssueList> result = WalletApi.getAssetIssueByAccount(addressBytes);
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info(Utils.printAssetIssueList(assetIssueList));
    } else {
      logger.info("GetAssetIssueByAccount " + " failed !!");
    }
  }

  private void getAccountNet(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetAccountNet needs 1 parameter like following: ");
      System.out.println("GetAccountNet Address ");
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    AccountNetMessage result = WalletApi.getAccountNet(addressBytes);
    if (result == null) {
      logger.info("GetAccountNet " + " failed !!");
    } else {
      logger.info("\n" + Utils.printAccountNet(result));
    }
  }

  private void getAccountResource(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getAccountResource needs 1 parameter like following: ");
      System.out.println("getAccountResource Address ");
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    AccountResourceMessage result = WalletApi.getAccountResource(addressBytes);
    if (result == null) {
      logger.info("getAccountResource " + " failed !!");
    } else {
      logger.info("\n" + Utils.printAccountResourceMessage(result));
    }
  }

  // In 3.2 version, this function will return null if there are two or more asset with the same token name,
  // so please use getAssetIssueById or getAssetIssueListByName.
  // This function just remains for compatibility.
  private void getAssetIssueByName(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetAssetIssueByName needs 1 parameter like following: ");
      System.out.println("GetAssetIssueByName AssetName ");
      return;
    }
    String assetName = parameters[0];

    AssetIssueContract assetIssueContract = WalletApi.getAssetIssueByName(assetName);
    if (assetIssueContract != null) {
      logger.info("\n" + Utils.printAssetIssue(assetIssueContract));
    } else {
      logger.info("getAssetIssueByName " + " failed !!");
    }
  }

  private void getAssetIssueListByName(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getAssetIssueListByName needs 1 parameter like following: ");
      System.out.println("getAssetIssueListByName AssetName ");
      return;
    }
    String assetName = parameters[0];

    Optional<AssetIssueList> result = WalletApi.getAssetIssueListByName(assetName);
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info(Utils.printAssetIssueList(assetIssueList));
    } else {
      logger.info("getAssetIssueListByName " + " failed !!");
    }
  }

  private void getAssetIssueById(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getAssetIssueById needs 1 parameter like following: ");
      System.out.println("getAssetIssueById AssetId ");
      return;
    }
    String assetId = parameters[0];

    AssetIssueContract assetIssueContract = WalletApi.getAssetIssueById(assetId);
    if (assetIssueContract != null) {
      logger.info("\n" + Utils.printAssetIssue(assetIssueContract));
    } else {
      logger.info("getAssetIssueById " + " failed !!");
    }
  }

  public void getDefferedTransactionbyid(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("GetDefferedTransactionbyid needs parameters like following: ");
      System.out.println("GetDefferedTransactionbyid transactionId");
      return;
    }

    String trxId = parameters[0];
    walletApiWrapper.getDefferedTransaction(trxId);
  }

  private void cancelDefferedTransaction(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("CancelDefferedTransaction needs parameters like following: ");
      System.out.println("CancelDefferedTransaction transactionId");
      return;
    }

    String trxId = parameters[0];
    boolean result = walletApiWrapper.cancelDefferedTransaction(trxId);
    if (result) {
      logger.info("CancelDefferedTransaction is successful");
    } else {
      logger.info("CancelDefferedTransaction is failed !!");
    }

  }

  private void sendCoin(String[] parameters) throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 2 || parameters.length > 3) {
      System.out.println("SendCoin needs parameters like following: ");
      System.out.println("SendCoin ToAddress Amount delaySeconds");
      return;
    }

    String toAddress = parameters[0];
    String amountStr = parameters[1];
    long amount = new Long(amountStr);

    long delaySeconds = 0;
    if (parameters.length == 3){
      delaySeconds = Long.valueOf(parameters[2]);
    }

    boolean result = walletApiWrapper.sendCoin(toAddress, amount, delaySeconds);
    if (result) {
      logger.info("Send " + amount + " drop to " + toAddress + " successful !!");
    } else {
      logger.info("Send " + amount + " drop to " + toAddress + " failed !!");
    }
  }

  private void testTransaction(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 3 && parameters.length != 4)) {
      System.out.println("testTransaction needs 3 or 4 parameters using the following syntax: ");
      System.out.println("testTransaction ToAddress assertName times");
      System.out.println("testTransaction ToAddress assertName times interval");
      System.out.println("If needing transferAsset, assertName input null");
      return;
    }

    String toAddress = parameters[0];
    String assertName = parameters[1];
    String loopTime = parameters[2];
    int intervalInt = 0;//s
    if (parameters.length == 5) {
      String interval = parameters[4];
      intervalInt = Integer.parseInt(interval);//s
    }
    intervalInt *= 500; //ms
    long times = new Long(loopTime);

    for (int i = 1; i <= times; i++) {
      long amount = i;
      boolean result = walletApiWrapper.sendCoin(toAddress, amount, 0);
      if (result) {
        logger.info("Send " + amount + " drop to " + toAddress + " successful !!");
        if (intervalInt > 0) {
          try {
            Thread.sleep(intervalInt);
          } catch (Exception e) {
            e.printStackTrace();
            break;
          }
        }
      } else {
        logger.info("Send " + amount + " drop to " + toAddress + " failed !!");
        break;
      }

      if (!"null".equalsIgnoreCase(assertName)) {
        result = walletApiWrapper.transferAsset(toAddress, assertName, amount);
        if (result) {
          logger
              .info(
                  "transferAsset " + amount + assertName + " to " + toAddress + " successful !!");
          if (intervalInt > 0) {
            try {
              Thread.sleep(intervalInt);
            } catch (Exception e) {
              e.printStackTrace();
              break;
            }
          }
        } else {
          logger.info("transferAsset " + amount + assertName + " to " + toAddress + " failed !!");
          break;
        }
      }
    }

  }

  private void transferAsset(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 3) {
      System.out.println("TransferAsset needs 3 parameters using the following syntax: ");
      System.out.println("TransferAsset ToAddress AssertName Amount");
      return;
    }

    String toAddress = parameters[0];
    String assertName = parameters[1];
    String amountStr = parameters[2];
    long amount = new Long(amountStr);

    boolean result = walletApiWrapper.transferAsset(toAddress, assertName, amount);
    if (result) {
      logger.info("TransferAsset " + amount + " to " + toAddress + " successful !!");
    } else {
      logger.info("TransferAsset " + amount + " to " + toAddress + " failed !!");
    }
  }

  private void participateAssetIssue(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 3) {
      System.out.println("ParticipateAssetIssue needs 3 parameters using the following syntax: ");
      System.out.println("ParticipateAssetIssue ToAddress AssetName Amount");
      return;
    }

    String toAddress = parameters[0];
    String assertName = parameters[1];
    String amountStr = parameters[2];
    long amount = Long.parseLong(amountStr);

    boolean result = walletApiWrapper.participateAssetIssue(toAddress, assertName, amount);
    if (result) {
      logger.info("ParticipateAssetIssue " + assertName + " " + amount + " from " + toAddress
          + " successful !!");
    } else {
      logger.info("ParticipateAssetIssue " + assertName + " " + amount + " from " + toAddress
          + " failed !!");
    }
  }

  private void assetIssue(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 11 || (parameters.length & 1) == 0) {
      System.out
          .println("Use the assetIssue command for features that you require with below syntax: ");
      System.out.println(
          "AssetIssue AssetName TotalSupply TrxNum AssetNum Precision "
              + "StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit "
              + "FrozenAmount0 FrozenDays0 ... FrozenAmountN FrozenDaysN");
      System.out
          .println(
              "TrxNum and AssetNum represents the conversion ratio of the tron to the asset.");
      System.out
          .println("The StartDate and EndDate format should look like 2018-3-1 2018-3-21 .");
      return;
    }

    String name = parameters[0];
    String totalSupplyStr = parameters[1];
    String trxNumStr = parameters[2];
    String icoNumStr = parameters[3];
    String precisionStr = parameters[4];
    String startYyyyMmDd = parameters[5];
    String endYyyyMmDd = parameters[6];
    String description = parameters[7];
    String url = parameters[8];
    String freeNetLimitPerAccount = parameters[9];
    String publicFreeNetLimitString = parameters[10];
    HashMap<String, String> frozenSupply = new HashMap<>();
    for (int i = 11; i < parameters.length; i += 2) {
      String amount = parameters[i];
      String days = parameters[i + 1];
      frozenSupply.put(days, amount);
    }

    long totalSupply = new Long(totalSupplyStr);
    int trxNum = new Integer(trxNumStr);
    int icoNum = new Integer(icoNumStr);
    int precision = new Integer(precisionStr);
    Date startDate = Utils.strToDateLong(startYyyyMmDd);
    Date endDate = Utils.strToDateLong(endYyyyMmDd);
    long startTime = startDate.getTime();
    long endTime = endDate.getTime();
    long freeAssetNetLimit = new Long(freeNetLimitPerAccount);
    long publicFreeNetLimit = new Long(publicFreeNetLimitString);

    boolean result = walletApiWrapper
        .assetIssue(name, totalSupply, trxNum, icoNum, precision, startTime, endTime,
            0, description, url, freeAssetNetLimit, publicFreeNetLimit, frozenSupply);
    if (result) {
      logger.info("AssetIssue " + name + " successful !!");
    } else {
      logger.info("AssetIssue " + name + " failed !!");
    }
  }

  private void createAccount(String[] parameters)
      throws CipherException, IOException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("CreateAccount needs 1 parameter using the following syntax: ");
      System.out.println("CreateAccount Address");
      return;
    }

    String address = parameters[0];

    boolean result = walletApiWrapper.createAccount(address);
    if (result) {
      logger.info("CreateAccount " + " successful !!");
    } else {
      logger.info("CreateAccount " + " failed !!");
    }
  }

  private void createWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("CreateWitness needs 1 parameter using the following syntax: ");
      System.out.println("CreateWitness Url");
      return;
    }

    String url = parameters[0];

    boolean result = walletApiWrapper.createWitness(url);
    if (result) {
      logger.info("CreateWitness " + " successful !!");
    } else {
      logger.info("CreateWitness " + " failed !!");
    }
  }

  private void updateWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("updateWitness needs 1 parameter using the following syntax: ");
      System.out.println("updateWitness Url");
      return;
    }

    String url = parameters[0];

    boolean result = walletApiWrapper.updateWitness(url);
    if (result) {
      logger.info("updateWitness " + " successful !!");
    } else {
      logger.info("updateWitness " + " failed !!");
    }
  }

  private void listWitnesses() {
    Optional<WitnessList> result = walletApiWrapper.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      logger.info(Utils.printWitnessList(witnessList));
    } else {
      logger.info("List witnesses " + " failed !!");
    }
  }

  private void getAssetIssueList() {
    Optional<AssetIssueList> result = walletApiWrapper.getAssetIssueList();
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info(Utils.printAssetIssueList(assetIssueList));
    } else {
      logger.info("GetAssetIssueList " + " failed !!");
    }
  }

  private void getAssetIssueList(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println(
          "The listassetissuepaginated command needs 2 parameters, use the following syntax:");
      System.out.println("listassetissuepaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<AssetIssueList> result = walletApiWrapper.getAssetIssueList(offset, limit);
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info(Utils.printAssetIssueList(assetIssueList));
    } else {
      logger.info("GetAssetIssueListPaginated " + " failed !!");
    }
  }

  private void getProposalsListPaginated(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println(
          "The listproposalspaginated command needs 2 parameters, use the following syntax:");
      System.out.println("listproposalspaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<ProposalList> result = walletApiWrapper.getProposalListPaginated(offset, limit);
    if (result.isPresent()) {
      ProposalList proposalList = result.get();
      logger.info(Utils.printProposalsList(proposalList));
    } else {
      logger.info("listproposalspaginated " + " failed !!");
    }
  }

  private void getExchangesListPaginated(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println(
          "The listexchangespaginated command needs 2 parameters, use the following syntax:");
      System.out.println("listexchangespaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<ExchangeList> result = walletApiWrapper.getExchangeListPaginated(offset, limit);
    if (result.isPresent()) {
      ExchangeList exchangeList = result.get();
      logger.info(Utils.printExchangeList(exchangeList));
    } else {
      logger.info("listexchangespaginated " + " failed !!");
    }
  }


  private void listNodes() {
    Optional<NodeList> result = walletApiWrapper.listNodes();
    if (result.isPresent()) {
      NodeList nodeList = result.get();
      List<Node> list = nodeList.getNodesList();
      for (int i = 0; i < list.size(); i++) {
        Node node = list.get(i);
        logger.info("IP::" + ByteArray.toStr(node.getAddress().getHost().toByteArray()));
        logger.info("Port::" + node.getAddress().getPort());
      }
    } else {
      logger.info("GetAssetIssueList " + " failed !!");
    }
  }

  private void getBlock(String[] parameters) {
    long blockNum = -1;

    if (parameters == null || parameters.length == 0) {
      System.out.println("Get current block !!!!");
    } else {
      if (parameters.length != 1) {
        System.out.println("Getblock has too many parameters !!!");
        System.out.println("You can get current block using the following command:");
        System.out.println("Getblock");
        System.out.println("Or get block by number with the following syntax:");
        System.out.println("Getblock BlockNum");
      }
      blockNum = Long.parseLong(parameters[0]);
    }

    if (WalletApi.getRpcVersion() == 2) {
      BlockExtention blockExtention = walletApiWrapper.getBlock2(blockNum);
      if (blockExtention == null) {
        System.out.println("No block for num : " + blockNum);
        return;
      }
      System.out.println(Utils.printBlockExtention(blockExtention));
    } else {
      Block block = walletApiWrapper.getBlock(blockNum);
      if (block == null) {
        System.out.println("No block for num : " + blockNum);
        return;
      }
      System.out.println(Utils.printBlock(block));
    }
  }

  private void getTransactionCountByBlockNum(String[] parameters) {
    if (parameters.length != 1) {
      System.out.println("Too many parameters !!!");
      System.out.println("You need input number with the following syntax:");
      System.out.println("GetTransactionCountByBlockNum number");
    }
    long blockNum = Long.parseLong(parameters[0]);
    long count = walletApiWrapper.getTransactionCountByBlockNum(blockNum);
    System.out.println("The block contain " + count + " transactions");
  }

  private void voteWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 2 || (parameters.length & 1) != 0) {
      System.out.println("Use VoteWitness command with below syntax: ");
      System.out.println("VoteWitness Address0 Count0 ... AddressN CountN");
      return;
    }

    HashMap<String, String> witness = new HashMap<String, String>();
    for (int i = 0; i < parameters.length; i += 2) {
      String address = parameters[i];
      String countStr = parameters[i + 1];
      witness.put(address, countStr);
    }

    boolean result = walletApiWrapper.voteWitness(witness);
    if (result) {
      logger.info("VoteWitness " + " successful !!");
    } else {
      logger.info("VoteWitness " + " failed !!");
    }
  }

  private void freezeBalance(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || !(parameters.length == 2 || parameters.length == 3
        || parameters.length == 4)) {
      System.out.println("Use freezeBalance command with below syntax: ");
      System.out
          .println(
              "freezeBalance frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH,1 ENERGY] "
                  + "[receiverAddress]");
      return;
    }

    long frozen_balance = Long.parseLong(parameters[0]);
    long frozen_duration = Long.parseLong(parameters[1]);
    int resourceCode = 0;
    String receiverAddress = null;
    if (parameters.length == 3) {
      try {
        resourceCode = Integer.parseInt(parameters[2]);
      } catch (NumberFormatException e) {
        receiverAddress = parameters[2];
      }
    }
    if (parameters.length == 4) {
      resourceCode = Integer.parseInt(parameters[2]);
      receiverAddress = parameters[3];
    }
    boolean result = walletApiWrapper.freezeBalance(frozen_balance, frozen_duration, resourceCode,
        receiverAddress);
    if (result) {
      logger.info("freezeBalance " + " successful !!");
    } else {
      logger.info("freezeBalance " + " failed !!");
    }
  }

  private void buyStorage(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use buyStorage command with below syntax: ");
      System.out.println("buyStorage quantity ");
      return;
    }

    long quantity = Long.parseLong(parameters[0]);
    boolean result = walletApiWrapper.buyStorage(quantity);
    if (result) {
      logger.info("buyStorage " + " successful !!");
    } else {
      logger.info("buyStorage " + " failed !!");
    }
  }

  private void buyStorageBytes(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use buyStorageBytes command with below syntax: ");
      System.out.println("buyStorageBytes bytes ");
      return;
    }

    long bytes = Long.parseLong(parameters[0]);
    boolean result = walletApiWrapper.buyStorageBytes(bytes);
    if (result) {
      logger.info("buyStorageBytes " + " successful !!");
    } else {
      logger.info("buyStorageBytes " + " failed !!");
    }
  }

  private void sellStorage(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use sellStorage command with below syntax: ");
      System.out.println("sellStorage quantity ");
      return;
    }

    long storageBytes = Long.parseLong(parameters[0]);
    boolean result = walletApiWrapper.sellStorage(storageBytes);
    if (result) {
      logger.info("sellStorage " + " successful !!");
    } else {
      logger.info("sellStorage " + " failed !!");
    }
  }


  private void unfreezeBalance(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters.length > 2) {
      System.out.println("Use unfreezeBalance command with below syntax: ");
      System.out.println("unfreezeBalance  [ResourceCode:0 BANDWIDTH,1 CPU]" + "[receiverAddress]");
      return;
    }

    int resourceCode = 0;
    String receiverAddress = null;

    if (parameters.length == 1) {
      try {
        resourceCode = Integer.parseInt(parameters[0]);
      } catch (Exception ex) {
        receiverAddress = parameters[0];
      }
    }

    if (parameters.length == 2) {
      resourceCode = Integer.parseInt(parameters[0]);
      receiverAddress = parameters[1];
    }

    boolean result = walletApiWrapper.unfreezeBalance(resourceCode, receiverAddress);
    if (result) {
      logger.info("unfreezeBalance " + " successful !!");
    } else {
      logger.info("unfreezeBalance " + " failed !!");
    }
  }


  private void unfreezeAsset() throws IOException, CipherException, CancelException {
    boolean result = walletApiWrapper.unfreezeAsset();
    if (result) {
      logger.info("unfreezeAsset " + " successful !!");
    } else {
      logger.info("unfreezeAsset " + " failed !!");
    }
  }

  private void createProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 2 || (parameters.length & 1) != 0) {
      System.out.println("Use createProposal command with below syntax: ");
      System.out.println("createProposal id0 value0 ... idN valueN");
      return;
    }

    HashMap<Long, Long> parametersMap = new HashMap<>();
    for (int i = 0; i < parameters.length; i += 2) {
      long id = Long.valueOf(parameters[i]);
      long value = Long.valueOf(parameters[i + 1]);
      parametersMap.put(id, value);
    }
    boolean result = walletApiWrapper.createProposal(parametersMap);
    if (result) {
      logger.info("createProposal " + " successful !!");
    } else {
      logger.info("createProposal " + " failed !!");
    }
  }

  private void approveProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Use approveProposal command with below syntax: ");
      System.out.println("approveProposal id is_or_not_add_approval");
      return;
    }

    long id = Long.valueOf(parameters[0]);
    boolean is_add_approval = Boolean.valueOf(parameters[1]);
    boolean result = walletApiWrapper.approveProposal(id, is_add_approval);
    if (result) {
      logger.info("approveProposal " + " successful !!");
    } else {
      logger.info("approveProposal " + " failed !!");
    }
  }

  private void deleteProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use deleteProposal command with below syntax: ");
      System.out.println("deleteProposal proposalId");
      return;
    }

    long id = Long.valueOf(parameters[0]);
    boolean result = walletApiWrapper.deleteProposal(id);
    if (result) {
      logger.info("deleteProposal " + " successful !!");
    } else {
      logger.info("deleteProposal " + " failed !!");
    }
  }


  private void listProposals() {
    Optional<ProposalList> result = walletApiWrapper.getProposalsList();
    if (result.isPresent()) {
      ProposalList proposalList = result.get();
      logger.info(Utils.printProposalsList(proposalList));
    } else {
      logger.info("List witnesses " + " failed !!");
    }
  }

  private void getProposal(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getProposal needs 1 parameter like following: ");
      System.out.println("getProposal id ");
      return;
    }
    String id = parameters[0];

    Optional<Proposal> result = WalletApi.getProposal(id);
    if (result.isPresent()) {
      Proposal proposal = result.get();
      logger.info(Utils.printProposal(proposal));
    } else {
      logger.info("getProposal " + " failed !!");
    }
  }


  private void getDelegatedResource(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Use getDelegatedResource command with below syntax: ");
      System.out.println("getDelegatedResource fromAddress toAddress");
      return;
    }
    String fromAddress = parameters[0];
    String toAddress = parameters[1];
    Optional<DelegatedResourceList> result = WalletApi.getDelegatedResource(fromAddress, toAddress);
    if (result.isPresent()) {
      DelegatedResourceList delegatedResourceList = result.get();
      logger.info(Utils.printDelegatedResourceList(delegatedResourceList));
    } else {
      logger.info("getDelegatedResource " + " failed !!");
    }
  }

  private void getDelegatedResourceAccountIndex(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use getDelegatedResourceAccountIndex command with below syntax: ");
      System.out.println("getDelegatedResourceAccountIndex address ");
      return;
    }
    String address = parameters[0];
    Optional<DelegatedResourceAccountIndex> result = WalletApi
        .getDelegatedResourceAccountIndex(address);
    if (result.isPresent()) {
      DelegatedResourceAccountIndex delegatedResourceAccountIndex = result.get();
      logger.info(Utils.printDelegatedResourceAccountIndex(delegatedResourceAccountIndex));
    } else {
      logger.info("getDelegatedResourceAccountIndex " + " failed !!");
    }
  }


  private void exchangeCreate(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 4) {
      System.out.println("Use exchangeCreate command with below syntax: ");
      System.out.println("exchangeCreate first_token_id first_token_balance "
          + "second_token_id second_token_balance");
      return;
    }

    byte[] firstTokenId = parameters[0].getBytes();
    long firstTokenBalance = Long.parseLong(parameters[1]);
    byte[] secondTokenId = parameters[2].getBytes();
    long secondTokenBalance = Long.parseLong(parameters[3]);
    boolean result = walletApiWrapper.exchangeCreate(firstTokenId, firstTokenBalance,
        secondTokenId, secondTokenBalance);
    if (result) {
      logger.info("exchange create " + " successful !!");
    } else {
      logger.info("exchange create " + " failed !!");
    }
  }

  private void exchangeInject(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Use exchangeInject command with below syntax: ");
      System.out.println("exchangeInject exchange_id token_id quant");
      return;
    }

    long exchangeId = Long.valueOf(parameters[0]);
    byte[] tokenId = parameters[1].getBytes();
    long quant = Long.valueOf(parameters[2]);
    boolean result = walletApiWrapper.exchangeInject(exchangeId, tokenId, quant);
    if (result) {
      logger.info("exchange inject " + " successful !!");
    } else {
      logger.info("exchange inject " + " failed !!");
    }
  }

  private void exchangeWithdraw(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Use exchangeWithdraw command with below syntax: ");
      System.out.println("exchangeWithdraw exchange_id token_id quant");
      return;
    }

    long exchangeId = Long.valueOf(parameters[0]);
    byte[] tokenId = parameters[1].getBytes();
    long quant = Long.valueOf(parameters[2]);
    boolean result = walletApiWrapper.exchangeWithdraw(exchangeId, tokenId, quant);
    if (result) {
      logger.info("exchange withdraw " + " successful !!");
    } else {
      logger.info("exchange withdraw " + " failed !!");
    }
  }

  private void exchangeTransaction(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 4) {
      System.out.println("Use exchangeTransaction command with below syntax: ");
      System.out.println("exchangeTransaction exchange_id token_id quant expected");
      return;
    }

    long exchangeId = Long.valueOf(parameters[0]);
    byte[] tokenId = parameters[1].getBytes();
    long quant = Long.valueOf(parameters[2]);
    long expected = Long.valueOf(parameters[3]);
    boolean result = walletApiWrapper.exchangeTransaction(exchangeId, tokenId, quant, expected);
    if (result) {
      logger.info("exchange Transaction " + " successful !!");
    } else {
      logger.info("exchange Transaction " + " failed !!");
    }
  }

  private void listExchanges() {
    Optional<ExchangeList> result = walletApiWrapper.getExchangeList();
    if (result.isPresent()) {
      ExchangeList exchangeList = result.get();
      logger.info(Utils.printExchangeList(exchangeList));
    } else {
      logger.info("List exchanges " + " failed !!");
    }
  }

  private void getExchange(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getExchange needs 1 parameter like following: ");
      System.out.println("getExchange id ");
      return;
    }
    String id = parameters[0];

    Optional<Exchange> result = walletApiWrapper.getExchange(id);
    if (result.isPresent()) {
      Exchange exchange = result.get();
      logger.info(Utils.printExchange(exchange));
    } else {
      logger.info("getExchange " + " failed !!");
    }
  }

  private void withdrawBalance() throws IOException, CipherException, CancelException {
    boolean result = walletApiWrapper.withdrawBalance();
    if (result) {
      logger.info("withdrawBalance " + " successful !!");
    } else {
      logger.info("withdrawBalance " + " failed !!");
    }
  }

  private void getTotalTransaction() {
    NumberMessage totalTransition = walletApiWrapper.getTotalTransaction();
    logger.info("The num of total transactions is : " + totalTransition.getNum());
  }

  private void getNextMaintenanceTime() {
    NumberMessage nextMaintenanceTime = walletApiWrapper.getNextMaintenanceTime();
    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    String date = formatter.format(nextMaintenanceTime.getNum());
    logger.info("Next maintenance time is : " + date);
  }

//  private void getAssetIssueListByTimestamp(String[] parameters) {
//    long timeStamp = -1;
//    if (parameters == null || parameters.length == 0) {
//      System.out.println("no time input, use current time");
//      timeStamp = System.currentTimeMillis();
//    } else {
//      if (parameters.length != 2) {
//        System.out.println("You can GetAssetIssueListByTimestamp like:");
//        System.out.println("GetAssetIssueListByTimestamp yyyy-mm-dd hh:mm:ss");
//        return;
//      } else {
//        timeStamp = Timestamp.valueOf(parameters[0] + " " + parameters[1]).getTime();
//      }
//    }
//    Optional<AssetIssueList> result = WalletApi.getAssetIssueListByTimestamp(timeStamp);
//    if (result.isPresent()) {
//      AssetIssueList assetIssueList = result.get();
//      logger.info(Utils.printAssetIssueList(assetIssueList));
//    } else {
//      logger.info("GetAssetIssueListByTimestamp " + " failed !!");
//    }
//  }

//  private void getTransactionsByTimestamp(String[] parameters) {
//    String start = "";
//    String end = "";
//    if (parameters == null || parameters.length != 6) {
//      System.out.println(
//          "getTransactionsByTimestamp needs 4 parameters, start_time and end_time, time format is yyyy-mm-dd hh:mm:ss, offset and limit");
//      return;
//    } else {
//      start = parameters[0] + " " + parameters[1];
//      end = parameters[2] + " " + parameters[3];
//    }
//    long startTime = Timestamp.valueOf(start).getTime();
//    long endTime = Timestamp.valueOf(end).getTime();
//    int offset = Integer.parseInt(parameters[4]);
//    int limit = Integer.parseInt(parameters[5]);
//    Optional<TransactionList> result = WalletApi
//        .getTransactionsByTimestamp(startTime, endTime, offset, limit);
//    if (result.isPresent()) {
//      TransactionList transactionList = result.get();
//      logger.info(Utils.printTransactionList(transactionList));
//    } else {
//      logger.info("getTransactionsByTimestamp " + " failed !!");
//    }
//  }

//  private void getTransactionsByTimestampCount(String[] parameters) {
//    String start = "";
//    String end = "";
//    if (parameters == null || parameters.length != 4) {
//      System.out.println(
//          "getTransactionsByTimestampCount needs 2 parameters, start_time and end_time, time format is yyyy-mm-dd hh:mm:ss");
//      return;
//    } else {
//      start = parameters[0] + " " + parameters[1];
//      end = parameters[2] + " " + parameters[3];
//    }
//    long startTime = Timestamp.valueOf(start).getTime();
//    long endTime = Timestamp.valueOf(end).getTime();
//
//    NumberMessage result = WalletApi.getTransactionsByTimestampCount(startTime, endTime);
//    logger.info("the number of Transactions from " + start + " to " + end + " is " + result);
//  }

  private void getTransactionById(String[] parameters) {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("getTransactionById needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Optional<Transaction> result = WalletApi.getTransactionById(txid);
    if (result.isPresent()) {
      Transaction transaction = result.get();
      logger.info(Utils.printTransaction(transaction));
    } else {
      logger.info("getTransactionById " + " failed !!");
    }
  }

  private void getTransactionInfoById(String[] parameters) {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("getTransactionInfoById needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Optional<TransactionInfo> result = WalletApi.getTransactionInfoById(txid);
    if (result.isPresent()) {
      TransactionInfo transactionInfo = result.get();
      logger.info(Utils.printTransactionInfo(transactionInfo));
    } else {
      logger.info("getTransactionInfoById " + " failed !!");
    }
  }

  private void getTransactionsFromThis(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("GetTransactionsFromThis needs 3 parameters, use the following syntax: ");
      System.out.println("GetTransactionsFromThis Address offset limit");
      return;
    }
    String address = parameters[0];
    int offset = Integer.parseInt(parameters[1]);
    int limit = Integer.parseInt(parameters[2]);
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    if (WalletApi.getRpcVersion() == 2) {
      Optional<TransactionListExtention> result = WalletApi
          .getTransactionsFromThis2(addressBytes, offset, limit);
      if (result.isPresent()) {
        TransactionListExtention transactionList = result.get();
        if (transactionList.getTransactionCount() == 0) {
          System.out.println("No transaction from " + address);
          return;
        }
        System.out.println(Utils.printTransactionList(transactionList));
      } else {
        System.out.println("GetTransactionsFromThis " + " failed !!");
      }
    } else {
      Optional<TransactionList> result = WalletApi
          .getTransactionsFromThis(addressBytes, offset, limit);
      if (result.isPresent()) {
        TransactionList transactionList = result.get();
        if (transactionList.getTransactionCount() == 0) {
          System.out.println("No transaction from " + address);
          return;
        }
        System.out.println(Utils.printTransactionList(transactionList));
      } else {
        System.out.println("GetTransactionsFromThis " + " failed !!");
      }
    }
  }

  private void getTransactionsToThis(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("getTransactionsToThis needs 3 parameters, use the following syntax: ");
      System.out.println("getTransactionsToThis Address offset limit");
      return;
    }
    String address = parameters[0];
    int offset = Integer.parseInt(parameters[1]);
    int limit = Integer.parseInt(parameters[2]);
    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
    if (addressBytes == null) {
      return;
    }

    if (WalletApi.getRpcVersion() == 2) {
      Optional<TransactionListExtention> result = WalletApi
          .getTransactionsToThis2(addressBytes, offset, limit);
      if (result.isPresent()) {
        TransactionListExtention transactionList = result.get();
        if (transactionList.getTransactionCount() == 0) {
          System.out.println("No transaction to " + address);
          return;
        }
        System.out.println(Utils.printTransactionList(transactionList));
      } else {
        System.out.println("getTransactionsToThis " + " failed !!");
      }
    } else {
      Optional<TransactionList> result = WalletApi
          .getTransactionsToThis(addressBytes, offset, limit);
      if (result.isPresent()) {
        TransactionList transactionList = result.get();
        if (transactionList.getTransactionCount() == 0) {
          System.out.println("No transaction to " + address);
          return;
        }
        System.out.println(Utils.printTransactionList(transactionList));
      } else {
        System.out.println("getTransactionsToThis " + " failed !!");
      }
    }
  }

//  private void getTransactionsToThisCount(String[] parameters) {
//    if (parameters == null || parameters.length != 1) {
//      System.out.println("getTransactionsToThisCount need 1 parameter like following: ");
//      System.out.println("getTransactionsToThisCount Address");
//      return;
//    }
//    String address = parameters[0];
//    byte[] addressBytes = WalletApi.decodeFromBase58Check(address);
//    if (addressBytes == null) {
//      return;
//    }
//
//    NumberMessage result = WalletApi.getTransactionsToThisCount(addressBytes);
//    logger.info("the number of Transactions to account " + address + " is " + result);
//  }

  private void getBlockById(String[] parameters) {
    String blockID = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("getBlockById needs 1 parameter, block id which is hex format");
      return;
    } else {
      blockID = parameters[0];
    }
    Optional<Block> result = WalletApi.getBlockById(blockID);
    if (result.isPresent()) {
      Block block = result.get();
      logger.info(Utils.printBlock(block));
    } else {
      logger.info("getBlockById " + " failed !!");
    }
  }

  private void getBlockByLimitNext(String[] parameters) {
    long start = 0;
    long end = 0;
    if (parameters == null || parameters.length != 2) {
      System.out
          .println("GetBlockByLimitNext needs 2 parameters, start block id and end block id");
      return;
    } else {
      start = Long.parseLong(parameters[0]);
      end = Long.parseLong(parameters[1]);
    }

    if (WalletApi.getRpcVersion() == 2) {
      Optional<BlockListExtention> result = WalletApi.getBlockByLimitNext2(start, end);
      if (result.isPresent()) {
        BlockListExtention blockList = result.get();
        System.out.println(Utils.printBlockList(blockList));
      } else {
        System.out.println("GetBlockByLimitNext " + " failed !!");
      }
    } else {
      Optional<BlockList> result = WalletApi.getBlockByLimitNext(start, end);
      if (result.isPresent()) {
        BlockList blockList = result.get();
        System.out.println(Utils.printBlockList(blockList));
      } else {
        System.out.println("GetBlockByLimitNext " + " failed !!");
      }
    }
  }

  private void getBlockByLatestNum(String[] parameters) {
    long num = 0;
    if (parameters == null || parameters.length != 1) {
      System.out.println("getBlockByLatestNum needs 1 parameter, block num");
      return;
    } else {
      num = Long.parseLong(parameters[0]);
    }
    if (WalletApi.getRpcVersion() == 2) {
      Optional<BlockListExtention> result = WalletApi.getBlockByLatestNum2(num);
      if (result.isPresent()) {
        BlockListExtention blockList = result.get();
        if (blockList.getBlockCount() == 0) {
          System.out.println("No block");
          return;
        }
        System.out.println(Utils.printBlockList(blockList));
      } else {
        System.out.println("GetBlockByLimitNext " + " failed !!");
      }
    } else {
      Optional<BlockList> result = WalletApi.getBlockByLatestNum(num);
      if (result.isPresent()) {
        BlockList blockList = result.get();
        if (blockList.getBlockCount() == 0) {
          System.out.println("No block");
          return;
        }
        System.out.println(Utils.printBlockList(blockList));
      } else {
        System.out.println("GetBlockByLimitNext " + " failed !!");
      }
    }
  }

  private void updateSetting(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null ||
        parameters.length < 2) {
      System.out.println("updateSetting needs 2 parameters like following: ");
      System.out.println("updateSetting contract_address consume_user_resource_percent");
      return;
    }

    byte[] contractAddress = WalletApi.decodeFromBase58Check(parameters[0]);
    long consumeUserResourcePercent = Long.valueOf(parameters[1]).longValue();
    if (consumeUserResourcePercent > 100 || consumeUserResourcePercent < 0) {
      System.out.println("consume_user_resource_percent must >= 0 and <= 100");
      return;
    }
    boolean result = walletApiWrapper.updateSetting(contractAddress, consumeUserResourcePercent);
    if (result) {
      System.out.println("update setting successfully");
    } else {
      System.out.println("update setting failed");
    }
  }

  private void updateEnergyLimit(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null ||
        parameters.length < 2) {
      System.out.println("updateEnergyLimit needs 2 parameters like following: ");
      System.out.println("updateEnergyLimit contract_address energy_limit");
      return;
    }

    byte[] contractAddress = WalletApi.decodeFromBase58Check(parameters[0]);
    long originEnergyLimit = Long.valueOf(parameters[1]).longValue();
    if (originEnergyLimit < 0) {
      System.out.println("origin_energy_limit need > 0 ");
      return;
    }
    boolean result = walletApiWrapper.updateEnergyLimit(contractAddress, originEnergyLimit);
    if (result) {
      System.out.println("update setting for origin_energy_limit successfully");
    } else {
      System.out.println("update setting for origin_energy_limit failed");
    }
  }

  private String[] getParas(String[] para) {
    String paras = String.join(" ", para);
    Pattern pattern = Pattern.compile(" (\\[.*?\\]) ");
    Matcher matcher = pattern.matcher(paras);

    if (matcher.find()) {
      String ABI = matcher.group(1);
      List<String> tempList = new ArrayList<String>();

      paras = paras.replaceAll("(\\[.*?\\]) ", "");

      String[] parts = paras.split(" ");
      for (int i = 0; i < parts.length; i++) {
        if (1 == i) {
          tempList.add(ABI);
        }
        tempList.add(parts[i]);
      }
      return tempList.toArray(new String[0]);

    } else {
      return null;
    }

  }

  private void deployContract(String[] parameter)
      throws IOException, CipherException, CancelException, EncodingException {

    String[] parameters = getParas(parameter);
    if (parameters == null ||
        parameters.length < 11) {
      System.out.println("DeployContract needs at least 8 parameters like following: ");
      System.out.println(
          "DeployContract contractName ABI byteCode constructor params isHex fee_limit consume_user_resource_percent origin_energy_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided) <library:address,library:address,...>");
      System.out.println(
          "Note: Please append the param for constructor tightly with byteCode without any space");
      return;
    }
    int idx = 0;
    String contractName = parameters[idx++];
    String abiStr = parameters[idx++];
    String codeStr = parameters[idx++];
    String constructorStr = parameters[idx++];
    String argsStr = parameters[idx++];
    boolean isHex = Boolean.parseBoolean(parameters[idx++]);
    long feeLimit = Long.parseLong(parameters[idx++]);
    long consumeUserResourcePercent = Long.parseLong(parameters[idx++]);
    long originEnergyLimit = Long.parseLong(parameters[idx++]);
    if (consumeUserResourcePercent > 100 || consumeUserResourcePercent < 0) {
      System.out.println("consume_user_resource_percent should be >= 0 and <= 100");
      return;
    }
    if (originEnergyLimit <= 0) {
      System.out.println("origin_energy_limit must > 0");
      return;
    }
    if (!constructorStr.equals("#")) {
      if (isHex) {
        codeStr += argsStr;
      } else {
        codeStr += Hex.toHexString(AbiUtil.encodeInput(constructorStr, argsStr));
      }
    }
    long value = 0;
    value = Long.valueOf(parameters[idx++]);
    long tokenValue = Long.valueOf(parameters[idx++]);
    String tokenId = parameters[idx++];
    if (tokenId == "#") {
      tokenId = "";
    }
    String libraryAddressPair = null;
    if (parameters.length > idx) {
      libraryAddressPair = parameters[idx];
    }
    // TODO: consider to remove "data"
    /* Consider to move below null value, since we append the constructor param just after bytecode without any space.
     * Or we can re-design it to give other developers better user experience. Set this value in protobuf as null for now.
     */
    boolean result = walletApiWrapper.deployContract(contractName, abiStr, codeStr, feeLimit, value,
        consumeUserResourcePercent, originEnergyLimit, tokenValue, tokenId, libraryAddressPair);
    if (result) {
      System.out.println("Broadcast the createSmartContract successfully.\n"
          + "Please check the given transaction id to confirm deploy status on blockchain using getTransactionInfoById command.");
    } else {
      System.out.println("Broadcast the createSmartContract failed");
    }
  }

  private void triggerContract(String[] parameters)
      throws IOException, CipherException, CancelException, EncodingException {
    if (parameters == null ||
        parameters.length < 8) {
      System.out.println("TriggerContract needs 6 parameters like following: ");
      System.out.println(
          "TriggerContract contractAddress method args isHex fee_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided)");
      // System.out.println("example:\nTriggerContract password contractAddress method args value");
      return;
    }

    String contractAddrStr = parameters[0];
    String methodStr = parameters[1];
    String argsStr = parameters[2];
    boolean isHex = Boolean.valueOf(parameters[3]);
    long feeLimit = Long.valueOf(parameters[4]);
    long callValue = Long.valueOf(parameters[5]);
    long tokenCallValue = Long.valueOf(parameters[6]);
    String tokenId = parameters[7];
    if (argsStr.equalsIgnoreCase("#")) {
      argsStr = "";
    }
    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, isHex));
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddrStr);

    boolean result = walletApiWrapper
        .callContract(contractAddress, callValue, input, feeLimit, tokenCallValue, tokenId);
    if (result) {
      System.out.println("Broadcast the triggerContract successfully.\n"
          + "Please check the given transaction id to get the result on blockchain using getTransactionInfoById command");
    } else {
      System.out.println("Broadcast the triggerContract failed");
    }
  }

  private void getContract(String[] parameters) {
    if (parameters == null ||
        parameters.length != 1) {
      System.out.println("GetContract needs 1 parameter like following: ");
      System.out.println("GetContract contractAddress");
      return;
    }

    byte[] addressBytes = WalletApi.decodeFromBase58Check(parameters[0]);
    if (addressBytes == null) {
      System.out.println("GetContract: invalid address!");
      return;
    }

    SmartContract contractDeployContract = WalletApi.getContract(addressBytes);
    if (contractDeployContract != null) {
      System.out.println("contract :" + contractDeployContract.getAbi().toString());
      System.out.println("contract owner:" + WalletApi.encode58Check(contractDeployContract
          .getOriginAddress().toByteArray()));
      System.out.println("contract ConsumeUserResourcePercent:" + contractDeployContract
          .getConsumeUserResourcePercent());
      System.out.println("contract energy limit:" + contractDeployContract
          .getOriginEnergyLimit());
    } else {
      System.out.println("query contract failed!");
    }
  }

  private void generateAddress() {
    AddressPrKeyPairMessage result = walletApiWrapper.generateAddress();
    if (null != result) {
      System.out.println("Address: " + result.getAddress());
      System.out.println("PrivateKey: " + result.getPrivateKey());
      logger.info("GenerateAddress " + " successful !!");
    } else {
      logger.info("GenerateAddress " + " failed !!");
    }
  }

  private void help() {
    System.out.println("Help: List of Tron Wallet-cli commands");
    System.out.println(
        "For more information on a specific command, type the command and it will display tips");
    System.out.println("");
    System.out.println("ApproveProposal");
    System.out.println("AssetIssue");
    System.out.println("BackupWallet");
    System.out.println("BackupWallet2Base64");
    System.out.println("ChangePassword");
    System.out.println("CreateAccount");
    System.out.println("CreateProposal");
    System.out.println("CreateWitness");
    System.out.println("DeleteProposal");
    System.out.println(
        "DeployContract contractName ABI byteCode constructor params isHex fee_limit consume_user_resource_percent origin_energy_limit value token_value token_id <library:address,library:address,...>");
    System.out.println("ExchangeCreate");
    System.out.println("ExchangeInject");
    System.out.println("ExchangeTransaction");
    System.out.println("ExchangeWithdraw");
    System.out.println("FreezeBalance");
    System.out.println("GenerateAddress");
    System.out.println("GetAccount");
    System.out.println("GetAccountNet");
    System.out.println("GetAccountResource");
    System.out.println("GetAddress");
    System.out.println("GetAssetIssueByAccount");
    System.out.println("GetAssetIssueById");
    System.out.println("GetAssetIssueByName");
    System.out.println("GetAssetIssueListByName");
    System.out.println("GetBalance");
    System.out.println("GetBlock");
    System.out.println("GetBlockById");
    System.out.println("GetBlockByLatestNum");
    System.out.println("GetBlockByLimitNext");
    System.out.println("GetContract contractAddress");
    System.out.println("GetDelegatedResource");
    System.out.println("GetDelegatedResourceAccountIndex");
    System.out.println("GetDefferedTransactionById");
    System.out.println("GetExchange");
    System.out.println("GetNextMaintenanceTime");
    System.out.println("GetProposal");
    System.out.println("GetTotalTransaction");
    System.out.println("GetTransactionById");
    System.out.println("GetTransactionCountByBlockNum");
    System.out.println("GetTransactionInfoById");
    System.out.println("GetTransactionsFromThis");
    System.out.println("GetTransactionsToThis");
    System.out.println("ImportWallet");
    System.out.println("ImportWalletByBase64");
    System.out.println("ListAssetIssue");
    System.out.println("ListExchanges");
    System.out.println("ListExchangesPaginated");
    System.out.println("ListNodes");
    System.out.println("ListProposals");
    System.out.println("ListProposalsPaginated");
    System.out.println("ListWitnesses");
    System.out.println("Login");
    System.out.println("Logout");
    System.out.println("ParticipateAssetIssue");
    System.out.println("RegisterWallet");
    System.out.println("SendCoin");
    System.out.println("CancelDefferedTransaction");
    System.out.println("SetAccountId");
    System.out.println("TransferAsset");
    System.out.println("TriggerContract contractAddress method args isHex fee_limit value");
    System.out.println("UnfreezeAsset");
    System.out.println("UnfreezeBalance");
    System.out.println("UnfreezeAsset");
    System.out.println("UpdateAccount");
    System.out.println("UpdateAsset");
    System.out.println("UpdateEnergyLimit contract_address energy_limit");
    System.out.println("UpdateSetting contract_address consume_user_resource_percent");
    System.out.println("UpdateWitness");
    System.out.println("VoteWitness");
    System.out.println("WithdrawBalance");
//    System.out.println("buyStorage");
//    System.out.println("buyStorageBytes");
//    System.out.println("sellStorage");
//   System.out.println("GetAssetIssueListByTimestamp");
//   System.out.println("GetTransactionsByTimestamp");
//   System.out.println("GetTransactionsByTimestampCount");
//   System.out.println("GetTransactionsFromThisCount");
//   System.out.println("GetTransactionsToThisCount");
    System.out.println("Exit or Quit");

    System.out.println("Input any one of the listed commands, to display how-to tips.");
  }

  private String[] getCmd(String cmdLine) {
    if (cmdLine.indexOf("\"") < 0 || cmdLine.toLowerCase().startsWith("deploycontract")
        || cmdLine.toLowerCase().startsWith("triggercontract")) {
      return cmdLine.split("\\s+");
    }
    String[] strArray = cmdLine.split("\"");
    int num = strArray.length;
    int start = 0;
    int end = 0;
    if (cmdLine.charAt(0) == '\"') {
      start = 1;
    }
    if (cmdLine.charAt(cmdLine.length() - 1) == '\"') {
      end = 1;
    }
    if (((num + end) & 1) == 0) {
      return new String[]{"ErrorInput"};
    }

    List<String> cmdList = new ArrayList<>();
    for (int i = start; i < strArray.length; i++) {
      if ((i & 1) == 0) {
        cmdList.addAll(Arrays.asList(strArray[i].trim().split("\\s+")));
      } else {
        cmdList.add(strArray[i].trim());
      }
    }
    Iterator ito = cmdList.iterator();
    while (ito.hasNext()) {
      if (ito.next().equals("")) {
        ito.remove();
      }
    }
    String[] result = new String[cmdList.size()];
    return cmdList.toArray(result);
  }

  private void run() {
    Scanner in = new Scanner(System.in);
    System.out.println(" ");
    System.out.println("Welcome to Tron Wallet-Cli");
    System.out.println("Please type one of the following commands to proceed.");
    System.out.println("Login, RegisterWallet or ImportWallet");
    System.out.println(" ");
    System.out.println(
        "You may also use the Help command at anytime to display a full list of commands.");
    System.out.println(" ");
    while (in.hasNextLine()) {
      String cmd = "";
      try {
        String cmdLine = in.nextLine().trim();
        String[] cmdArray = getCmd(cmdLine);
        // split on trim() string will always return at the minimum: [""]
        cmd = cmdArray[0];
        if ("".equals(cmd)) {
          continue;
        }
        String[] parameters = Arrays.copyOfRange(cmdArray, 1, cmdArray.length);
        String cmdLowerCase = cmd.toLowerCase();

        switch (cmdLowerCase) {
          case "help": {
            help();
            break;
          }
          case "registerwallet": {
            registerWallet();
            break;
          }
          case "importwallet": {
            importWallet();
            break;
          }
          case "importwalletbybase64": {
            importwalletByBase64();
            break;
          }
          case "changepassword": {
            changePassword();
            break;
          }
          case "login": {
            login();
            break;
          }
          case "logout": {
            logout();
            break;
          }
          case "backupwallet": {
            backupWallet();
            break;
          }
          case "backupwallet2base64": {
            backupWallet2Base64();
            break;
          }
          case "getaddress": {
            getAddress();
            break;
          }
          case "getbalance": {
            getBalance();
            break;
          }
          case "getaccount": {
            getAccount(parameters);
            break;
          }
          case "getaccountbyid": {
            getAccountById(parameters);
            break;
          }
          case "updateaccount": {
            updateAccount(parameters);
            break;
          }
          case "setaccountid": {
            setAccountId(parameters);
            break;
          }
          case "updateasset": {
            updateAsset(parameters);
            break;
          }
          case "getassetissuebyaccount": {
            getAssetIssueByAccount(parameters);
            break;
          }
          case "getaccountnet": {
            getAccountNet(parameters);
            break;
          }
          case "getaccountresource": {
            getAccountResource(parameters);
            break;
          }
          case "getassetissuebyname": {
            getAssetIssueByName(parameters);
            break;
          }
          case "getassetissuelistbyname": {
            getAssetIssueListByName(parameters);
            break;
          }
          case "getassetissuebyid": {
            getAssetIssueById(parameters);
            break;
          }
          case "sendcoin": {
            sendCoin(parameters);
            break;
          }
          case "canceldefferedtransaction": {
            cancelDefferedTransaction(parameters);
            break;
          }

          case "testtransaction": {
            testTransaction(parameters);
            break;
          }
          case "transferasset": {
            transferAsset(parameters);
            break;
          }
          case "participateassetissue": {
            participateAssetIssue(parameters);
            break;
          }
          case "assetissue": {
            assetIssue(parameters);
            break;
          }
          case "createaccount": {
            createAccount(parameters);
            break;
          }
          case "createwitness": {
            createWitness(parameters);
            break;
          }
          case "updatewitness": {
            updateWitness(parameters);
            break;
          }
          case "votewitness": {
            voteWitness(parameters);
            break;
          }
          case "freezebalance": {
            freezeBalance(parameters);
            break;
          }
          case "unfreezebalance": {
            unfreezeBalance(parameters);
            break;
          }
          case "buystorage": {
            buyStorage(parameters);
            break;
          }
          case "buystoragebytes": {
            buyStorageBytes(parameters);
            break;
          }
          case "sellstorage": {
            sellStorage(parameters);
            break;
          }
          case "withdrawbalance": {
            withdrawBalance();
            break;
          }
          case "unfreezeasset": {
            unfreezeAsset();
            break;
          }
          case "createproposal": {
            createProposal(parameters);
            break;
          }
          case "approveproposal": {
            approveProposal(parameters);
            break;
          }
          case "deleteproposal": {
            deleteProposal(parameters);
            break;
          }
          case "listproposals": {
            listProposals();
            break;
          }
          case "listproposalspaginated": {
            getProposalsListPaginated(parameters);
            break;
          }
          case "getproposal": {
            getProposal(parameters);
            break;
          }
          case "getdelegatedresource": {
            getDelegatedResource(parameters);
            break;
          }
          case "getdelegatedresourceaccountindex": {
            getDelegatedResourceAccountIndex(parameters);
            break;
          }
          case "getdefferedtransactionbyid": {
            getDefferedTransactionbyid(parameters);
          }
          case "exchangecreate": {
            exchangeCreate(parameters);
            break;
          }
          case "exchangeinject": {
            exchangeInject(parameters);
            break;
          }
          case "exchangewithdraw": {
            exchangeWithdraw(parameters);
            break;
          }
          case "exchangetransaction": {
            exchangeTransaction(parameters);
            break;
          }
          case "listexchanges": {
            listExchanges();
            break;
          }
          case "listexchangespaginated": {
            getExchangesListPaginated(parameters);
            break;
          }
          case "getexchange": {
            getExchange(parameters);
            break;
          }
          case "getchainparameters": {
            getChainParameters();
            break;
          }
          case "listwitnesses": {
            listWitnesses();
            break;
          }
          case "listassetissue": {
            getAssetIssueList();
            break;
          }
          case "listassetissuepaginated": {
            getAssetIssueList(parameters);
            break;
          }
          case "listnodes": {
            listNodes();
            break;
          }
          case "getblock": {
            getBlock(parameters);
            break;
          }
          case "gettransactioncountbyblocknum": {
            getTransactionCountByBlockNum(parameters);
            break;
          }
          case "gettotaltransaction": {
            getTotalTransaction();
            break;
          }
          case "getnextmaintenancetime": {
            getNextMaintenanceTime();
            break;
          }
//          case "getassetissuelistbytimestamp": {
//            getAssetIssueListByTimestamp(parameters);
//            break;
//          }
//          case "gettransactionsbytimestampcount": {
//            getTransactionsByTimestampCount(parameters);
//            break;
//          }
          case "gettransactionsfromthis": {
            getTransactionsFromThis(parameters);
            break;
          }
//          case "gettransactionsfromthiscount": {
//            getTransactionsFromThisCount(parameters);
//            break;
//          }
          case "gettransactionstothis": {
            getTransactionsToThis(parameters);
            break;
          }
//          case "gettransactionstothiscount": {
//            getTransactionsToThisCount(parameters);
//            break;
//          }
//          case "gettransactionsbytimestamp": {
//            getTransactionsByTimestamp(parameters);
//            break;
//          }
          case "gettransactionbyid": {
            getTransactionById(parameters);
            break;
          }
          case "gettransactioninfobyid": {
            getTransactionInfoById(parameters);
            break;
          }
          case "getblockbyid": {
            getBlockById(parameters);
            break;
          }
          case "getblockbylimitnext": {
            getBlockByLimitNext(parameters);
            break;
          }
          case "getblockbylatestnum": {
            getBlockByLatestNum(parameters);
            break;
          }
          case "updatesetting": {
            updateSetting(parameters);
            break;
          }
          case "updateenergylimit": {
            updateEnergyLimit(parameters);
            break;
          }
          case "deploycontract": {
            deployContract(parameters);
            break;
          }
          case "triggercontract": {
            triggerContract(parameters);
            break;
          }
          case "getcontract": {
            getContract(parameters);
            break;
          }
          case "generateaddress": {
            generateAddress();
            break;
          }
          case "exit":
          case "quit": {
            System.out.println("Exit !!!");
            return;
          }
          default: {
            System.out.println("Invalid cmd: " + cmd);
            help();
          }
        }
      } catch (CipherException e) {
        System.out.println(cmd + " failed!");
        System.out.println(e.getMessage());
      } catch (IOException e) {
        System.out.println(cmd + " failed!");
        System.out.println(e.getMessage());
      } catch (CancelException e) {
        System.out.println(cmd + " failed!");
        System.out.println(e.getMessage());
      } catch (Exception e) {
        System.out.println(cmd + " failed!");
        logger.error(e.getMessage());
        e.printStackTrace();
      }
    }
  }

  private void getChainParameters() {
    Optional<ChainParameters> result = walletApiWrapper.getChainParameters();
    if (result.isPresent()) {
      ChainParameters chainParameters = result.get();
      logger.info(Utils.printChainParameters(chainParameters));
    } else {
      logger.info("List witnesses " + " failed !!");
    }
  }

  public static void main(String[] args) {
    Client cli = new Client();
    JCommander.newBuilder()
        .addObject(cli)
        .build()
        .parse(args);

    cli.run();
  }
}
