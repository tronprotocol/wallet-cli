package org.tron.walletcli;

import com.beust.jcommander.JCommander;
import com.google.protobuf.ByteString;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.tron.api.GrpcAPI.AccountList;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;

import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.Scanner;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.BlockHeader;
import org.tron.protos.Protocol.BlockHeader.raw;
import org.tron.walletserver.WalletClient;

public class TestClient {

  private static final Logger logger = LoggerFactory.getLogger("TestClient");
  private Client client = new Client();

  private void registerWallet(String[] parameters) {
    if (parameters == null || parameters.length != 2 ) {
      System.out.println("RegisterWallet need 2 parameter like following: ");
      System.out.println("RegisterWallet UserName Password");
      return;
    }
    String userName = parameters[0];
    String password = parameters[1];

    if (client.registerWallet(userName, password)) {
      logger.info("Register a wallet and store it successful !!");
    } else {
      logger.info("Register wallet failed !!");
    }
  }

  private void importWallet(String[] parameters) {
    if (parameters == null || parameters.length != 2 ) {
      System.out.println("ImportWallet need 2 parameter like following: ");
      System.out.println("ImportWallet Password PriKey");
      System.out.println("PriKey need Hex string format.");
      return;
    }
    String password = parameters[0];
    String priKey = parameters[1];

    if (client.importWallet(password, priKey)) {
      logger.info("Import a wallet and store it successful !!");
    } else {
      logger.info("Import a wallet failed !!");
    }
  }

  private void changePassword(String[] parameters) {
    if (parameters == null || parameters.length != 2 ) {
      System.out.println("ChangePassword need 2 parameter like following: ");
      System.out.println("ChangePassword OldPassword NewPassword ");
      return;
    }
    String oldPassword = parameters[0];
    String newPassword = parameters[1];
    if (client.changePassword(oldPassword, newPassword)) {
      logger.info("ChangePassword successful !!");
    } else {
      logger.info("ChangePassword failed !!");
    }
  }

  private void login(String[] parameters) {
    if (parameters == null || parameters.length != 2 ) {
      System.out.println("Login need 1 parameter like following: ");
      System.out.println("Login Password ");
      return;
    }
    String password = parameters[0];

    boolean result = client.login(password);
    if (result) {
      logger.info("Login successful !!!");
    } else {
      logger.info("Login failed !!!");
    }
  }

  private void logout(String[] parameters) {
    if (parameters != null && parameters.length != 0) {
      System.out.println("Logout needn't parameter, just like following: ");
      System.out.println("Logout ");
      return;
    }

    client.logout();
    logger.info("Logout successful !!!");
  }

  private void backupWallet(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: BackupWallet need 2 parameters but get nothing");
      return;
    }
    if (parameters.length != 2 && parameters.length != 1) {
      logger.warn("Warning: BackupWallet need 1 or 2 parameters but get " + parameters.length);
      return;
    }
    String password = parameters[0];
    String password2;
    if (parameters.length == 2) {
      password2 = parameters[1];
    } else {
      password2 = parameters[0];    //same password
    }

    String priKey = client.backupWallet(password, password2);
    if (priKey != null) {
      logger.info("Backup a wallet successful !!");
      logger.info("priKey = " + priKey);
    }
  }

  private void getAddress(String[] parameters) {
    if (parameters != null && parameters.length != 0) {
      logger.warn("Warning: GetAddress needn't parameter but get " + parameters.length);
      return;
    }

    String address = client.getAddress();
    if (address != null) {
      logger.info("GetAddress successful !!");
      logger.info("address = " + address);
    }
  }

  private void getBalance(String[] parameters) {
    if (parameters != null && parameters.length != 0) {
      logger.warn("Warning: GetBalance needn't parameter but get " + parameters.length);
      return;
    }
    Account account = client.queryAccount();
    if (account == null) {
      logger.info("Get Balance failed !!!!");

    } else {
      long balance = account.getBalance();
      logger.info("Balance = " + balance);
    }
  }

  private void getAccount(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: GetAccount need 1 parameters but get nothing");
      return;
    }
    if (parameters.length != 1) {
      logger.warn("Warning: GetAccount need 1 parameters but get " + parameters.length);
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = ByteArray.fromHexString(address);
    Account account = WalletClient.queryAccount(addressBytes);
    if (account == null) {
      logger.info("Get Account failed !!!!");

    } else {
      logger.info("Account[" + account + "]");
    }
  }

  private void getAssetIssueByAccount(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: GetAssetIssueByAccount need 1 parameters but get nothing");
      return;
    }
    if (parameters.length != 1) {
      logger.warn("Warning: GetAssetIssueByAccount need 1 parameters but get " + parameters.length);
      return;
    }
    String address = parameters[0];
    byte[] addressBytes = ByteArray.fromHexString(address);
    Optional<AssetIssueList> result = WalletClient.getAssetIssueByAccount(addressBytes);
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info("assetIssueList[" + assetIssueList.getAssetIssueList() + "]");

    } else {
      logger.info("GetAssetIssueByAccount " + " failed !!");
    }
  }

  private void sendCoin(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: SendCoin need 3 parameters but get nothing");
      return;
    }
    if (parameters.length != 3) {
      logger.warn("Warning: SendCoin need 3 parameters but get " + parameters.length);
      return;
    }
    String password = parameters[0];
    String toAddress = parameters[1];
    String amountStr = parameters[2];
    long amount = new Long(amountStr);

    boolean result = client.sendCoin(password, toAddress, amount);
    if (result) {
      logger.info("Send " + amount + " dron to " + toAddress + " successful !!");
    } else {
      logger.info("Send " + amount + " dron to " + toAddress + " failed !!");
    }
  }

  private void transferAsset(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: TransferAsset need 4 parameters but get nothing");
      return;
    }
    if (parameters.length != 4) {
      logger.warn("Warning: TransferAsset need 4 parameters but get " + parameters.length);
      return;
    }

    String password = parameters[0];
    String toAddress = parameters[1];
    String assertName = parameters[2];
    String amountStr = parameters[3];
    long amount = new Long(amountStr);

    boolean result = client.transferAsset(password, toAddress, assertName, amount);
    if (result) {
      logger.info("TransferAsset " + amount + " to " + toAddress + " successful !!");
    } else {
      logger.info("TransferAsset " + amount + " to " + toAddress + " failed !!");
    }
  }

  private void participateAssetIssue(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: ParticipateAssetIssue need 4 parameters but get nothing");
      return;
    }
    if (parameters.length != 4) {
      logger.warn("Warning: ParticipateAssetIssue need 4 parameters but get " + parameters.length);
      return;
    }

    String password = parameters[0];
    String toAddress = parameters[1];
    String assertName = parameters[2];
    String amountStr = parameters[3];
    long amount = new Integer(amountStr);
    boolean result = client.participateAssetIssue(password, toAddress, assertName, amount);
    if (result) {
      logger.info("ParticipateAssetIssue " + assertName + " " + amount + " from " + toAddress
          + " successful !!");
    } else {
      logger.info("ParticipateAssetIssue " + assertName + " " + amount + " from " + toAddress
          + " failed !!");
    }
  }

  private void assetIssue(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: assetIssue need 10 parameters but get nothing");
      return;
    }
    if (parameters.length != 10) {
      logger.warn("Warning: assetIssue need 10 parameters but get " + parameters.length);
      return;
    }

    String password = parameters[0];
    String name = parameters[1];
    String totalSupplyStr = parameters[2];
    String trxNumStr = parameters[3];
    String icoNumStr = parameters[4];
    String stratYyyyMmDd = parameters[5];
    String endYyyyMmDd = parameters[6];
    String decayRatioStr = parameters[7];
    String description = parameters[8];
    String url = parameters[9];
    long totalSupply = new Long(totalSupplyStr);
    int trxNum = new Integer(trxNumStr);
    int icoNum = new Integer(icoNumStr);
    Date startDate = Utils.strToDateLong(stratYyyyMmDd);
    Date endDate = Utils.strToDateLong(endYyyyMmDd);
    long startTime = startDate.getTime();
    long endTime = endDate.getTime();
    int decayRatio = new Integer(decayRatioStr);

    boolean result = client
        .assetIssue(password, name, totalSupply, trxNum, icoNum, startTime, endTime, decayRatio, 0,
            description, url);
    if (result) {
      logger.info("AssetIssue " + name + " successful !!");
    } else {
      logger.info("AssetIssue " + name + " failed !!");
    }
  }

  private void createWitness(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: createWitness need 2 parameters but get nothing");
      return;
    }
    if (parameters.length != 2) {
      logger.warn("Warning: createWitness need 2 parameters but get " + parameters.length);
      return;
    }

    String password = parameters[0];
    String url = parameters[1];

    boolean result = client.createWitness(password, url);
    if (result) {
      logger.info("CreateWitness " + " successful !!");
    } else {
      logger.info("CreateWitness " + " failed !!");
    }
  }

  private void listAccounts() {
    Optional<AccountList> result = client.listAccounts();
    if (result.isPresent()) {
      AccountList accountList = result.get();
      logger.info("accountList[" + accountList.getAccountsList() + "]");
      logger.info("List accounts " + " successful !!");
    } else {
      logger.info("List accounts " + " failed !!");
    }
  }

  private void listWitnesses() {
    Optional<WitnessList> result = client.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      logger.info("witnessList[" + witnessList.getWitnessesList() + "]");
      logger.info("List witnesses " + " successful !!");
    } else {
      logger.info("List witnesses " + " failed !!");
    }
  }

  private void getAssetIssueList() {
    Optional<AssetIssueList> result = client.getAssetIssueList();
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      logger.info("assetIssueList[" + assetIssueList.getAssetIssueList() + "]");

    } else {
      logger.info("GetAssetIssueList " + " failed !!");
    }
  }

  private void GetBlock(String[] parameters) {
    long blockNum = -1;

    if (parameters == null || parameters.length == 0) {
      logger.info("Get current block !!!!");
    } else {
      if (parameters.length != 1) {
        logger.info("Get block too many paramters !!!");
      }
      blockNum = Long.parseLong(parameters[0]);
    }
    Block block = client.GetBlock(blockNum);
    if (block == null) {
      logger.info("No block for num : " + blockNum);
      return;
    }
    int transactionCount = block.getTransactionsCount();
    BlockHeader header = block.getBlockHeader();
    raw data = header.getRawData();
    ByteString witnessAddress = data.getWitnessAddress();
    long witnessID = data.getWitnessId();
    ByteString parentHash = data.getParentHash();
    ByteString txTrieRoot = data.getTxTrieRoot();
    long blockNum1 = data.getNumber();

    logger.info("Block num is : " + blockNum1);
    logger.info("witnessID is : " + witnessID);
    logger.info("TransactionCount is : " + transactionCount);
    logger.info("ParentHash is : " + ByteArray.toHexString(parentHash.toByteArray()));
    logger.info("TxTrieRoot is : " + ByteArray.toHexString(txTrieRoot.toByteArray()));
    logger.info("WitnessAddress is : " + ByteArray.toHexString(witnessAddress.toByteArray()));
  }

  private void voteWitness(String[] parameters) {
    if (parameters == null) {
      logger.warn("Warning: voteWitness need parameters but get nothing");
      return;
    }
    if (parameters.length < 3 || (parameters.length & 1) != 1) {
      logger.warn(
          "Warning: voteWitness need an odd number of parameters but get " + parameters.length);
      return;
    }

    String password = parameters[0];
    HashMap<String, String> witness = new HashMap<String, String>();
    for (int i = 1; i < parameters.length; i += 2) {
      String address = parameters[i];
      String countStr = parameters[i + 1];
      witness.put(address, countStr);
    }

    boolean result = client.voteWitness(password, witness);
    if (result) {
      logger.info("VoteWitness " + " successful !!");
    } else {
      logger.info("VoteWitness " + " failed !!");
    }
  }

  private void run() {
    Scanner in = new Scanner(System.in);
    while (true) {
      String cmdLine = in.nextLine().trim();
      String[] cmdArray = cmdLine.split("\\s+");
      // split on trim() string will always return at the minimum: [""]
      String cmd = cmdArray[0];
      if ("".equals(cmd)) {
        continue;
      }
      String[] parameters = Arrays.copyOfRange(cmdArray, 1, cmdArray.length);
      String cmdLowerCase = cmd.toLowerCase();

      switch (cmdLowerCase) {
        case "registerwallet": {
          registerWallet(parameters);
          break;
        }
        case "importwallet": {
          importWallet(parameters);
          break;
        }
        case "changepassword": {
          changePassword(parameters);
          break;
        }
        case "login": {
          login(parameters);
          break;
        }
        case "logout": {
          logout(parameters);
          break;
        }
        case "backupwallet": {
          backupWallet(parameters);
          break;
        }
        case "getaddress": {
          getAddress(parameters);
          break;
        }
        case "getbalance": {
          getBalance(parameters);
          break;
        }
        case "getaccount": {
          getAccount(parameters);
          break;
        }
        case "getassetissuebyaccount": {
          getAssetIssueByAccount(parameters);
          break;
        }
        case "sendcoin": {
          sendCoin(parameters);
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
        case "createwitness": {
          createWitness(parameters);
          break;
        }
        case "votewitness": {
          voteWitness(parameters);
          break;
        }
        case "listaccounts": {
          listAccounts();
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
        case "getblock": {
          GetBlock(parameters);
          break;
        }
        case "exit":
        case "quit": {
          System.out.println("Exit !!!");
          return;
        }
        default: {
          System.out.println("Invalid cmd: " + cmd);
          System.out.println("You can enter the following command: ");

          System.out.println("RegisterWallet");
          System.out.println("ImportWallet");
          System.out.println("ChangePassword");
          System.out.println("Login");
          System.out.println("Logout");
          System.out.println("BackupWallet");
          System.out.println("Getaddress");
          System.out.println("GetBalance");
          System.out.println("GetAccount");
          System.out.println("GetAssetissueByAccount");
          System.out.println("SendCoin");
          System.out.println("TransferAsset");
          System.out.println("ParticipateAssetissue");
          System.out.println("Assetissue");
          System.out.println("CreateWitness");
          System.out.println("VoteWitness");
          System.out.println("Listaccounts");
          System.out.println("Listwitnesses");
          System.out.println("Listassetissue");
          System.out.println("Getblock");
          System.out.println("Exit or Quit");
        }
      }
    }
  }

  public static void main(String[] args) {
    TestClient cli = new TestClient();

    JCommander.newBuilder()
        .addObject(cli)
        .build()
        .parse(args);

    cli.run();
  }
}