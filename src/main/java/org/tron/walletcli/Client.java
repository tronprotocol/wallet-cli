package org.tron.walletcli;

import com.beust.jcommander.JCommander;
import com.google.common.primitives.Longs;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import io.netty.util.internal.StringUtil;
import org.apache.commons.lang3.ArrayUtils;
import org.bouncycastle.util.encoders.Hex;
import org.jline.reader.Completer;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.impl.completer.StringsCompleter;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.tron.api.GrpcAPI.*;
import org.tron.common.crypto.Hash;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.exception.EncodingException;
import org.tron.core.exception.ZksnarkException;
import org.tron.core.zen.ShieldedAddressInfo;
import org.tron.core.zen.ShieldedNoteInfo;
import org.tron.core.zen.ShieldedWrapper;
import org.tron.core.zen.ZenUtils;
import org.tron.keystore.StringUtils;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Protocol.*;
import org.tron.walletserver.WalletApi;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import java.util.Map.Entry;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public class Client {

  private WalletApiWrapper walletApiWrapper = new WalletApiWrapper();
  private static int retryTime = 3;

  // note: this is sorted by alpha
  private static String[] commandHelp = {
      "AddTransactionSign",
      "ApproveProposal",
      "AssetIssue",
      "BackupShieldedAddress",
      "BackupWallet",
      "BackupWallet2Base64",
      "BroadcastTransaction",
      "ChangePassword",
      "ClearContractABI",
      "Create2",
      "CreateAccount",
      "CreateProposal",
      "CreateWitness",
      "DeleteProposal",
      "DeployContract contractName ABI byteCode constructor params isHex fee_limit consume_user_resource_percent origin_energy_limit value token_value token_id <library:address,library:address,...> <lib_compiler_version(e.g:v5)>",
      "ExchangeCreate",
      "ExchangeInject",
      "ExchangeTransaction",
      "ExchangeWithdraw",
      "FreezeBalance",
      "GenerateAddress",
      "GenerateShieldedAddress",
      "GetAccount",
      "GetAccountNet",
      "GetAccountResource",
      "GetAddress",
      "GetAkFromAsk",
      "GetAssetIssueByAccount",
      "GetAssetIssueById",
      "GetAssetIssueByName",
      "GetAssetIssueListByName",
      "GetBalance",
      "GetBlock",
      "GetBlockById",
      "GetBlockByLatestNum",
      "GetBlockByLimitNext",
      "GetBrokerage",
      "GetChainParameters",
      "GetContract contractAddress",
      "GetDelegatedResource",
      "GetDelegatedResourceAccountIndex",
      "GetDiversifier",
      "GetExchange",
      "GetExpandedSpendingKey",
      "GetIncomingViewingKey",
      "GetMarketOrderByAccount",
      "GetMarketPriceByPair",
      "getMarketOrderListByPair",
      "getMarketPairList",
      "GetNextMaintenanceTime",
      "GetNkFromNsk",
      "GetProposal",
      "GetReward",
      "GetShieldedNullifier",
      "GetSpendingKey",
      "GetTotalTransaction",
      "GetTransactionApprovedList",
      "GetTransactionById",
      "GetTransactionCountByBlockNum",
      "GetTransactionInfoById",
      "GetTransactionSignWeight",
      "GetTransactionsFromThis",
      "GetTransactionsToThis",
      "ImportShieldedAddress",
      "ImportWallet",
      "ImportWalletByBase64",
      "ListAssetIssue",
      "ListAssetIssuePaginated",
      "ListExchanges",
      "ListExchangesPaginated",
      "ListNodes",
      "ListProposals",
      "ListProposalsPaginated",
      "ListShieldedAddress",
      "ListShieldedNote",
      "ListWitnesses",
      "LoadShieldedWallet",
      "Login",
      "Logout",
      "MarketCancelOrder",
      "MarketSellAsset",
      "ParticipateAssetIssue",
      "RegisterWallet",
      "ResetShieldedNote",
      "ScanAndMarkNotebyAddress",
      "ScanNotebyIvk",
      "ScanNotebyOvk",
      "SendCoin",
      "SendShieldedCoin",
      "SendShieldedCoinWithoutAsk",
      "SetAccountId",
      "TransferAsset",
      "TriggerConstantContract contractAddress method args isHex",
      "TriggerContract contractAddress method args isHex fee_limit value",
      "UnfreezeAsset",
      "UnfreezeBalance",
      "UpdateAccount",
      "UpdateAccountPermission",
      "UpdateAsset",
      "UpdateBrokerage",
      "UpdateEnergyLimit contract_address energy_limit",
      "UpdateSetting contract_address consume_user_resource_percent",
      "UpdateWitness",
      "VoteWitness",
      "WithdrawBalance",
  };

  // note: this is sorted by alpha
  private static String[] commandList = {
      "AddTransactionSign",
      "ApproveProposal",
      "AssetIssue",
      "BackupShieldedAddress",
      "BackupWallet",
      "BackupWallet2Base64",
      "BroadcastTransaction",
      "ChangePassword",
      "ClearContractABI",
      "Create2",
      "CreateAccount",
      "CreateProposal",
      "CreateWitness",
      "DeleteProposal",
      "DeployContract",
      "ExchangeCreate",
      "ExchangeInject",
      "ExchangeTransaction",
      "ExchangeWithdraw",
      "FreezeBalance",
      "GenerateAddress",
      "GenerateShieldedAddress",
      "GetAccount",
      "GetAccountNet",
      "GetAccountResource",
      "GetAddress",
      "GetAkFromAsk",
      "GetAssetIssueByAccount",
      "GetAssetIssueById",
      "GetAssetIssueByName",
      "GetAssetIssueListByName",
      "GetBalance",
      "GetBlock",
      "GetBlockById",
      "GetBlockByLatestNum",
      "GetBlockByLimitNext",
      "GetBrokerage",
      "GetChainParameters",
      "GetContract",
      "GetDelegatedResource",
      "GetDelegatedResourceAccountIndex",
      "GetDiversifier",
      "GetExchange",
      "GetExpandedSpendingKey",
      "GetIncomingViewingKey",
      "GetMarketOrderByAccount",
      "GetMarketPriceByPair",
      "GetNextMaintenanceTime",
      "GetNkFromNsk",
      "GetProposal",
      "GetReward",
      "GetShieldedNullifier",
      "GetSpendingKey",
      "GetTotalTransaction",
      "GetTransactionApprovedList",
      "GetTransactionById",
      "GetTransactionCountByBlockNum",
      "GetTransactionInfoById",
      "GetTransactionSignWeight",
      "GetTransactionsFromThis",
      "GetTransactionsToThis",
      "Help",
      "ImportShieldedAddress",
      "ImportWallet",
      "ImportWalletByBase64",
      "ListAssetIssue",
      "ListAssetIssuePaginated",
      "ListExchanges",
      "ListExchangesPaginated",
      "ListNodes",
      "ListProposals",
      "ListProposalsPaginated",
      "ListShieldedAddress",
      "ListShieldedNote",
      "ListWitnesses",
      "LoadShieldedWallet",
      "Login",
      "Logout",
      "MarketCancelOrder",
      "MarketSellAsset",
      "ParticipateAssetIssue",
      "RegisterWallet",
      "ResetShieldedNote",
      "ScanAndMarkNotebyAddress",
      "ScanNotebyIvk",
      "ScanNotebyOvk",
      "SendCoin",
      "SendShieldedCoin",
      "SendShieldedCoinWithoutAsk",
      "SetAccountId",
      "TransferAsset",
      "TriggerConstantContract",
      "TriggerContract",
      "UnfreezeAsset",
      "UnfreezeBalance",
      "UpdateAccount",
      "UpdateAccountPermission",
      "UpdateAsset",
      "UpdateBrokerage",
      "UpdateEnergyLimit",
      "UpdateSetting",
      "UpdateWitness",
      "VoteWitness",
      "WithdrawBalance",
  };

  private byte[] inputPrivateKey() throws IOException {
    byte[] temp = new byte[128];
    byte[] result = null;
    System.out.println("Please input private key. Max retry time:" + retryTime);
    int nTime = 0;
    while (nTime < retryTime) {
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
      ++nTime;
    }
    StringUtils.clear(temp);
    return result;
  }

  private byte[] inputPrivateKey64() throws IOException {
    Decoder decoder = Base64.getDecoder();
    byte[] temp = new byte[128];
    byte[] result = null;
    System.out.println("Please input private key by base64. Max retry time:" + retryTime);
    int nTime = 0;
    while (nTime < retryTime) {
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
      ++nTime;
    }
    StringUtils.clear(temp);
    return result;
  }

  private void registerWallet() throws CipherException, IOException {
    char[] password = Utils.inputPassword2Twice();
    String fileName = walletApiWrapper.registerWallet(password);
    StringUtils.clear(password);

    if (null == fileName) {
      System.out.println("Register wallet failed !!");
      return;
    }
    System.out.println("Register a wallet successful, keystore file name is " + fileName);
  }

  private void importWallet() throws CipherException, IOException {
    char[] password = Utils.inputPassword2Twice();
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

  private void importWalletByBase64() throws CipherException, IOException {
    char[] password = Utils.inputPassword2Twice();
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
    char[] newPassword = Utils.inputPassword2Twice();
    if (walletApiWrapper.changePassword(oldPassword, newPassword)) {
      System.out.println("ChangePassword successful !!");
    } else {
      System.out.println("ChangePassword failed !!");
    }
  }

  private void login() throws IOException, CipherException {
    boolean result = walletApiWrapper.login();
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

  private void loadShieldedWallet() throws CipherException, IOException {
    boolean result = ShieldedWrapper.getInstance().loadShieldWallet();
    if (result) {
      System.out.println("LoadShieldedWallet successful !!!");
    } else {
      System.out.println("LoadShieldedWallet failed !!!");
    }
  }

  private void backupWallet() throws IOException, CipherException {
    byte[] priKey = walletApiWrapper.backupWallet();
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
    byte[] priKey = walletApiWrapper.backupWallet();

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
      System.out.println("GetAddress successful !!");
      System.out.println("address = " + address);
    }
  }

  private void getBalance(String[] parameters) {
    Account account;
    if (ArrayUtils.isEmpty(parameters)) {
      account = walletApiWrapper.queryAccount();
    } else if (parameters.length == 1) {
      byte[] addressBytes = WalletApi.decodeFromBase58Check(parameters[0]);
      if (addressBytes == null) {
        return;
      }
      account = WalletApi.queryAccount(addressBytes);
    } else {
      System.out.println("GetBalance needs no parameter or 1 parameter like the following: ");
      System.out.println("GetBalance Address ");
      return;
    }

    if (account == null) {
      System.out.println("GetBalance failed !!!!");
    } else {
      long balance = account.getBalance();
      System.out.println("Balance = " + balance);
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
      System.out.println("GetAccount failed !!!!");
    } else {
      System.out.println(Utils.formatMessageString(account));
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
      System.out.println("GetAccountById failed !!!!");
    } else {
      System.out.println(Utils.formatMessageString(account));
    }
  }

  private void updateAccount(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("UpdateAccount needs 1 parameter like the following: ");
      System.out.println("UpdateAccount [OwnerAddress] AccountName ");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }
    String accountName = parameters[index++];
    byte[] accountNameBytes = ByteArray.fromString(accountName);

    boolean ret = walletApiWrapper.updateAccount(ownerAddress, accountNameBytes);
    if (ret) {
      System.out.println("Update Account successful !!!!");
    } else {
      System.out.println("Update Account failed !!!!");
    }
  }

  private void setAccountId(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("SetAccountId needs 1 parameter like the following: ");
      System.out.println("SetAccountId [OwnerAddress] AccountId ");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }
    String accountId = parameters[index++];
    byte[] accountIdBytes = ByteArray.fromString(accountId);

    boolean ret = walletApiWrapper.setAccountId(ownerAddress, accountIdBytes);
    if (ret) {
      System.out.println("Set AccountId successful !!!!");
    } else {
      System.out.println("Set AccountId failed !!!!");
    }
  }

  private void updateAsset(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 4 && parameters.length != 5)) {
      System.out.println("UpdateAsset needs 4 parameters like the following: ");
      System.out.println("UpdateAsset [OwnerAddress] newLimit newPublicLimit description url");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 5) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }
    String newLimitString = parameters[index++];
    String newPublicLimitString = parameters[index++];
    String description = parameters[index++];
    String url = parameters[index++];

    byte[] descriptionBytes = ByteArray.fromString(description);
    byte[] urlBytes = ByteArray.fromString(url);
    long newLimit = new Long(newLimitString);
    long newPublicLimit = new Long(newPublicLimitString);

    boolean ret = walletApiWrapper
        .updateAsset(ownerAddress, descriptionBytes, urlBytes, newLimit, newPublicLimit);
    if (ret) {
      System.out.println("Update Asset successful !!!!");
    } else {
      System.out.println("Update Asset failed !!!!");
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
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueByAccount failed !!");
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
      System.out.println("GetAccountNet failed !!");
    } else {
      System.out.println(Utils.formatMessageString(result));
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
      System.out.println("getAccountResource failed !!");
    } else {
      System.out.println(Utils.formatMessageString(result));
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
      System.out.println(Utils.formatMessageString(assetIssueContract));
    } else {
      System.out.println("getAssetIssueByName failed !!");
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
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("getAssetIssueListByName failed !!");
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
      System.out.println(Utils.formatMessageString(assetIssueContract));
    } else {
      System.out.println("getAssetIssueById failed !!");
    }
  }

  private void sendCoin(String[] parameters) throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("SendCoin needs 2 parameters like following: ");
      System.out.println("SendCoin [OwnerAddress] ToAddress Amount");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 3) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String base58ToAddress = parameters[index++];
    byte[] toAddress = WalletApi.decodeFromBase58Check(base58ToAddress);
    if (toAddress == null) {
      System.out.println("Invalid toAddress.");
      return;
    }

    String amountStr = parameters[index++];
    long amount = new Long(amountStr);

    boolean result = walletApiWrapper.sendCoin(ownerAddress, toAddress, amount);
    if (result) {
      System.out.println("Send " + amount + " drop to " + base58ToAddress + " successful !!");
    } else {
      System.out.println("Send " + amount + " drop to " + base58ToAddress + " failed !!");
    }
  }

  private void transferAsset(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 3 && parameters.length != 4)) {
      System.out.println("TransferAsset needs 3 parameters using the following syntax: ");
      System.out.println("TransferAsset [OwnerAddress] ToAddress AssertID Amount");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 4) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String base58Address = parameters[index++];
    byte[] toAddress = WalletApi.decodeFromBase58Check(base58Address);
    if (toAddress == null) {
      System.out.println("Invalid toAddress.");
      return;
    }
    String assertName = parameters[index++];
    String amountStr = parameters[index++];
    long amount = new Long(amountStr);

    boolean result = walletApiWrapper.transferAsset(ownerAddress, toAddress, assertName, amount);
    if (result) {
      System.out.println("TransferAsset " + amount + " to " + base58Address + " successful !!");
    } else {
      System.out.println("TransferAsset " + amount + " to " + base58Address + " failed !!");
    }
  }

  private void participateAssetIssue(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 3 && parameters.length != 4)) {
      System.out.println("ParticipateAssetIssue needs 3 parameters using the following syntax: ");
      System.out.println("ParticipateAssetIssue [OwnerAddress] ToAddress AssetID Amount");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 4) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String base58Address = parameters[index++];
    byte[] toAddress = WalletApi.decodeFromBase58Check(base58Address);
    if (toAddress == null) {
      System.out.println("Invalid toAddress.");
      return;
    }

    String assertName = parameters[index++];
    String amountStr = parameters[index++];
    long amount = Long.parseLong(amountStr);

    boolean result = walletApiWrapper
        .participateAssetIssue(ownerAddress, toAddress, assertName, amount);
    if (result) {
      System.out
          .println("ParticipateAssetIssue " + assertName + " " + amount + " from " + base58Address
              + " successful !!");
    } else {
      System.out
          .println("ParticipateAssetIssue " + assertName + " " + amount + " from " + base58Address
              + " failed !!");
    }
  }

  private void assetIssue(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 12) {
      System.out
          .println("Use the assetIssue command for features that you require with below syntax: ");
      System.out.println(
          "AssetIssue [OwnerAddress] AssetName AbbrName TotalSupply TrxNum AssetNum Precision "
              + "StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit "
              + "FrozenAmount0 FrozenDays0 ... FrozenAmountN FrozenDaysN");
      System.out
          .println(
              "TrxNum and AssetNum represents the conversion ratio of the tron to the asset.");
      System.out
          .println("The StartDate and EndDate format should look like 2018-03-01 2018-03-21 .");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if ((parameters.length & 1) == 1) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String name = parameters[index++];
    String abbrName = parameters[index++];
    String totalSupplyStr = parameters[index++];
    String trxNumStr = parameters[index++];
    String icoNumStr = parameters[index++];
    String precisionStr = parameters[index++];
    String startYyyyMmDd = parameters[index++];
    String endYyyyMmDd = parameters[index++];
    String description = parameters[index++];
    String url = parameters[index++];
    String freeNetLimitPerAccount = parameters[index++];
    String publicFreeNetLimitString = parameters[index++];
    HashMap<String, String> frozenSupply = new HashMap<>();
    while (index < parameters.length) {
      String amount = parameters[index++];
      String days = parameters[index++];
      frozenSupply.put(days, amount);
    }
    long totalSupply = new Long(totalSupplyStr);
    int trxNum = new Integer(trxNumStr);
    int icoNum = new Integer(icoNumStr);
    int precision = new Integer(precisionStr);
    Date startDate = Utils.strToDateLong(startYyyyMmDd);
    Date endDate = Utils.strToDateLong(endYyyyMmDd);
    if (startDate == null || endDate == null) {
      System.out
          .println("The StartDate and EndDate format should look like 2018-03-01 2018-03-21 .");
      System.out.println("AssetIssue " + name + " failed !!");
      return;
    }
    long startTime = startDate.getTime();
    long endTime = endDate.getTime();
    long freeAssetNetLimit = new Long(freeNetLimitPerAccount);
    long publicFreeNetLimit = new Long(publicFreeNetLimitString);

    boolean result = walletApiWrapper.assetIssue(ownerAddress, name, abbrName, totalSupply,
        trxNum, icoNum, precision, startTime, endTime, 0,
        description, url, freeAssetNetLimit, publicFreeNetLimit, frozenSupply);
    if (result) {
      System.out.println("AssetIssue " + name + " successful !!");
    } else {
      System.out.println("AssetIssue " + name + " failed !!");
    }
  }

  private void createAccount(String[] parameters)
      throws CipherException, IOException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("CreateAccount needs 1 parameter using the following syntax: ");
      System.out.println("CreateAccount [OwnerAddress] Address");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    byte[] address = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (address == null) {
      System.out.println("Invalid Address.");
      return;
    }

    boolean result = walletApiWrapper.createAccount(ownerAddress, address);
    if (result) {
      System.out.println("CreateAccount successful !!");
    } else {
      System.out.println("CreateAccount failed !!");
    }
  }

  private void createWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("CreateWitness needs 1 parameter using the following syntax: ");
      System.out.println("CreateWitness [OwnerAddress] Url");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String url = parameters[index++];

    boolean result = walletApiWrapper.createWitness(ownerAddress, url);
    if (result) {
      System.out.println("CreateWitness successful !!");
    } else {
      System.out.println("CreateWitness failed !!");
    }
  }

  private void updateWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("updateWitness needs 1 parameter using the following syntax: ");
      System.out.println("updateWitness [OwnerAddress] Url");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }
    String url = parameters[index++];

    boolean result = walletApiWrapper.updateWitness(ownerAddress, url);
    if (result) {
      System.out.println("updateWitness successful !!");
    } else {
      System.out.println("updateWitness failed !!");
    }
  }

  private void listWitnesses() {
    Optional<WitnessList> result = walletApiWrapper.listWitnesses();
    if (result.isPresent()) {
      WitnessList witnessList = result.get();
      System.out.println(Utils.formatMessageString(witnessList));
    } else {
      System.out.println("List witnesses failed !!");
    }
  }

  private void getAssetIssueList() {
    Optional<AssetIssueList> result = walletApiWrapper.getAssetIssueList();
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueList failed !!");
    }
  }

  private void getAssetIssueList(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("ListAssetIssuePaginated needs 2 parameters using the following syntax: ");
      System.out.println("ListAssetIssuePaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<AssetIssueList> result = walletApiWrapper.getAssetIssueList(offset, limit);
    if (result.isPresent()) {
      AssetIssueList assetIssueList = result.get();
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueListPaginated failed !!!");
    }
  }

  private void getProposalsListPaginated(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("ListProposalsPaginated needs 2 parameters use the following syntax:");
      System.out.println("ListProposalsPaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<ProposalList> result = walletApiWrapper.getProposalListPaginated(offset, limit);
    if (result.isPresent()) {
      ProposalList proposalList = result.get();
      System.out.println(Utils.formatMessageString(proposalList));
    } else {
      System.out.println("ListProposalsPaginated failed !!!");
    }
  }

  private void getExchangesListPaginated(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out
          .println("ListExchangesPaginated command needs 2 parameters, use the following syntax:");
      System.out.println("ListExchangesPaginated offset limit ");
      return;
    }
    int offset = Integer.parseInt(parameters[0]);
    int limit = Integer.parseInt(parameters[1]);
    Optional<ExchangeList> result = walletApiWrapper.getExchangeListPaginated(offset, limit);
    if (result.isPresent()) {
      ExchangeList exchangeList = result.get();
      System.out.println(Utils.formatMessageString(exchangeList));
    } else {
      System.out.println("ListExchangesPaginated failed !!!");
    }
  }

  private void listNodes() {
    Optional<NodeList> result = walletApiWrapper.listNodes();
    if (result.isPresent()) {
      NodeList nodeList = result.get();
      List<Node> list = nodeList.getNodesList();
      for (int i = 0; i < list.size(); i++) {
        Node node = list.get(i);
        System.out.println("IP::" + ByteArray.toStr(node.getAddress().getHost().toByteArray()));
        System.out.println("Port::" + node.getAddress().getPort());
      }
    } else {
      System.out.println("GetAssetIssueList " + " failed !!!");
    }
  }

  private void getBlock(String[] parameters) {
    long blockNum = -1;

    if (parameters == null || parameters.length == 0) {
      System.out.println("Get current block !!!");
    } else {
      if (parameters.length != 1) {
        System.out.println("GetBlock has too many parameters !!!");
        System.out.println("You can get current block using the following command:");
        System.out.println("GetBlock");
        System.out.println("Or get block by number with the following syntax:");
        System.out.println("GetBlock BlockNum");
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
    if (parameters == null || parameters.length != 1) {
      System.out.println("Use GetTransactionCountByBlockNum command with below syntax");
      System.out.println("GetTransactionCountByBlockNum number");
      return;
    }

    long blockNum = Long.parseLong(parameters[0]);
    long count = walletApiWrapper.getTransactionCountByBlockNum(blockNum);
    System.out.println("The block contains " + count + " transactions");
  }

  private void voteWitness(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 2) {
      System.out.println("Use VoteWitness command with below syntax: ");
      System.out.println("VoteWitness [OwnerAddress] Address0 Count0 ... AddressN CountN");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if ((parameters.length & 1) != 0) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    HashMap<String, String> witness = new HashMap<String, String>();
    while (index < parameters.length) {
      String address = parameters[index++];
      String countStr = parameters[index++];
      witness.put(address, countStr);
    }

    boolean result = walletApiWrapper.voteWitness(ownerAddress, witness);
    if (result) {
      System.out.println("VoteWitness successful !!!");
    } else {
      System.out.println("VoteWitness failed !!!");
    }
  }

  private byte[] getAddressBytes(final String address) {
    byte[] ownerAddress = null;
    try {
      ownerAddress = WalletApi.decodeFromBase58Check(address);
    } catch (Exception e) {
    }
    return ownerAddress;
  }

  private void freezeBalance(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || !(parameters.length == 2 || parameters.length == 3
        || parameters.length == 4 || parameters.length == 5)) {
      System.out.println("Use freezeBalance command with below syntax: ");
      System.out.println("freezeBalance [OwnerAddress] frozen_balance frozen_duration "
          + "[ResourceCode:0 BANDWIDTH,1 ENERGY] [receiverAddress]");
      return;
    }

    int index = 0;
    boolean hasOwnerAddressPara = false;
    byte[] ownerAddress = getAddressBytes(parameters[index]);
    if (ownerAddress != null) {
      index++;
      hasOwnerAddressPara = true;
    }

    long frozen_balance = Long.parseLong(parameters[index++]);
    long frozen_duration = Long.parseLong(parameters[index++]);
    int resourceCode = 0;
    byte[] receiverAddress = null;
    if ((!hasOwnerAddressPara && (parameters.length == 3)) ||
        (hasOwnerAddressPara && (parameters.length == 4))) {
      try {
        resourceCode = Integer.parseInt(parameters[index]);
      } catch (NumberFormatException e) {
        receiverAddress = WalletApi.decodeFromBase58Check(parameters[index]);
      }
    } else if ((!hasOwnerAddressPara && (parameters.length == 4)) ||
        (hasOwnerAddressPara && (parameters.length == 5))) {
      resourceCode = Integer.parseInt(parameters[index++]);
      receiverAddress = WalletApi.decodeFromBase58Check(parameters[index]);
    }

    boolean result = walletApiWrapper.freezeBalance(ownerAddress, frozen_balance,
        frozen_duration, resourceCode, receiverAddress);
    if (result) {
      System.out.println("FreezeBalance successful !!!");
    } else {
      System.out.println("FreezeBalance failed !!!");
    }
  }

  private void unfreezeBalance(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 1 || parameters.length > 3) {
      System.out.println("Use unfreezeBalance command with below syntax: ");
      System.out.println(
          "unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH,1 CPU) [receiverAddress]");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    int resourceCode = 0;
    byte[] receiverAddress = null;
    if (parameters.length == 2) {
      ownerAddress = getAddressBytes(parameters[index]);
      if (ownerAddress != null) {
        index++;
        resourceCode = Integer.parseInt(parameters[index++]);
      } else {
        resourceCode = Integer.parseInt(parameters[index++]);
        receiverAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      }
    } else if (parameters.length == 3) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      resourceCode = Integer.parseInt(parameters[index++]);
      receiverAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    }

    boolean result = walletApiWrapper.unfreezeBalance(ownerAddress, resourceCode, receiverAddress);
    if (result) {
      System.out.println("UnfreezeBalance successful !!!");
    } else {
      System.out.println("UnfreezeBalance failed !!!");
    }
  }

  private void unfreezeAsset(String[] parameters) throws IOException,
      CipherException, CancelException {
    System.out.println("Use UnfreezeAsset command like: ");
    System.out.println("UnfreezeAsset [OwnerAddress] ");

    byte[] ownerAddress = null;
    if (parameters != null && parameters.length > 0) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[0]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    boolean result = walletApiWrapper.unfreezeAsset(ownerAddress);
    if (result) {
      System.out.println("UnfreezeAsset successful !!!");
    } else {
      System.out.println("UnfreezeAsset failed !!!");
    }
  }

  private void createProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length < 2) {
      System.out.println("Use createProposal command with below syntax: ");
      System.out.println("createProposal [OwnerAddress] id0 value0 ... idN valueN");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if ((parameters.length & 1) != 0) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    HashMap<Long, Long> parametersMap = new HashMap<>();
    while (index < parameters.length) {
      long id = Long.valueOf(parameters[index++]);
      long value = Long.valueOf(parameters[index++]);
      parametersMap.put(id, value);
    }
    boolean result = walletApiWrapper.createProposal(ownerAddress, parametersMap);
    if (result) {
      System.out.println("CreateProposal successful !!");
    } else {
      System.out.println("CreateProposal failed !!");
    }
  }

  private void approveProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("Use approveProposal command with below syntax: ");
      System.out.println("approveProposal [OwnerAddress] id is_or_not_add_approval");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 3) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    long id = Long.valueOf(parameters[index++]);
    boolean is_add_approval = Boolean.valueOf(parameters[index++]);
    boolean result = walletApiWrapper.approveProposal(ownerAddress, id, is_add_approval);
    if (result) {
      System.out.println("ApproveProposal successful !!!");
    } else {
      System.out.println("ApproveProposal failed !!!");
    }
  }

  private void deleteProposal(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("Use deleteProposal command with below syntax: ");
      System.out.println("deleteProposal [OwnerAddress] proposalId");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    long id = Long.valueOf(parameters[index++]);
    boolean result = walletApiWrapper.deleteProposal(ownerAddress, id);
    if (result) {
      System.out.println("DeleteProposal successful !!!");
    } else {
      System.out.println("DeleteProposal failed !!!");
    }
  }


  private void listProposals() {
    Optional<ProposalList> result = walletApiWrapper.getProposalsList();
    if (result.isPresent()) {
      ProposalList proposalList = result.get();
      System.out.println(Utils.formatMessageString(proposalList));
    } else {
      System.out.println("List witnesses failed !!!");
    }
  }

  private void getProposal(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getProposal command needs 1 parameter like: ");
      System.out.println("getProposal id ");
      return;
    }
    String id = parameters[0];

    Optional<Proposal> result = WalletApi.getProposal(id);
    if (result.isPresent()) {
      Proposal proposal = result.get();
      System.out.println(Utils.formatMessageString(proposal));
    } else {
      System.out.println("GetProposal failed !!!");
    }
  }


  private void getDelegatedResource(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using getDelegatedResource command needs 2 parameters like: ");
      System.out.println("getDelegatedResource fromAddress toAddress");
      return;
    }
    String fromAddress = parameters[0];
    String toAddress = parameters[1];
    Optional<DelegatedResourceList> result = WalletApi.getDelegatedResource(fromAddress, toAddress);
    if (result.isPresent()) {
      DelegatedResourceList delegatedResourceList = result.get();
      System.out.println(Utils.formatMessageString(delegatedResourceList));
    } else {
      System.out.println("GetDelegatedResource failed !!!");
    }
  }

  private void getDelegatedResourceAccountIndex(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getDelegatedResourceAccountIndex command needs 1 parameter like: ");
      System.out.println("getDelegatedResourceAccountIndex address");
      return;
    }
    String address = parameters[0];
    Optional<DelegatedResourceAccountIndex> result = WalletApi
        .getDelegatedResourceAccountIndex(address);
    if (result.isPresent()) {
      DelegatedResourceAccountIndex delegatedResourceAccountIndex = result.get();
      System.out.println(Utils.formatMessageString(delegatedResourceAccountIndex));
    } else {
      System.out.println("GetDelegatedResourceAccountIndex failed !!");
    }
  }


  private void exchangeCreate(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 4 && parameters.length != 5)) {
      System.out.println("Using exchangeCreate command needs 4 or 5 parameters like: ");
      System.out.println("exchangeCreate [OwnerAddress] first_token_id first_token_balance "
          + "second_token_id second_token_balance");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 5) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    byte[] firstTokenId = parameters[index++].getBytes();
    long firstTokenBalance = Long.parseLong(parameters[index++]);
    byte[] secondTokenId = parameters[index++].getBytes();
    long secondTokenBalance = Long.parseLong(parameters[index++]);
    boolean result = walletApiWrapper.exchangeCreate(ownerAddress, firstTokenId, firstTokenBalance,
        secondTokenId, secondTokenBalance);
    if (result) {
      System.out.println("ExchangeCreate successful !!!");
    } else {
      System.out.println("ExchangeCreate failed !!!");
    }
  }

  private void exchangeInject(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 3 && parameters.length != 4)) {
      System.out.println("Using exchangeInject command needs 3 or 4 parameters like: ");
      System.out.println("exchangeInject [OwnerAddress] exchange_id token_id quantity");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 4) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    long exchangeId = Long.valueOf(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.valueOf(parameters[index++]);
    boolean result = walletApiWrapper.exchangeInject(ownerAddress, exchangeId, tokenId, quant);
    if (result) {
      System.out.println("ExchangeInject successful !!!");
    } else {
      System.out.println("ExchangeInject failed !!!");
    }
  }

  private void exchangeWithdraw(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 3 && parameters.length != 4)) {
      System.out.println("Using exchangeWithdraw command needs 3 or 4 parameters like: ");
      System.out.println("exchangeWithdraw [OwnerAddress] exchange_id token_id quantity");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 4) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    long exchangeId = Long.valueOf(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.valueOf(parameters[index++]);
    boolean result = walletApiWrapper.exchangeWithdraw(ownerAddress, exchangeId, tokenId, quant);
    if (result) {
      System.out.println("ExchangeWithdraw successful !!!");
    } else {
      System.out.println("ExchangeWithdraw failed !!!");
    }
  }

  private void exchangeTransaction(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 4 && parameters.length != 5)) {
      System.out.println("Using exchangeTransaction command needs 4 or 5 parameters like: ");
      System.out
          .println("exchangeTransaction [OwnerAddress] exchange_id token_id quantity expected");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 5) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    long exchangeId = Long.valueOf(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.valueOf(parameters[index++]);
    long expected = Long.valueOf(parameters[index++]);
    boolean result = walletApiWrapper
        .exchangeTransaction(ownerAddress, exchangeId, tokenId, quant, expected);
    if (result) {
      System.out.println("ExchangeTransaction successful !!!");
    } else {
      System.out.println("ExchangeTransaction failed !!!");
    }
  }

  private void listExchanges() {
    Optional<ExchangeList> result = walletApiWrapper.getExchangeList();
    if (result.isPresent()) {
      ExchangeList exchangeList = result.get();
      System.out.println(Utils.formatMessageString(exchangeList));
    } else {
      System.out.println("ListExchanges failed !!!");
    }
  }

  private void getExchange(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getExchange command needs 1 parameter like: ");
      System.out.println("getExchange id");
      return;
    }
    String id = parameters[0];

    Optional<Exchange> result = walletApiWrapper.getExchange(id);
    if (result.isPresent()) {
      Exchange exchange = result.get();
      System.out.println(Utils.formatMessageString(exchange));
    } else {
      System.out.println("GetExchange failed !!!");
    }
  }

  private void withdrawBalance(String[] parameters)
      throws IOException, CipherException, CancelException {
    System.out.println("Using withdrawBalance command like: ");
    System.out.println("withdrawBalance [OwnerAddress] ");
    byte[] ownerAddress = null;
    if (parameters != null && parameters.length > 0) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[0]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    boolean result = walletApiWrapper.withdrawBalance(ownerAddress);
    if (result) {
      System.out.println("WithdrawBalance successful !!!");
    } else {
      System.out.println("WithdrawBalance failed !!!");
    }
  }

  private void getTotalTransaction() {
    NumberMessage totalTransition = walletApiWrapper.getTotalTransaction();
    System.out.println("The number of total transactions is : " + totalTransition.getNum());
  }

  private void getNextMaintenanceTime() {
    NumberMessage nextMaintenanceTime = walletApiWrapper.getNextMaintenanceTime();
    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    String date = formatter.format(nextMaintenanceTime.getNum());
    System.out.println("Next maintenance time is : " + date);
  }

  private void getTransactionById(String[] parameters) {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getTransactionById command needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Optional<Transaction> result = WalletApi.getTransactionById(txid);
    if (result.isPresent()) {
      Transaction transaction = result.get();
      System.out.println(Utils.printTransaction(transaction));
    } else {
      System.out.println("GetTransactionById failed !!");
    }
  }

  private void getTransactionInfoById(String[] parameters) {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getTransactionInfoById command needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Optional<TransactionInfo> result = WalletApi.getTransactionInfoById(txid);
    if (result.isPresent() && !result.get().equals(TransactionInfo.getDefaultInstance())) {
      TransactionInfo transactionInfo = result.get();
      System.out.println(Utils.formatMessageString(transactionInfo));
    } else {
      System.out.println("GetTransactionInfoById failed !!!");
    }
  }

  private void getTransactionsFromThis(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using getTransactionsFromThis command needs 3 parameters like: ");
      System.out.println("getTransactionsFromThis Address offset limit");
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
        System.out.println("GetTransactionsFromThis failed !!!");
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
        System.out.println("GetTransactionsFromThis failed !!!");
      }
    }
  }

  private void getTransactionsToThis(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using getTransactionsToThis needs 3 parameters like: ");
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
        System.out.println("getTransactionsToThis failed !!!");
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
        System.out.println("getTransactionsToThis failed !!!");
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
      System.out.println("Using getBlockById command needs 1 parameter like: ");
      return;
    } else {
      blockID = parameters[0];
    }
    Optional<Block> result = WalletApi.getBlockById(blockID);
    if (result.isPresent()) {
      Block block = result.get();
      System.out.println(Utils.printBlock(block));
    } else {
      System.out.println("GetBlockById failed !!");
    }
  }

  private void getBlockByLimitNext(String[] parameters) {
    long start = 0;
    long end = 0;
    if (parameters == null || parameters.length != 2) {
      System.out
          .println(
              "Using GetBlockByLimitNext command needs 2 parameters, start_block_number and end_block_number");
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
        System.out.println("GetBlockByLimitNext failed !!");
      }
    } else {
      Optional<BlockList> result = WalletApi.getBlockByLimitNext(start, end);
      if (result.isPresent()) {
        BlockList blockList = result.get();
        System.out.println(Utils.printBlockList(blockList));
      } else {
        System.out.println("GetBlockByLimitNext failed !!");
      }
    }
  }

  private void getBlockByLatestNum(String[] parameters) {
    long num = 0;
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getBlockByLatestNum command needs 1 parameter, block_num");
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
        System.out.println("GetBlockByLimitNext failed !!");
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
        System.out.println("GetBlockByLimitNext failed !!");
      }
    }
  }

  private void updateSetting(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("Using updateSetting needs 2 parameters like: ");
      System.out
          .println("updateSetting [OwnerAddress] contract_address consume_user_resource_percent");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 3) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    byte[] contractAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (contractAddress == null) {
      System.out.println("Invalid contractAddress.");
      return;
    }

    long consumeUserResourcePercent = Long.valueOf(parameters[index++]).longValue();
    if (consumeUserResourcePercent > 100 || consumeUserResourcePercent < 0) {
      System.out.println("consume_user_resource_percent must >= 0 and <= 100");
      return;
    }
    boolean result = walletApiWrapper
        .updateSetting(ownerAddress, contractAddress, consumeUserResourcePercent);
    if (result) {
      System.out.println("UpdateSetting successful !!!");
    } else {
      System.out.println("UpdateSetting failed !!!");
    }
  }

  private void updateEnergyLimit(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("Using updateEnergyLimit command needs 2 parameters like: ");
      System.out.println("updateEnergyLimit [OwnerAddress] contract_address energy_limit");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 3) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    byte[] contractAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (contractAddress == null) {
      System.out.println("Invalid contractAddress.");
      return;
    }

    long originEnergyLimit = Long.valueOf(parameters[index++]).longValue();
    if (originEnergyLimit < 0) {
      System.out.println("origin_energy_limit need > 0 ");
      return;
    }
    boolean result = walletApiWrapper
        .updateEnergyLimit(ownerAddress, contractAddress, originEnergyLimit);
    if (result) {
      System.out.println("UpdateSetting for origin_energy_limit successful !!!");
    } else {
      System.out.println("UpdateSetting for origin_energy_limit failed !!!");
    }
  }

  private void clearContractABI(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || (parameters.length != 1 && parameters.length != 2)) {
      System.out.println("Using clearContractABI command needs 1 or 2 parameters like: ");
      System.out.println("clearContractABI [OwnerAddress] contract_address");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 2) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    byte[] contractAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (contractAddress == null) {
      return;
    }

    boolean result = walletApiWrapper.clearContractABI(ownerAddress, contractAddress);
    if (result) {
      System.out.println("ClearContractABI successful !!!");
    } else {
      System.out.println("ClearContractABI failed !!!");
    }
  }

  private void updateBrokerage(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using updateBrokerage command needs 2 parameters like: ");
      System.out.println("updateBrokerage OwnerAddress brokerage");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;

    ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (ownerAddress == null) {
      System.out.println("Invalid OwnerAddress.");
      return;
    }

    int brokerage = Integer.valueOf(parameters[index++]);
    if (brokerage < 0 || brokerage > 100) {
      return;
    }

    boolean result = walletApiWrapper.updateBrokerage(ownerAddress, brokerage);
    if (result) {
      System.out.println("UpdateBrokerage successful !!!");
    } else {
      System.out.println("UpdateBrokerage failed !!!");
    }
  }

  private void getReward(String[] parameters) {
    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 1) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    } else {
      System.out.println("Using getReward command needs 1 parameter like: ");
      System.out.println("getReward [OwnerAddress]");
      return;
    }
    NumberMessage reward = walletApiWrapper.getReward(ownerAddress);
    System.out.println("The reward is : " + reward.getNum());
  }

  private void getBrokerage(String[] parameters) {
    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 1) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    } else {
      System.out.println("Using getBrokerage needs 1 parameter like following: ");
      System.out.println("getBrokerage [OwnerAddress]");
      return;
    }
    NumberMessage brokerage = walletApiWrapper.getBrokerage(ownerAddress);
    System.out.println("The brokerage is : " + brokerage.getNum());
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
      int abiIndex = 1;
      if (getAddressBytes(parts[0]) != null) {
        abiIndex = 2;
      }

      for (int i = 0; i < parts.length; i++) {
        if (abiIndex == i) {
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
      throws IOException, CipherException, CancelException {

    String[] parameters = getParas(parameter);
    if (parameters == null ||
        parameters.length < 11) {
      System.out.println("Using deployContract needs at least 11 parameters like: ");
      System.out.println(
          "DeployContract [ownerAddress] contractName ABI byteCode constructor params isHex fee_limit consume_user_resource_percent origin_energy_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided) <library:address,library:address,...> <lib_compiler_version(e.g:v5)>");
//      System.out.println(
//          "Note: Please append the param for constructor tightly with byteCode without any space");
      return;
    }

    int idx = 0;
    byte[] ownerAddress = getAddressBytes(parameters[idx]);
    if (ownerAddress != null) {
      idx++;
    }

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
      libraryAddressPair = parameters[idx++];
    }

    String compilerVersion = null;
    if (parameters.length > idx) {
      compilerVersion = parameters[idx];
    }

    // TODO: consider to remove "data"
    /* Consider to move below null value, since we append the constructor param just after bytecode without any space.
     * Or we can re-design it to give other developers better user experience. Set this value in protobuf as null for now.
     */
    boolean result = walletApiWrapper
        .deployContract(ownerAddress, contractName, abiStr, codeStr, feeLimit, value,
            consumeUserResourcePercent, originEnergyLimit, tokenValue, tokenId, libraryAddressPair,
            compilerVersion);
    if (result) {
      System.out.println("Broadcast the createSmartContract successful.\n"
          + "Please check the given transaction id to confirm deploy status on blockchain using getTransactionInfoById command.");
    } else {
      System.out.println("Broadcast the createSmartContract failed !!!");
    }
  }

  private void triggerContract(String[] parameters, boolean isConstant)
      throws IOException, CipherException, CancelException, EncodingException {
    String cmdMethodStr = isConstant ? "TriggerConstantContract" : "TriggerContract";

    if (isConstant) {
      if (parameters == null || (parameters.length != 4 && parameters.length != 5)) {
        System.out.println(cmdMethodStr + " needs 4 or 5 parameters like: ");
        System.out.println(cmdMethodStr + " [OwnerAddress] contractAddress method args isHex");
        return;
      }
    } else {
      if (parameters == null || (parameters.length != 8 && parameters.length != 9)) {
        System.out.println(cmdMethodStr + " needs 8 or 9 parameters like: ");
        System.out.println(cmdMethodStr + " [OwnerAddress] contractAddress method args isHex"
            + " fee_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided)");
        return;
      }
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 5 || parameters.length == 9) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String contractAddrStr = parameters[index++];
    String methodStr = parameters[index++];
    String argsStr = parameters[index++];
    boolean isHex = Boolean.valueOf(parameters[index++]);
    long feeLimit = 0;
    long callValue = 0;
    long tokenCallValue = 0;
    String tokenId = "";

    if (!isConstant) {
      feeLimit = Long.valueOf(parameters[index++]);
      callValue = Long.valueOf(parameters[index++]);
      tokenCallValue = Long.valueOf(parameters[index++]);
      tokenId = parameters[index++];
    }
    if (argsStr.equalsIgnoreCase("#")) {
      argsStr = "";
    }
    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, isHex));
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddrStr);

    boolean result = walletApiWrapper
        .callContract(ownerAddress, contractAddress, callValue, input, feeLimit, tokenCallValue,
            tokenId,
            isConstant);
    if (!isConstant) {
      if (result) {
        System.out.println("Broadcast the " + cmdMethodStr + " successful.\n"
            + "Please check the given transaction id to get the result on blockchain using getTransactionInfoById command");
      } else {
        System.out.println("Broadcast the " + cmdMethodStr + " failed");
      }
    }
  }

  private void getContract(String[] parameters) {
    if (parameters == null ||
        parameters.length != 1) {
      System.out.println("Using getContract needs 1 parameter like: ");
      System.out.println("GetContract contractAddress");
      return;
    }

    byte[] addressBytes = WalletApi.decodeFromBase58Check(parameters[0]);
    if (addressBytes == null) {
      System.out.println("GetContract: invalid address !!!");
      return;
    }

    SmartContract contractDeployContract = WalletApi.getContract(addressBytes);
    if (contractDeployContract != null) {
      System.out.println(Utils.formatMessageString(contractDeployContract));
    } else {
      System.out.println("Query contract failed !!!");
    }
  }

  private void generateAddress() {
    AddressPrKeyPairMessage result = walletApiWrapper.generateAddress();
    if (null != result) {
      System.out.println(Utils.formatMessageString(result));
    } else {
      System.out.println("GenerateAddress failed !!!");
    }
  }

  private void updateAccountPermission(String[] parameters)
      throws CipherException, IOException, CancelException {
    if (parameters == null || parameters.length != 2) {
      System.out.println(
          "Using updateAccountPermission needs 2 parameters, like UpdateAccountPermission ownerAddress permissions, permissions is json format");
      return;
    }

    byte[] ownerAddress = WalletApi.decodeFromBase58Check(parameters[0]);
    if (ownerAddress == null) {
      System.out.println("GetContract: invalid address!");
      return;
    }

    boolean ret = walletApiWrapper.accountPermissionUpdate(ownerAddress, parameters[1]);
    if (ret) {
      System.out.println("UpdateAccountPermission successful !!!");
    } else {
      System.out.println("UpdateAccountPermission failed !!!");
    }
  }


  private void getTransactionSignWeight(String[] parameters) throws InvalidProtocolBufferException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using getTransactionSignWeight needs 1 parameter, like getTransactionSignWeight transaction which is hex string");
      return;
    }

    String transactionStr = parameters[0];
    Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(transactionStr));

    TransactionSignWeight transactionSignWeight = WalletApi.getTransactionSignWeight(transaction);
    if (transactionSignWeight != null) {
      System.out.println(Utils.printTransactionSignWeight(transactionSignWeight));
    } else {
      System.out.println("GetTransactionSignWeight failed !!!");
    }
  }

  private void getTransactionApprovedList(String[] parameters)
      throws InvalidProtocolBufferException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using getTransactionApprovedList needs 1 parameter, like getTransactionApprovedList transaction which is hex string");
      return;
    }

    String transactionStr = parameters[0];
    Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(transactionStr));

    TransactionApprovedList transactionApprovedList = WalletApi
        .getTransactionApprovedList(transaction);
    if (transactionApprovedList != null) {
      System.out.println(Utils.printTransactionApprovedList(transactionApprovedList));
    } else {
      System.out.println("GetTransactionApprovedList failed !!!");
    }
  }

  private void addTransactionSign(String[] parameters)
      throws CipherException, IOException, CancelException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using addTransactionSign needs 1 parameter, like addTransactionSign transaction which is hex string");
      return;
    }

    String transactionStr = parameters[0];
    Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(transactionStr));
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Invalid transaction !!!");
      return;
    }

    transaction = walletApiWrapper.addTransactionSign(transaction);
    if (transaction != null) {
      System.out.println(Utils.printTransaction(transaction));
      System.out.println("Transaction hex string is " +
          ByteArray.toHexString(transaction.toByteArray()));
    } else {
      System.out.println("AddTransactionSign failed !!!");
    }

  }

  private void broadcastTransaction(String[] parameters) throws InvalidProtocolBufferException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using broadcastTransaction needs 1 parameter, like broadcastTransaction transaction which is hex string");
      return;
    }

    String transactionStr = parameters[0];
    Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(transactionStr));
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Invalid transaction");
      return;
    }

    boolean ret = WalletApi.broadcastTransaction(transaction);
    if (ret) {
      System.out.println("BroadcastTransaction successful !!!");
    } else {
      System.out.println("BroadcastTransaction failed !!!");
    }
  }

  private void generateShieldedAddress(String[] parameters) throws IOException, CipherException {
    int addressNum = 1;
    if (parameters.length > 0 && !StringUtil.isNullOrEmpty(parameters[0])) {
      addressNum = Integer.valueOf(parameters[0]);
    }

    ShieldedWrapper.getInstance().initShieldedWaletFile();

    System.out.println("ShieldedAddress list:");
    for (int i = 0; i < addressNum; ++i) {
      Optional<ShieldedAddressInfo> addressInfo = walletApiWrapper.getNewShieldedAddress();
      if (addressInfo.isPresent()) {
        if (ShieldedWrapper.getInstance().addNewShieldedAddress(addressInfo.get(), true)) {
          System.out.println(addressInfo.get().getAddress());
        }
      }
    }

    System.out.println("GenerateShieldedAddress successful !!!");
  }

  private void listShieldedAddress() {
    if (!ShieldedWrapper.getInstance().ifShieldedWalletLoaded()) {
      System.out.println("ListShieldedAddress failed, please loadShieldedWallet first!");
      return;
    }

    List<String> listAddress = ShieldedWrapper.getInstance().getShieldedAddressList();
    System.out.println("ShieldedAddress :");
    for (String address : listAddress) {
      System.out.println(address);
    }
  }

  private boolean sendShieldedCoinNormal(String[] parameters, boolean withAsk)
      throws IOException, CipherException, CancelException, ZksnarkException {
    int parameterIndex = 0;
    String fromPublicAddress = parameters[parameterIndex++];
    long fromPublicAmount = 0;
    if (fromPublicAddress.equals("null")) {
      fromPublicAddress = null;
      ++parameterIndex;
    } else {
      String amountString = parameters[parameterIndex++];
      if (!StringUtil.isNullOrEmpty(amountString)) {
        fromPublicAmount = Long.valueOf(amountString);
      }
    }

    int shieldedInputNum = 0;
    String amountString = parameters[parameterIndex++];
    if (!StringUtil.isNullOrEmpty(amountString)) {
      shieldedInputNum = Integer.valueOf(amountString);
    }

    List<Long> shieldedInputList = new ArrayList<>();
    String shieldedInputAddress = "";
    for (int i = 0; i < shieldedInputNum; ++i) {
      long mapIndex = Long.valueOf(parameters[parameterIndex++]);
      ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote().get(mapIndex);
      if (noteInfo == null) {
        System.out.println("Can't find index " + mapIndex + " note.");
        return false;
      }
      if (i == 0) {
        shieldedInputAddress = noteInfo.getPaymentAddress();
      } else {
        if (!noteInfo.getPaymentAddress().equals(shieldedInputAddress)) {
          System.err.println("All the input notes should be the same address!");
          return false;
        }
      }
      shieldedInputList.add(mapIndex);
    }

    String toPublicAddress = parameters[parameterIndex++];
    long toPublicAmount = 0;
    if (toPublicAddress.equals("null")) {
      toPublicAddress = null;
      ++parameterIndex;
    } else {
      amountString = parameters[parameterIndex++];
      if (!StringUtil.isNullOrEmpty(amountString)) {
        toPublicAmount = Long.valueOf(amountString);
      }
    }

    int shieldedOutputNum = 0;
    amountString = parameters[parameterIndex++];
    if (!StringUtil.isNullOrEmpty(amountString)) {
      shieldedOutputNum = Integer.valueOf(amountString);
    }
    if ((parameters.length - parameterIndex) % 3 != 0) {
      System.out.println("Invalid parameter number!");
      return false;
    }

    List<Note> shieldedOutList = new ArrayList<>();
    for (int i = 0; i < shieldedOutputNum; ++i) {
      String shieldedAddress = parameters[parameterIndex++];
      amountString = parameters[parameterIndex++];
      String menoString = parameters[parameterIndex++];
      if (menoString.equals("null")) {
        menoString = "";
      }
      long shieldedAmount = 0;
      if (!StringUtil.isNullOrEmpty(amountString)) {
        shieldedAmount = Long.valueOf(amountString);
      }

      Note.Builder noteBuild = Note.newBuilder();
      noteBuild.setPaymentAddress(shieldedAddress);
      noteBuild.setPaymentAddress(shieldedAddress);
      noteBuild.setValue(shieldedAmount);
      noteBuild.setRcm(ByteString.copyFrom(walletApiWrapper.getRcm()));
      noteBuild.setMemo(ByteString.copyFrom(menoString.getBytes()));
      shieldedOutList.add(noteBuild.build());
    }

    if (withAsk) {
      return walletApiWrapper.sendShieldedCoin(fromPublicAddress,
          fromPublicAmount, shieldedInputList, shieldedOutList, toPublicAddress, toPublicAmount);
    } else {
      return walletApiWrapper.sendShieldedCoinWithoutAsk(fromPublicAddress,
          fromPublicAmount, shieldedInputList, shieldedOutList, toPublicAddress, toPublicAmount);
    }
  }

  private boolean isFromShieldedNote(String shieldedStringInputNum) {
    int shieldedInputNum = 0;
    if (!StringUtil.isNullOrEmpty(shieldedStringInputNum)) {
      shieldedInputNum = Integer.valueOf(shieldedStringInputNum);
    }

    if (shieldedInputNum > 0) {
      return true;
    } else {
      return false;
    }
  }

  private void sendShieldedCoin(String[] parameters) throws IOException, CipherException,
      CancelException, ZksnarkException {
    if (parameters == null || parameters.length < 6) {
      System.out.println("Using SendShieldedCoin command needs more than 6 parameters like: ");
      System.out.println("SendShieldedCoin publicFromAddress fromAmount shieldedInputNum "
          + "input1 input2 input3 ... publicToAddress toAmount shieldedOutputNum shieldedAddress1"
          + " amount1 memo1 shieldedAddress2 amount2 memo2 ... ");
      return;
    }

    if (isFromShieldedNote(parameters[2]) &&
        !ShieldedWrapper.getInstance().ifShieldedWalletLoaded()) {
      System.out.println("SendShieldedCoin failed, please loadShieldedWallet first !!!");
      return;
    }

    boolean result = sendShieldedCoinNormal(parameters, true);
    if (result) {
      System.out.println("SendShieldedCoin successful !!!");
    } else {
      System.out.println("SendShieldedCoin failed !!!");
    }
  }

  private void sendShieldedCoinWithoutAsk(String[] parameters) throws IOException, CipherException,
      CancelException, ZksnarkException {
    if (parameters == null || parameters.length < 6) {
      System.out
          .println("Using SendShieldedCoinWithoutAsk command needs more than 6 parameters like: ");
      System.out.println("SendShieldedCoinWithoutAsk publicFromAddress fromAmount "
          + "shieldedInputNum input1 input2 input3 ... publicToAddress toAmount shieldedOutputNum "
          + "shieldedAddress1 amount1 memo1 shieldedAddress2 amount2 memo2 ... ");
      return;
    }

    if (isFromShieldedNote(parameters[2]) &&
        !ShieldedWrapper.getInstance().ifShieldedWalletLoaded()) {
      System.out.println("SendShieldedCoin failed, please loadShieldedWallet first!");
      return;
    }

    boolean result = sendShieldedCoinNormal(parameters, false);
    if (result) {
      System.out.println("SendShieldedCoinWithoutAsk successful !!!");
    } else {
      System.out.println("SendShieldedCoinWithoutAsk failed !!!");
    }
  }

  private void listShieldedNote(String[] parameters) {
    if (!ShieldedWrapper.getInstance().ifShieldedWalletLoaded()) {
      System.out.println("ListShieldedNote failed, please loadShieldedWallet first!");
      return;
    }

    int showType = 0;
    if (parameters == null || parameters.length <= 0) {
      System.out.println("This command will show all the unspent notes. ");
      System.out.println(
          "If you want to query all the spent notes and unspent notes, please use command ListShieldedNote 1 ");
    } else {
      if (!StringUtil.isNullOrEmpty(parameters[0])) {
        showType = Integer.valueOf(parameters[0]);
      }
    }

    if (showType == 0) {
      List<String> utxoList = ShieldedWrapper.getInstance().getvalidateSortUtxoList();
      if (utxoList.size() == 0) {
        System.out.println("Unspent note is 0.");
      } else {
        System.out.println("Unspent note list like:");
        for (String string : utxoList) {
          System.out.println(string);
        }
      }
    } else {
      Map<Long, ShieldedNoteInfo> noteMap = ShieldedWrapper.getInstance().getUtxoMapNote();
      System.out.println("All notes list like:");
      for (Entry<Long, ShieldedNoteInfo> entry : noteMap.entrySet()) {
        String string = entry.getValue().getPaymentAddress() + " ";
        string += entry.getValue().getValue();
        string += " ";
        string += entry.getValue().getTrxId();
        string += " ";
        string += entry.getValue().getIndex();
        string += " ";
        string += "UnSpent";
        string += " ";
        string += ZenUtils.getMemo(entry.getValue().getMemo());
        System.out.println(string);
      }

      List<ShieldedNoteInfo> noteList = ShieldedWrapper.getInstance().getSpendUtxoList();
      for (ShieldedNoteInfo noteInfo : noteList) {
        String string = noteInfo.getPaymentAddress() + " ";
        string += noteInfo.getValue();
        string += " ";
        string += noteInfo.getTrxId();
        string += " ";
        string += noteInfo.getIndex();
        string += " ";
        string += "Spent";
        string += " ";
        string += ZenUtils.getMemo(noteInfo.getMemo());
        System.out.println(string);
      }
    }
  }

  private void resetShieldedNote() {
    if (!ShieldedWrapper.getInstance().ifShieldedWalletLoaded()) {
      System.out.println("ResetShieldedNote failed, please loadShieldedWallet first!");
      return;
    }

    walletApiWrapper.resetShieldedNote();
  }

  private void scanNoteByIvk(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using ScanNotebyIvk command needs 3 parameters like: ");
      System.out.println("ScanNotebyIvk ivk startNum endNum ");
      return;
    }

    long startNum, endNum;
    try {
      startNum = Long.parseLong(parameters[1]);
      endNum = Long.parseLong(parameters[2]);
    } catch (NumberFormatException e) {
      System.out.println("Invalid parameter: startNum, endNum.");
      return;
    }

    walletApiWrapper.scanNoteByIvk(parameters[0], startNum, endNum);
  }

  private void scanAndMarkNoteByAddress(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using scanAndMarkNotebyAddress needs 3 parameters like: ");
      System.out.println("scanAndMarkNotebyAddress shieldedAddress startNum endNum ");
      return;
    }
    long startNum, endNum;
    try {
      startNum = Long.parseLong(parameters[1]);
      endNum = Long.parseLong(parameters[2]);
    } catch (NumberFormatException e) {
      System.out.println("Invalid parameter: startNum, endNum.");
      return;
    }

    walletApiWrapper.scanAndMarkNoteByAddress(parameters[0], startNum, endNum);
  }

  private void ScanNoteByOvk(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using scanNotebyOvk command needs 3 parameters like: ");
      System.out.println("scanNotebyOvk ovk startNum endNum");
      return;
    }
    long startNum, endNum;
    try {
      startNum = Long.parseLong(parameters[1]);
      endNum = Long.parseLong(parameters[2]);
    } catch (NumberFormatException e) {
      System.out.println("Invalid parameter: startNum, endNum.");
      return;
    }

    walletApiWrapper.scanShieldedNoteByovk(parameters[0], startNum, endNum);
  }

  private void getShieldedNullifier(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getShieldedNullifier needs 1 parameter like: ");
      System.out.println("getShieldedNullifier index");
      return;
    }
    long index = Long.valueOf(parameters[0]);
    String hash = walletApiWrapper.getShieldedNulltifier(index);
    if (hash != null) {
      System.out.println("ShieldedNullifier:" + hash);
    } else {
      System.out.println("GetShieldedNullifier failed !!!");
    }
  }

  private void getSpendingKey() {
    Optional<BytesMessage> sk = WalletApi.getSpendingKey();
    if (!sk.isPresent()) {
      System.out.println("GetSpendingKey failed !!!");
    } else {
      System.out.println(ByteArray.toHexString(sk.get().getValue().toByteArray()));
    }
  }

  private void getExpandedSpendingKey(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getExpandedSpendingKey command needs 1 parameter like: ");
      System.out.println("getExpandedSpendingKey sk ");
      return;
    }
    String spendingKey = parameters[0];

    BytesMessage sk = BytesMessage.newBuilder()
        .setValue(ByteString.copyFrom(ByteArray.fromHexString(spendingKey))).build();
    Optional<ExpandedSpendingKeyMessage> esk = WalletApi.getExpandedSpendingKey(sk);
    if (!esk.isPresent()) {
      System.out.println("GetExpandedSpendingKey failed !!!");
    } else {
      System.out.println("ask:" + ByteArray.toHexString(esk.get().getAsk().toByteArray()));
      System.out.println("nsk:" + ByteArray.toHexString(esk.get().getNsk().toByteArray()));
      System.out.println("ovk:" + ByteArray.toHexString(esk.get().getOvk().toByteArray()));
    }
  }

  private void getAkFromAsk(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getAkFromAsk needs 1 parameter like: ");
      System.out.println("getAkFromAsk ask ");
      return;
    }
    String ask = parameters[0];

    BytesMessage ask1 = BytesMessage.newBuilder()
        .setValue(ByteString.copyFrom(ByteArray.fromHexString(ask))).build();
    Optional<BytesMessage> ak = WalletApi.getAkFromAsk(ask1);
    if (!ak.isPresent()) {
      System.out.println("GetAkFromAsk failed !!!");
    } else {
      System.out.println("ak:" + ByteArray.toHexString(ak.get().getValue().toByteArray()));
    }
  }

  private void getNkFromNsk(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getNkFromNsk needs 1 parameter like: ");
      System.out.println("getNkFromNsk nsk ");
      return;
    }
    String nsk = parameters[0];

    BytesMessage nsk1 = BytesMessage.newBuilder()
        .setValue(ByteString.copyFrom(ByteArray.fromHexString(nsk))).build();
    Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nsk1);
    if (!nk.isPresent()) {
      System.out.println("GetNkFromNsk failed !!!");
    } else {
      System.out.println("nk:" + ByteArray.toHexString(nk.get().getValue().toByteArray()));
    }
  }

  private void getIncomingViewingKey(String[] parameters) {
    if (parameters == null || parameters.length != 2 || parameters[0].length() != 64
        || parameters[1].length() != 64) {
      System.out.println("Using getIncomingViewingKey needs 2 parameters like: ");
      System.out.println("getIncomingViewingKey ak[64] nk[64] ");
      return;
    }
    String ak = parameters[0];
    String nk = parameters[1];
    ViewingKeyMessage vk = ViewingKeyMessage.newBuilder()
        .setAk(ByteString.copyFrom(ByteArray.fromHexString(ak)))
        .setNk(ByteString.copyFrom(ByteArray.fromHexString(nk)))
        .build();

    Optional<IncomingViewingKeyMessage> ivk = WalletApi.getIncomingViewingKey(vk);
    if (!ivk.isPresent()) {
      System.out.println("GetIncomingViewingKey failed !!!");
    } else {
      System.out.println("ivk:" + ByteArray.toHexString(ivk.get().getIvk().toByteArray()));
    }
  }

  private void getDiversifier(String[] parameters) {
    Optional<DiversifierMessage> diversifierMessage = WalletApi.getDiversifier();
    if (!diversifierMessage.isPresent()) {
      System.out.println("GetDiversifier failed !!!");
    } else {
      System.out.println(ByteArray.toHexString(diversifierMessage.get().getD().toByteArray()));
    }
  }

  private void getShieldedPaymentAddress(String[] parameters) {
    if (parameters == null || parameters.length != 2 || parameters[1].length() != 22) {
      System.out.println("Using getShieldedPaymentAddress command needs 2 parameters like: ");
      System.out.println("getShieldedPaymentAddress ivk[64] d[22] ");
      return;
    }
    String ivk = parameters[0];
    String d = parameters[1];

    IncomingViewingKeyMessage ivk1 = IncomingViewingKeyMessage.newBuilder()
        .setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)))
        .build();
    DiversifierMessage d1 = DiversifierMessage.newBuilder()
        .setD(ByteString.copyFrom(ByteArray.fromHexString(d)))
        .build();
    IncomingViewingKeyDiversifierMessage ivk_d = IncomingViewingKeyDiversifierMessage.newBuilder()
        .setIvk(ivk1)
        .setD(d1)
        .build();

    Optional<PaymentAddressMessage> paymentAddress = WalletApi.getZenPaymentAddress(ivk_d);
    if (!paymentAddress.isPresent()) {
      System.out.println("GetShieldedPaymentAddress failed !!!");
    } else {
      System.out
          .println("pkd:" + ByteArray.toHexString(paymentAddress.get().getPkD().toByteArray()));
      System.out.println("shieldedAddress:" + paymentAddress.get().getPaymentAddress());
    }
  }

  private void backupShieldedAddress() throws IOException, CipherException {
    byte[] priKey = ShieldedWrapper.getInstance().backupShieldedAddress();
    if (!ArrayUtils.isEmpty(priKey)) {
      for (int i = 0; i < priKey.length; i++) {
        StringUtils.printOneByte(priKey[i]);
      }
      System.out.println();
      StringUtils.clear(priKey);
      System.out.println("BackupShieldedAddress successful !!!");
    } else {
      System.out.println("BackupShieldedAddress failed !!!");
    }
  }

  private void importShieldedAddress() throws CipherException, IOException {
    byte[] priKey = ShieldedWrapper.getInstance().importShieldedAddress();
    if (!ArrayUtils.isEmpty(priKey) && priKey.length == 43) {
      byte[] sk = new byte[32];
      byte[] d = new byte[11];
      System.arraycopy(priKey, 0, sk, 0, sk.length);
      System.arraycopy(priKey, sk.length, d, 0, d.length);
      Optional<ShieldedAddressInfo> addressInfo =
          walletApiWrapper.getNewShieldedAddressBySkAndD(sk, d);
      if (addressInfo.isPresent() &&
          ShieldedWrapper.getInstance().addNewShieldedAddress(addressInfo.get(), false)) {
        System.out.println("Import new shielded address is: " + addressInfo.get().getAddress());
        System.out.println("ImportShieldedAddress successful !!!");
      } else {
        System.out.println("ImportShieldedAddress failed !!!");
      }
    } else {
      System.out.println("ImportShieldedAddress failed !!!");
    }
  }

  private void marketSellAsset(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 5) {
      System.out.println("Using MarketSellAsset command needs 5 parameters like: ");
      System.out.println(
          "MarketSellAsset ownerAddress sellTokenId sellTokenQuantity buyTokenId buyTokenQuantity");
      return;
    }

    int index = 0;
    byte[] ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (ownerAddress == null) {
      System.out.println("Invalid OwnerAddress.");
      return;
    }

    byte[] sellTokenId = parameters[index++].getBytes();
    long sellTokenQuantity = Long.parseLong(parameters[index++]);
    byte[] buyTokenId = parameters[index++].getBytes();
    long buyTokenQuantity = Long.parseLong(parameters[index++]);

    boolean result = walletApiWrapper
        .marketSellAsset(ownerAddress, sellTokenId, sellTokenQuantity, buyTokenId,
            buyTokenQuantity);
    if (result) {
      System.out.println("MarketSellAsset successful !!!");
    } else {
      System.out.println("MarketSellAsset failed !!!");
    }
  }


  private void marketCancelOrder(String[] parameters)
      throws IOException, CipherException, CancelException {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using MarketCancelOrder command needs 2 parameters like: ");
      System.out.println(
          "MarketCancelOrder ownerAddress orderId");
      return;
    }

    int index = 0;
    byte[] ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (ownerAddress == null) {
      System.out.println("Invalid OwnerAddress.");
      return;
    }

    byte[] orderId = ByteArray.fromHexString(parameters[index++]);

    boolean result = walletApiWrapper
        .marketCancelOrder(ownerAddress, orderId);
    if (result) {
      System.out.println("MarketCancelOrder successful !!!");
    } else {
      System.out.println("MarketCancelOrder failed !!!");
    }
  }


  private void getMarketOrderByAccount(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using GetMarketOrderByAccount command needs 1 parameters like: ");
      System.out.println(
          "GetMarketOrderByAccount ownerAddress");
      return;
    }

    int index = 0;
    byte[] ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
    if (ownerAddress == null) {
      System.out.println("Invalid OwnerAddress.");
      return;
    }

    Optional<MarketOrderList> marketOrderList = walletApiWrapper
        .getMarketOrderByAccount(ownerAddress);
    if (!marketOrderList.isPresent()) {
      System.out.println("GetMarketOrderByAccount failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(marketOrderList.get()));
    }
  }

  private void getMarketPriceByPair(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using GetMarketPriceByPair command needs 2 parameters like: ");
      System.out.println(
          "GetMarketPriceByPair sellTokenId buyTokenId");
      return;
    }

    int index = 0;
    byte[] sellTokenId = parameters[index++].getBytes();
    byte[] buyTokenId = parameters[index++].getBytes();

    Optional<MarketPriceList> marketPriceList = walletApiWrapper
        .getMarketPriceByPair(sellTokenId, buyTokenId);
    if (!marketPriceList.isPresent()) {
      System.out.println("GetMarketPriceByPair failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(marketPriceList.get()));
    }
  }


  private void getMarketOrderListByPair(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using getMarketOrderListByPair command needs 2 parameters like: ");
      System.out.println(
          "getMarketOrderListByPair sellTokenId buyTokenId");
      return;
    }

    int index = 0;
    byte[] sellTokenId = parameters[index++].getBytes();
    byte[] buyTokenId = parameters[index++].getBytes();

    Optional<MarketOrderList> orderListByPair = walletApiWrapper
        .getMarketOrderListByPair(sellTokenId, buyTokenId);
    if (!orderListByPair.isPresent()) {
      System.out.println("getMarketOrderListByPair failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(orderListByPair.get()));
    }
  }


  private void getMarketPairList(String[] parameters) {
    if (parameters == null || parameters.length != 0) {
      System.out.println("Using getMarketPairList command does not need any parameters, like: ");
      System.out.println(
          "getMarketPairList");
      return;
    }

    Optional<MarketOrderPairList> pairList = walletApiWrapper
        .getMarketPairList();
    if (!pairList.isPresent()) {
      System.out.println("getMarketPairList failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(pairList.get()));
    }
  }

  private void getMarketOrderById(String[] parameters) {
    if (parameters == null || parameters.length != 0) {
      System.out.println("Using getMarketOrderById command needs 1 parameters like:");
      System.out.println(
          "getMarketOrderById orderId");
      return;
    }
    byte[] orderId = parameters[0].getBytes();
    Optional<MarketOrder> pairList = walletApiWrapper
        .getMarketOrderById(orderId);
    if (!pairList.isPresent()) {
      System.out.println("getMarketOrderById failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(pairList.get()));
    }
  }


  private void create2(String[] parameters) {
    if (parameters == null || parameters.length != 3) {
      System.out.println("Using create2 command needs 3 parameters like: ");
      System.out.println("create2 address code salt");
      return;
    }

    byte[] address = WalletApi.decodeFromBase58Check(parameters[0]);
    if (!WalletApi.addressValid(address)) {
      System.out.println("The length of address must be 21 bytes.");
      return;
    }

    byte[] code = Hex.decode(parameters[1]);
    byte[] temp = Longs.toByteArray(Long.parseLong(parameters[2]));
    if (temp.length != 8) {
      System.out.println("Invalid salt!");
      return;
    }
    byte[] salt = new byte[32];
    System.arraycopy(temp, 0, salt, 24, 8);

    byte[] mergedData = ByteUtil.merge(address, salt, Hash.sha3(code));
    String Address = WalletApi.encode58Check(Hash.sha3omit12(mergedData));

    System.out.println("Create2 Address: " + Address);

    return;
  }

  private void help() {
    System.out.println("Help: List of Tron Wallet-cli commands");
    System.out.println(
        "For more information on a specific command, type the command and it will display tips");
    System.out.println("");

    for (String commandItem : commandHelp) {
      System.out.println(commandItem);
    }

    System.out.println("Exit or Quit");

    System.out.println("Input any one of the listed commands, to display how-to tips.");
  }

  private String[] getCmd(String cmdLine) {
    if (cmdLine.indexOf("\"") < 0 || cmdLine.toLowerCase().startsWith("deploycontract")
        || cmdLine.toLowerCase().startsWith("triggercontract")
        || cmdLine.toLowerCase().startsWith("triggerconstantcontract")
        || cmdLine.toLowerCase().startsWith("updateaccountpermission")) {
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
    System.out.println(" ");
    System.out.println("Welcome to Tron Wallet-Cli");
    System.out.println("Please type one of the following commands to proceed.");
    System.out.println("Login, RegisterWallet or ImportWallet");
    System.out.println(" ");
    System.out.println(
        "You may also use the Help command at anytime to display a full list of commands.");
    System.out.println(" ");

    try {
      Terminal terminal = TerminalBuilder.builder().system(true).dumb(true).build();
      Completer commandCompleter = new StringsCompleter(commandList);
      LineReader lineReader = LineReaderBuilder.builder()
          .terminal(terminal)
          .completer(commandCompleter)
          .build();
      String prompt = "wallet> ";

      while (true) {
        String cmd = "";
        try {
          String cmdLine = lineReader.readLine(prompt).trim();
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
              importWalletByBase64();
              break;
            }
            case "changepassword": {
              changePassword();
              break;
            }
            case "clearcontractabi": {
              clearContractABI(parameters);
              break;
            }
            case "updatebrokerage": {
              updateBrokerage(parameters);
              break;
            }
            case "getreward": {
              getReward(parameters);
              break;
            }
            case "getbrokerage": {
              getBrokerage(parameters);
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
            case "loadshieldedwallet": {
              loadShieldedWallet();
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
              getBalance(parameters);
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
            case "withdrawbalance": {
              withdrawBalance(parameters);
              break;
            }
            case "unfreezeasset": {
              unfreezeAsset(parameters);
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
            case "gettransactionsfromthis": {
              getTransactionsFromThis(parameters);
              break;
            }
            case "gettransactionstothis": {
              getTransactionsToThis(parameters);
              break;
            }
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
            case "getspendingkey": {
              getSpendingKey();
              break;
            }
            case "getexpandedspendingkey": {
              getExpandedSpendingKey(parameters);
              break;
            }
            case "getakfromask": {
              getAkFromAsk(parameters);
              break;
            }
            case "getnkfromnsk": {
              getNkFromNsk(parameters);
              break;
            }
            case "getincomingviewingkey": {
              getIncomingViewingKey(parameters);
              break;
            }
            case "getdiversifier": {
              getDiversifier(parameters);
              break;
            }
            case "getshieldedpaymentaddress": {
              getShieldedPaymentAddress(parameters);
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
              triggerContract(parameters, false);
              break;
            }
            case "triggerconstantcontract": {
              triggerContract(parameters, true);
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
            case "updateaccountpermission": {
              updateAccountPermission(parameters);
              break;
            }
            case "gettransactionsignweight": {
              getTransactionSignWeight(parameters);
              break;
            }
            case "gettransactionapprovedlist": {
              getTransactionApprovedList(parameters);
              break;
            }
            case "addtransactionsign": {
              addTransactionSign(parameters);
              break;
            }
            case "broadcasttransaction": {
              broadcastTransaction(parameters);
              break;
            }
            case "generateshieldedaddress": {
              generateShieldedAddress(parameters);
              break;
            }
            case "listshieldedaddress": {
              listShieldedAddress();
              break;
            }
            case "sendshieldedcoin": {
              sendShieldedCoin(parameters);
              break;
            }
            case "sendshieldedcoinwithoutask": {
              sendShieldedCoinWithoutAsk(parameters);
              break;
            }
            case "listshieldednote": {
              listShieldedNote(parameters);
              break;
            }
            case "resetshieldednote": {
              resetShieldedNote();
              break;
            }
            case "scannotebyivk": {
              scanNoteByIvk(parameters);
              break;
            }
            case "scannotebyovk": {
              ScanNoteByOvk(parameters);
              break;
            }
            case "getshieldednullifier": {
              getShieldedNullifier(parameters);
              break;
            }
            case "scanandmarknotebyaddress": {
              scanAndMarkNoteByAddress(parameters);
              break;
            }
            case "importshieldedaddress": {
              importShieldedAddress();
              break;
            }
            case "backupshieldedaddress": {
              backupShieldedAddress();
              break;
            }
            case "create2": {
              create2(parameters);
              break;
            }
            case "marketsellasset": {
              marketSellAsset(parameters);
              break;
            }
            case "marketcancelorder": {
              marketCancelOrder(parameters);
              break;
            }
            case "getmarketorderbyaccount": {
              getMarketOrderByAccount(parameters);
              break;
            }
            case "getmarketpricebypair": {
              getMarketPriceByPair(parameters);
              break;
            }
            case "getmarketorderlistbypair": {
              getMarketOrderListByPair(parameters);
              break;
            }
            case "getmarketpairlist": {
              getMarketPairList(parameters);
              break;
            }
            case "getmarketorderbyid": {
              getMarketOrderById(parameters);
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
        } catch (EndOfFileException e) {
          System.out.println("\nBye.");
          return;
        } catch (Exception e) {
          System.out.println(cmd + " failed!");
          System.out.println(e.getMessage());
          e.printStackTrace();
        }
      }
    } catch (IOException e) {
      System.out.println("\nBye.");
      return;
    }
  }

  private void getChainParameters() {
    Optional<ChainParameters> result = walletApiWrapper.getChainParameters();
    if (result.isPresent()) {
      ChainParameters chainParameters = result.get();
      System.out.println(Utils.formatMessageString(chainParameters));
    } else {
      System.out.println("GetChainParameters failed !!");
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
