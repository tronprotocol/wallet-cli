package org.tron.walletcli;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.enums.NetType.CUSTOM;
import static org.tron.common.utils.CommandHelpUtil.getCommandHelp;
import static org.tron.common.utils.Utils.EMPTY_STR;
import static org.tron.common.utils.Utils.MAX_LENGTH;
import static org.tron.common.utils.Utils.MIN_LENGTH;
import static org.tron.common.utils.Utils.VERSION;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.common.utils.Utils.getLong;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.isValid;
import static org.tron.common.utils.Utils.isValidWalletName;
import static org.tron.common.utils.Utils.printBanner;
import static org.tron.common.utils.Utils.printHelp;
import static org.tron.common.utils.Utils.printStackTrace;
import static org.tron.common.utils.Utils.successfulHighlight;
import static org.tron.keystore.StringUtils.byte2Char;
import static org.tron.keystore.StringUtils.char2Byte;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

import com.beust.jcommander.JCommander;
import com.beust.jcommander.Parameter;
import com.google.common.primitives.Longs;
import com.google.protobuf.InvalidProtocolBufferException;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Paths;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.tuple.Pair;
import org.bouncycastle.util.encoders.Hex;
import org.hid4java.HidDevice;
import org.jline.reader.Completer;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.impl.completer.StringsCompleter;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.tron.api.GrpcAPI.AddressPrKeyPairMessage;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.SignUtils;
import org.tron.common.enums.NetType;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.PathUtil;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.manager.UpdateAccountPermissionInteractive;
import org.tron.keystore.StringUtils;
import org.tron.ledger.TronLedgerGetAddress;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.LedgerUserHelper;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.protos.Protocol;
import org.tron.protos.contract.Common.ResourceCode;
import org.tron.trident.api.GrpcAPI;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;
import org.tron.walletserver.WalletApi;

public class Client {

  private WalletApiWrapper walletApiWrapper = new WalletApiWrapper();
  private static int retryTime = 3;

  // note: this is sorted by alpha
  private static String[] commandList = {
      "AddTransactionSign",
      "ApproveProposal",
      "AssetIssue",
      "BackupWallet",
      "BackupWallet2Base64",
      "ExportWalletMnemonic",
      "ExportWalletKeystore",
      "ImportWalletByKeystore",
      "BroadcastTransaction",
      "CancelAllUnfreezeV2",
      "ChangePassword",
      "ClearContractABI",
      "ClearWalletKeystore",
      "Create2",
      "CreateAccount",
      "CreateProposal",
      "CreateWitness",
      "CurrentNetwork",
      "DelegateResource",
      "DeleteProposal",
      "DeployContract",
      "EstimateEnergy",
      "ExchangeCreate",
      "ExchangeInject",
      "ExchangeTransaction",
      "ExchangeWithdraw",
      "FreezeBalance",
      "FreezeBalanceV2",
      "GasFreeTrace",
      "GasFreeTransfer",
      "GenerateAddress",
      "GenerateSubAccount",
      "GetAccount",
      "GetAccountNet",
      "GetAccountResource",
      "GetAddress",
      "GetAssetIssueByAccount",
      "GetAssetIssueById",
      "GetAssetIssueByName",
      "GetAssetIssueListByName",
      "GetBalance",
      "GetBandwidthPrices",
      "GetBlock",
      "GetBlockById",
      "GetBlockByIdOrNum",
      "GetBlockByLatestNum",
      "GetBlockByLimitNext",
      "GetBrokerage",
      "GetChainParameters",
      "GetContract",
      "GetContractInfo",
      "GetDelegatedResource",
      "GetDelegatedResourceV2",
      "GetDelegatedResourceAccountIndex",
      "GetDelegatedResourceAccountIndexV2",
      "GetCanDelegatedMaxSize",
      "GetAvailableUnfreezeCount",
      "GetCanWithdrawUnfreezeAmount",
      "GetEnergyPrices",
      "GetExchange",
      "GasFreeInfo",
      "GetMarketOrderByAccount",
      "GetMarketOrderById",
      "GetMarketOrderListByPair",
      "GetMarketPairList",
      "GetMarketPriceByPair",
      "GetMemoFee",
      "GetNextMaintenanceTime",
      "GetProposal",
      "GetReward",
      "GetTransactionApprovedList",
      "GetTransactionById",
      "GetTransactionCountByBlockNum",
      "GetTransactionInfoByBlockNum",
      "GetTransactionInfoById",
      "GetTransactionSignWeight",
      "Help",
      "ImportWallet",
      "ImportWalletByMnemonic",
      "ImportWalletByLedger",
      "ImportWalletByBase64",
      "ListAssetIssue",
      "ListAssetIssuePaginated",
      "ListExchanges",
      "ListExchangesPaginated",
      "ListNodes",
      "ListProposals",
      "ListProposalsPaginated",
      "ListWitnesses",
      "Lock",
      "Login",
      "LoginAll",
      "Logout",
      "MarketCancelOrder",
      "MarketSellAsset",
      "ModifyWalletName",
      "ParticipateAssetIssue",
      "RegisterWallet",
      "ResetWallet",
      "SendCoin",
      "SetAccountId",
      "SwitchNetwork",
      "SwitchWallet",
      "TransferAsset",
      "TransferUSDT",
      "TriggerConstantContract",
      "TriggerContract",
      "UnDelegateResource",
      "UnfreezeAsset",
      "UnfreezeBalance",
      "UnfreezeBalanceV2",
      "Unlock",
      "UpdateAccount",
      "UpdateAccountPermission",
      "UpdateAsset",
      "UpdateBrokerage",
      "UpdateEnergyLimit",
      "UpdateSetting",
      "UpdateWitness",
      "ViewBackupRecords",
      "ViewTransactionHistory",
      "VoteWitness",
      "WithdrawBalance",
      "WithdrawExpireUnfreeze",
  };

  @Parameter(names = {"-v", "--version"}, description = "Display version information", help = true)
  private boolean version;

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

  private List<String> inputMnemonicWords() {
    try {
      List<String> words = readWordsWithRetry();
      if (words != null) {
        return words;
      } else {
        System.out.println("\nMaximum retry attempts reached, program exiting.");
      }
    } catch (Exception e) {
      System.out.println("An error occurred in the program." + e.getMessage());
    }
    return Collections.emptyList();
  }

  private static List<String> readWordsWithRetry() {
    int REQUIRED_WORDS_12 = 12;
    int REQUIRED_WORDS_24 = 24;
    int MAX_RETRY = 2;

    int retryCount = 0;
    while (retryCount <= MAX_RETRY) {
      try {
        System.out.printf("%nPlease enter 12 or 24 words (separated by spaces) [Attempt %d/%d]:%n",
            retryCount + 1, MAX_RETRY + 1);
        String line = readLine();
        if (line.isEmpty()) {
          System.err.println("Error: Input cannot be empty.");
          retryCount++;
          continue;
        }
        String[] wordArray = line.split("\\s+");
        if (wordArray.length != REQUIRED_WORDS_12 && wordArray.length != REQUIRED_WORDS_24) {
          System.err.printf("Error: Expected 12 or 24 words, but %d words were entered.",
              wordArray.length);
          retryCount++;
          continue;
        }
        List<String> validatedWords = validateWords(wordArray);
        if (validatedWords != null) {
          return validatedWords;
        }
        retryCount++;
      } catch (Exception e) {
        System.err.println("Error: " + e.getMessage());
        retryCount++;
      }
    }
    return null;
  }

  private static String readLine() {
    StringBuilder input = new StringBuilder();
    try {
      int c;
      boolean isFirstChar = true;
      while ((c = System.in.read()) != -1) {
        if (c == 13) { // CR (\r)
          continue;
        }
        if (c == 10) { // LF (\n)
          if (input.length() > 0) {
            break;
          }
          continue;
        }
        if (isFirstChar && Character.isWhitespace(c)) {
          continue;
        }
        isFirstChar = false;
        input.append((char) c);
      }
      while (input.length() > 0 &&
          Character.isWhitespace(input.charAt(input.length() - 1))) {
        input.setLength(input.length() - 1);
      }
    } catch (IOException e) {
      System.err.println(e.getMessage());
    }
    return input.toString();
  }

  private static List<String> validateWords(String[] words) {
    int MIN_WORD_LENGTH = 1;
    final int MAX_WORD_LENGTH = 20;
    List<String> validatedWords = new ArrayList<>();
    for (int i = 0; i < words.length; i++) {
      String word = words[i];
      if (word.length() < MIN_WORD_LENGTH || word.length() > MAX_WORD_LENGTH) {
        System.err.printf("Error: The length of the %dth word '%s' is invalid (should be between %d and %d characters).",
            i + 1, word, MIN_WORD_LENGTH, MAX_WORD_LENGTH);
        return null;
      }
      if (!word.matches("[a-zA-Z]+")) {
        System.err.printf("Error: The %dth word '%s' contains illegal characters (only letters are allowed).",
            i + 1, word);
        return null;
      }
      validatedWords.add(word.toLowerCase());
    }
    String mnemonic = String.join(" ", validatedWords);
    if (!org.web3j.crypto.MnemonicUtils.validateMnemonic(mnemonic)) {
      System.err.println("validate mnemonic failed");
      return null;
    }
    return  validatedWords;
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
    char[] password = Utils.inputPassword2Twice(false);
    int wordsNumber = MnemonicUtils.inputMnemonicWordsNumber();
    if (!MnemonicUtils.inputMnemonicWordsNumberCheck(wordsNumber)) {
      return ;
    }
    String fileName = walletApiWrapper.registerWallet(password, wordsNumber);
    StringUtils.clear(password);

    if (null == fileName) {
      System.out.println("Register wallet " + failedHighlight() + " !!");
      return;
    }

    System.out.println("Register a wallet " + successfulHighlight() + ", keystore file : ."
        + File.separator + "Wallet" + File.separator
        + fileName);
    System.out.println("(Note: If you delete an account, make sure to delete the wallet file and mnemonic file) ");
  }

  private void generateSubAccount() throws CipherException, IOException {
    boolean ret = walletApiWrapper.generateSubAccount();
    if (ret) {
      System.out.println("generateSubAccount " + successfulHighlight() + ".");
    } else {
      System.out.println("generateSubAccount " + failedHighlight() + ".");
    }
  }

  private void importWallet() throws CipherException, IOException {
    System.out.println("(Note:This operation will overwrite the old keystore file and mnemonic file of the same address)");
    System.out.println("Please make sure to back up the old keystore files in the Wallet/Mnemonic directory if it is still needed!");
    char[] password = walletApiWrapper.isUnifiedExist()  ?
        byte2Char(walletApiWrapper.getWallet().getUnifiedPassword()) : Utils.inputPassword2Twice(false);
    byte[] priKey = inputPrivateKey();

    String fileName = walletApiWrapper.importWallet(password, priKey, null);
    StringUtils.clear(password);
    StringUtils.clear(priKey);

    if (null == fileName) {
      System.out.println("Import wallet " + failedHighlight() + " !!");
      return;
    }
    System.out.println("Import a wallet " + successfulHighlight() + ", keystore file : ."
        + File.separator + "Wallet" + File.separator
        + fileName);
  }

  private void importWalletByMnemonic() throws IOException {
    System.out.println("(Note:This operation will overwrite the old keystore file and mnemonic file of the same address)");
    System.out.println("Please make sure to back up the old keystore files in the Wallet/Mnemonic directory if it is still needed!");
    char[] password = walletApiWrapper.isUnifiedExist()  ?
        byte2Char(walletApiWrapper.getWallet().getUnifiedPassword()) : Utils.inputPassword2Twice(false);
    List<String> mnemonicWords = inputMnemonicWords();
    boolean result = walletApiWrapper.importWalletByMnemonic(mnemonicWords, char2Byte(password));
    if (result) {
      System.out.println("importWalletByMnemonic " + successfulHighlight() + " !");
    } else {
      System.out.println("importWalletByMnemonic " + failedHighlight() + ".");
    }
    if (mnemonicWords != null && !mnemonicWords.isEmpty()) {
      mnemonicWords.clear();
    }
    StringUtils.clear(password);
  }

  private void importWalletByLedger() throws IOException {
    System.out.println(ANSI_RED + "(Note:This will pair Ledger to user your hardware wallet)" + ANSI_RESET);
    // device is using in transaction sign
    HidDevice signDevice = TransactionSignManager.getInstance().getHidDevice();
    if (signDevice != null) {
      System.out.println("Import wallet by Ledger " + failedHighlight() + " !! Please check your Ledger device");
      return;
    }
    HidDevice device  = null;
    char[] password = null;
    try {
      //get unused device
      device  = TronLedgerGetAddress.getInstance().selectDevice();
      if (device == null) {
        LedgerUserHelper.showHidDeviceConnectionError();
        System.out.println("No Ledger device found");
        return ;
      } else {
        System.out.println("Ledger device found: " + device.getProduct());
      }
      password = walletApiWrapper.isUnifiedExist()  ?
          byte2Char(walletApiWrapper.getWallet().getUnifiedPassword()) : Utils.inputPassword2Twice(false);
      String fileName = walletApiWrapper.importWalletByLedger(password, device);
      if (fileName == null || fileName.trim().isEmpty() ) {
        System.out.println("Import wallet by Ledger end !!");
        return;
      }

      System.out.println("Import a wallet by Ledger " + successfulHighlight() + ", keystore file : ."
          + File.separator + "Wallet" + File.separator
          + fileName);

      System.out.println("You are now logged in, and you can perform operations using this account.");
    }  catch (Exception e) {
      System.out.println(e.getMessage());
      System.out.println("Import wallet by Ledger " + failedHighlight());
    } finally {
      StringUtils.clear(password);
      if (device != null) {
        device.close();
      }
    }
  }

  private void importWalletByBase64() throws CipherException, IOException {
    System.out.println("(Note:This operation will overwrite the old keystore file and mnemonic file of the same address)");
    System.out.println("Please make sure to back up the old keystore files in the Wallet/Mnemonic directory if it is still needed!");
    char[] password = walletApiWrapper.isUnifiedExist() ?
        byte2Char(walletApiWrapper.getWallet().getUnifiedPassword()) : Utils.inputPassword2Twice(false);
    byte[] priKey = inputPrivateKey64();

    String fileName = walletApiWrapper.importWallet(password, priKey, null);
    StringUtils.clear(password);
    StringUtils.clear(priKey);

    if (null == fileName) {
      System.out.println("Import wallet " + failedHighlight() + " !!");
      return;
    }
    System.out.println("Import a wallet " + successfulHighlight() + ", keystore file : ."
        + File.separator + "Wallet" + File.separator
        + fileName);
  }

  private void changePassword() throws IOException, CipherException {
    System.out.println("Please input old password.");
    char[] oldPassword = Utils.inputPassword(false);
    char[] newPassword = Utils.inputPassword2Twice(true);
    if (walletApiWrapper.changePassword(oldPassword, newPassword)) {
      System.out.println("ChangePassword " + successfulHighlight() + " !!");
    } else {
      System.out.println("ChangePassword " + failedHighlight() + " !!");
    }
  }

  private void login() throws IOException, CipherException {
    boolean result = walletApiWrapper.login();
    if (result) {
      System.out.println("Login " + successfulHighlight() + " !!!");
    } else {
      System.out.println("Login " + failedHighlight() + " !!!");
    }
  }

  private void loginAll() throws IOException {
    boolean result = walletApiWrapper.loginAll();
    if (result) {
      System.out.println("LoginAll " + successfulHighlight() + " !!!");
    } else {
      System.out.println("LoginAll " + failedHighlight() + " !!!");
    }
  }

  private void switchWallet() {
    boolean result = walletApiWrapper.switchWallet();
    if (result) {
      System.out.println("SwitchWallet " + successfulHighlight() + " !!!");
    } else {
      System.out.println("SwitchWallet " + failedHighlight() + " !!!");
    }
  }

  private void switchNetwork(String[] parameters) throws InterruptedException {
    String netWorkSymbol = EMPTY;
    String fullNode = EMPTY;
    String solidityNode = EMPTY;
    if (ArrayUtils.isNotEmpty(parameters)){
      if (parameters.length == 1) {
        if (isValid(parameters[0])) {
          fullNode = parameters[0];
        } else {
          netWorkSymbol = parameters[0];
        }
      } else if (parameters.length == 2) {
        fullNode = parameters[0];
        solidityNode = parameters[1];
        if (EMPTY_STR.equalsIgnoreCase(fullNode) && EMPTY_STR.equalsIgnoreCase(solidityNode)) {
          System.out.println("Both fullnode and solidity cannot be empty at the same time.");
          System.out.println("SwitchNetwork " + failedHighlight() + " !!!");
          return;
        }
        if (EMPTY_STR.equalsIgnoreCase(fullNode)) {
          fullNode = EMPTY;
        }
        if (EMPTY_STR.equalsIgnoreCase(solidityNode)) {
          solidityNode = EMPTY;
        }
      } else {
        System.out.println("SwitchNetwork needs 1 parameter or 2 parameters like the following: ");
        System.out.println("SwitchNetwork nile");
        System.out.println("or");
        System.out.println("SwitchNetwork localhost:50051 localhost:50052");
        return;
      }
    }
    boolean result = walletApiWrapper.switchNetwork(netWorkSymbol, fullNode, solidityNode);
    if (result) {
      System.out.println("SwitchNetwork " + successfulHighlight() + " !!!");
    } else {
      System.out.println("SwitchNetwork " + failedHighlight() + " !!!");
    }
  }

  private void resetWallet() {
    boolean result = walletApiWrapper.resetWallet();
    if (result) {
      walletApiWrapper.logout();
      System.out.println("resetWallet " + successfulHighlight() + " !!!");
      System.out.println("Now, you can " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " again. Or import the wallet through other means.");
    } else {
      System.out.println("resetWallet " + failedHighlight() + " !!!");
    }
  }

  private void logout() {
    walletApiWrapper.logout();
    System.out.println("Logout " + successfulHighlight() + " !!!");
  }

  private void backupWallet() throws IOException, CipherException {
    byte[] priKey = walletApiWrapper.backupWallet("BackupWallet");
    if (!ArrayUtils.isEmpty(priKey)) {
      System.out.println("BackupWallet " + successfulHighlight() + " !!");
      for (int i = 0; i < priKey.length; i++) {
        StringUtils.printOneByte(priKey[i]);
      }
      System.out.println("\n");
    }
    StringUtils.clear(priKey);
  }

  private void backupWallet2Base64() throws IOException, CipherException {
    byte[] priKey = walletApiWrapper.backupWallet("BackupWallet2Base64");

    if (!ArrayUtils.isEmpty(priKey)) {
      Encoder encoder = Base64.getEncoder();
      byte[] priKey64 = encoder.encode(priKey);
      StringUtils.clear(priKey);
      System.out.println("BackupWallet " + successfulHighlight() + " !!");
      for (int i = 0; i < priKey64.length; i++) {
        System.out.print((char) priKey64[i]);
      }
      System.out.println("\n");
      StringUtils.clear(priKey64);
    }
  }

  private void exportWalletMnemonic() throws IOException, CipherException {
    byte[] mnemonic = walletApiWrapper.exportWalletMnemonic();
    char[] mnemonicChars = bytesToChars(mnemonic);
    if (!ArrayUtils.isEmpty(mnemonic)) {
      System.out.println("exportWalletMnemonic " + successfulHighlight() + " !!");
      outputMnemonicChars(mnemonicChars);
      System.out.println("\n");
    } else {
      System.out.println("exportWalletMnemonic " + failedHighlight() + " !!");
    }
    StringUtils.clear(mnemonic);
    clearChars(mnemonicChars);
  }

  private void exportWalletKeystore(String[] parameters) throws CipherException, IOException {
    if (parameters.length < 2) {
      String tempPath = PathUtil.getTempDirectoryPath();
      System.out.println("Example usage: ExportWalletKeystore tronlink " + tempPath);
      System.out.println("exportWalletKeystore " + failedHighlight() + ", parameters error !!");
      return;
    }

    String channel = parameters[0];
    if (!channel.equalsIgnoreCase("tronlink")) {
      System.out.println("exportWalletKeystore " + failedHighlight() + ", channel error !!");
      System.out.println("currently only tronlink is supported!!");
      return;
    }
    String exportDirPath = parameters[1];
    String exportFullDirPath = PathUtil.toAbsolutePath(exportDirPath);
    File exportFullDir = new File(exportFullDirPath);
    if (!exportFullDir.exists()) {
      System.out.println("exportWalletKeystore " + failedHighlight() + ", directory does not exist !!");
      return;
    }
    if (!exportFullDir.isDirectory()) {
      System.out.println("exportWalletKeystore " + failedHighlight() + ", param 2 is not a directory!!");
      return;
    }
    if (!exportFullDir.canWrite()) {
      System.out.println("exportWalletKeystore " + failedHighlight() + ", directory is not writable!!");
      return;
    }

    String exportFilePath = walletApiWrapper.exportKeystore(channel, exportFullDir);
    if (exportFilePath != null) {
      System.out.println("exported keystore file : " + Paths.get(exportFullDirPath, exportFilePath));
      System.out.println("exportWalletKeystore " + successfulHighlight() + " !!");
    } else {
      System.out.println("exportWalletKeystore " + failedHighlight() + " !!");
    }
  }

  private void importWalletByKeystore(String[] parameters) throws IOException {
    System.out.println("(Note:This operation will overwrite the old keystore file and mnemonic file of the same address)");
    System.out.println("Please make sure to back up the old keystore files in the Wallet/Mnemonic directory if it is still needed!");

    if (parameters.length < 2) {
      System.out.println("Example usage: ImportWalletByKeystore tronlink tronlink-export-keystore.json");
      System.out.println("importWalletByKeystore " + failedHighlight() + ", parameters error !!");
      return;
    }

    String channel = parameters[0];
    if (!channel.equalsIgnoreCase("tronlink")) {
      System.out.println("importWalletByKeystore " + failedHighlight() + ", channel error !!");
      return ;
    }
    String importPath = parameters[1];
    String importFilePath = PathUtil.toAbsolutePath(importPath);
    File importFile = new File(importFilePath);
    if (!importFile.exists()) {
      System.out.println("importWalletByKeystore " + failedHighlight() + ", keystore file to import not exists !!");
      return ;
    }
    if (importFile.isDirectory()) {
      System.out.println("Example usage: ImportWalletByKeystore tronlink tronlink-export-keystore.json");
      System.out.println("importWalletByKeystore " + failedHighlight() + ", parameters 2 is a directory!!");
      return ;
    }

    System.out.println("Please enter the password for the keystore file, enter it once.");
    char[] keystorePassword = Utils.inputPasswordWithoutCheck();
    byte[] keystorePasswdByte = char2Byte(keystorePassword);

    try {
      String fileName = walletApiWrapper.importWalletByKeystore(keystorePasswdByte, importFile);
      if (fileName != null && !fileName.isEmpty()) {
        System.out.println("fileName = " + fileName);
        System.out.println("importWalletByKeystore " + successfulHighlight() + " !!");
      } else {
        System.out.println("importWalletByKeystore " + failedHighlight() + " !!");
      }
    } catch (Exception e) {
      System.out.println("importWalletByKeystore " + failedHighlight() + " !!");
    } finally {
      StringUtils.clear(keystorePassword);
      StringUtils.clear(keystorePasswdByte);
    }
  }

  private char[] bytesToChars(byte[] bytes) {
    char[] chars = new char[bytes.length];
    for (int i = 0; i < bytes.length; i++) {
      chars[i] = (char) (bytes[i] & 0xFF);
    }
    return chars;
  }

  private void outputMnemonicChars(char[] mnemonic) {
    for (char c : mnemonic) {
      System.out.print(c);
    }
    System.out.println();
  }

  private void clearChars(char[] mnemonic) {
    Arrays.fill(mnemonic, '\0');
  }

  private void getAddress() {
    String address = walletApiWrapper.getAddress();
    if (address != null) {
      System.out.println("GetAddress " + successfulHighlight() + " !!");
      System.out.println("address = " + address);
    } else {
      System.out.println("Warning: GetAddress " + failedHighlight() + ",  Please login first !!");
    }
  }

  private void getBalance(String[] parameters) {
    Response.Account account;
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
      System.out.println("GetBalance " + failedHighlight() + " !!!!");
    } else {
      long balance = account.getBalance();
      System.out.println("Balance = " + balance + " SUN = " + balance / 1000000 + " TRX");
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

    Response.Account account = WalletApi.queryAccount(addressBytes);
    if (account == null) {
      System.out.println("GetAccount " + failedHighlight() + " !!!!");
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

    Response.Account account = WalletApi.queryAccountById(accountId);
    if (account == null) {
      System.out.println("GetAccountById " + failedHighlight() + " !!!!");
    } else {
      System.out.println(Utils.formatMessageString(account));
    }
  }

  private void updateAccount(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("Update Account " + successfulHighlight() + " !!!!");
    } else {
      System.out.println("Update Account " + failedHighlight() + " !!!!");
    }
  }

  private void setAccountId(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("Set AccountId " + successfulHighlight() + " !!!!");
    } else {
      System.out.println("Set AccountId " + failedHighlight() + " !!!!");
    }
  }

  private void updateAsset(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
    long newLimit = Long.parseLong(newLimitString);
    long newPublicLimit = Long.parseLong(newPublicLimitString);

    boolean ret = walletApiWrapper
        .updateAsset(ownerAddress, descriptionBytes, urlBytes, newLimit, newPublicLimit);
    if (ret) {
      System.out.println("Update Asset " + successfulHighlight() + " !!!!");
    } else {
      System.out.println("Update Asset " + failedHighlight() + " !!!!");
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
    Response.AssetIssueList assetIssueList = WalletApi.getAssetIssueByAccount(addressBytes);
    if (assetIssueList != null) {
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueByAccount " + failedHighlight() + " !!");
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

    Response.AccountNetMessage result = WalletApi.getAccountNet(addressBytes);
    if (result == null) {
      System.out.println("GetAccountNet " + failedHighlight() + " !!");
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

    Response.AccountResourceMessage result = WalletApi.getAccountResource(addressBytes);
    if (result == null) {
      System.out.println("getAccountResource " + failedHighlight() + " !!");
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

    Contract.AssetIssueContract assetIssueContract = walletApiWrapper.getAssetIssueByName(assetName);
    if (assetIssueContract != null) {
      System.out.println(Utils.formatMessageString(assetIssueContract));
    } else {
      System.out.println("getAssetIssueByName " + failedHighlight() + " !!");
    }
  }

  private void getAssetIssueListByName(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getAssetIssueListByName needs 1 parameter like following: ");
      System.out.println("getAssetIssueListByName AssetName ");
      return;
    }
    String assetName = parameters[0];

    Response.AssetIssueList assetIssueList = walletApiWrapper.getAssetIssueListByName(assetName);
    if (assetIssueList != null) {
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("getAssetIssueListByName " + failedHighlight() + " !!");
    }
  }

  private void getAssetIssueById(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("getAssetIssueById needs 1 parameter like following: ");
      System.out.println("getAssetIssueById AssetId ");
      return;
    }
    String assetId = parameters[0];

    Contract.AssetIssueContract assetIssueContract = walletApiWrapper.getAssetIssueById(assetId);
    if (assetIssueContract != null) {
      System.out.println(Utils.formatMessageString(assetIssueContract));
    } else {
      System.out.println("getAssetIssueById " + failedHighlight() + " !!");
    }
  }

  private void sendCoin(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
    long amount = Long.parseLong(amountStr);

    boolean result = walletApiWrapper.sendCoin(ownerAddress, toAddress, amount);
    if (result) {
      System.out.println("Send " + amount + " Sun to " + base58ToAddress + " " + successfulHighlight() + " !!");
    } else {
      System.out.println("Send " + amount + " Sun to " + base58ToAddress + " " + failedHighlight() + " !!");
    }
  }

  private void transferAsset(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
    long amount = Long.parseLong(amountStr);

    boolean result = walletApiWrapper.transferAsset(ownerAddress, toAddress, assertName, amount);
    if (result) {
      System.out.println("TransferAsset " + amount + " to " + base58Address + " " + successfulHighlight() + " !!");
    } else {
      System.out.println("TransferAsset " + amount + " to " + base58Address + " " + failedHighlight() + " !!");
    }
  }

  private void participateAssetIssue(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("ParticipateAssetIssue " + assertName + " " + amount + " from " + base58Address
              + " " + successfulHighlight() + " !!");
    } else {
      System.out.println("ParticipateAssetIssue " + assertName + " " + amount + " from " + base58Address
              + " " + failedHighlight() + " !!");
    }
  }

  private void assetIssue(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || parameters.length < 12) {
      System.out.println("Use the assetIssue command for features that you require with below syntax: ");
      System.out.println("AssetIssue [OwnerAddress] AssetName AbbrName TotalSupply TrxNum AssetNum Precision "
              + "StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit "
              + "FrozenAmount0 FrozenDays0 ... FrozenAmountN FrozenDaysN");
      System.out.println("TrxNum and AssetNum represents the conversion ratio of the tron to the asset.");
      System.out.println("The StartDate and EndDate format should look like 2018-03-01 2018-03-21 .");
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
    long totalSupply = Long.parseLong(totalSupplyStr);
    int trxNum = Integer.parseInt(trxNumStr);
    int icoNum = Integer.parseInt(icoNumStr);
    int precision = Integer.parseInt(precisionStr);
    Date startDate = Utils.strToDateLong(startYyyyMmDd);
    Date endDate = Utils.strToDateLong(endYyyyMmDd);
    if (startDate == null || endDate == null) {
      System.out
          .println("The StartDate and EndDate format should look like 2018-03-01 2018-03-21 .");
      System.out.println("AssetIssue " + name + " " + failedHighlight() + " !!");
      return;
    }
    long startTime = startDate.getTime();
    long endTime = endDate.getTime();
    long freeAssetNetLimit = Long.parseLong(freeNetLimitPerAccount);
    long publicFreeNetLimit = Long.parseLong(publicFreeNetLimitString);

    boolean result = walletApiWrapper.assetIssue(ownerAddress, name, abbrName, totalSupply,
        trxNum, icoNum, precision, startTime, endTime, 0,
        description, url, freeAssetNetLimit, publicFreeNetLimit, frozenSupply);
    if (result) {
      System.out.println("AssetIssue " + name + " " + successfulHighlight() + " !!");
    } else {
      System.out.println("AssetIssue " + name + " " + failedHighlight() + " !!");
    }
  }

  private void createAccount(String[] parameters)
      throws CipherException, IOException, CancelException, IllegalException {
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
      System.out.println("CreateAccount " + successfulHighlight() + " !!");
    } else {
      System.out.println("CreateAccount " + failedHighlight() + " !!");
    }
  }

  private void createWitness(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("CreateWitness " + successfulHighlight() + " !!");
    } else {
      System.out.println("CreateWitness " + failedHighlight() + " !!");
    }
  }

  private void updateWitness(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("updateWitness " + successfulHighlight() + " !!");
    } else {
      System.out.println("updateWitness " + failedHighlight() + " !!");
    }
  }

  private void listWitnesses() {
    Response.WitnessList witnessList = walletApiWrapper.listWitnesses();
    if (witnessList != null) {
      System.out.println(Utils.formatMessageString(witnessList));
    } else {
      System.out.println("List witnesses " + failedHighlight() + " !!");
    }
  }

  private void getAssetIssueList() {
    Response.AssetIssueList assetIssueList = walletApiWrapper.getAssetIssueList();
    if (assetIssueList != null) {
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueList " + failedHighlight() + " !!");
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
    Response.AssetIssueList assetIssueList = walletApiWrapper.getPaginatedAssetIssueList(offset, limit);
    if (assetIssueList != null) {
      System.out.println(Utils.formatMessageString(assetIssueList));
    } else {
      System.out.println("GetAssetIssueListPaginated " + failedHighlight() + " !!!");
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
    Response.ProposalList proposalList = walletApiWrapper.getProposalListPaginated(offset, limit);
    if (proposalList != null) {
      System.out.println(Utils.formatMessageString(proposalList));
    } else {
      System.out.println("ListProposalsPaginated " + failedHighlight() + " !!!");
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
    Response.ExchangeList exchangeList = walletApiWrapper.getExchangeListPaginated(offset, limit);
    if (exchangeList != null) {
      System.out.println(Utils.formatMessageString(exchangeList));
    } else {
      System.out.println("ListExchangesPaginated " + failedHighlight() + " !!!");
    }
  }

  private void listNodes() {
    Response.NodeList nodeList = walletApiWrapper.listNodes();
    if (nodeList != null) {
      List<Response.NodeList.Node> list = nodeList.getNodesList();
      for (int i = 0; i < list.size(); i++) {
        Response.NodeList.Node node = list.get(i);
        System.out.println("IP::" + ByteArray.toStr(node.getAddress().getHost().toByteArray()));
        System.out.println("Port::" + node.getAddress().getPort());
      }
    } else {
      System.out.println("GetAssetIssueList " + failedHighlight() + " !!!");
    }
  }

  private void getBlock(String[] parameters) throws InvalidProtocolBufferException, IllegalException {
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

    Response.BlockExtention blockExtention = walletApiWrapper.getBlock2(blockNum);
    if (blockExtention == null) {
      System.out.println("No block for num : " + blockNum);
      return;
    }
    System.out.println(Utils.printBlockExtention(blockExtention));
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
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("VoteWitness " + successfulHighlight() + " !!!");
    } else {
      System.out.println("VoteWitness " + failedHighlight() + " !!!");
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
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 2 || parameters.length == 3
        || parameters.length == 4 || parameters.length == 5)) {
      System.out.println("Use freezeBalance command with below syntax: ");
      System.out.println("freezeBalance [OwnerAddress] frozen_balance frozen_duration "
          + "[ResourceCode:0 BANDWIDTH,1 ENERGY,2 TRON_POWER] [receiverAddress]");
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
      System.out.println("FreezeBalance " + successfulHighlight() + " !!!");
    } else {
      System.out.println("FreezeBalance " + failedHighlight() + " !!!");
    }
  }

  private void freezeBalanceV2(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 2 || parameters.length == 3)) {
      System.out.println("Use freezeBalanceV2 command with below syntax: ");
      System.out.println("freezeBalanceV2 [OwnerAddress] frozen_balance "
              + "[ResourceCode:0 BANDWIDTH,1 ENERGY,2 TRON_POWER]");
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
    int resourceCode = 0;

    if ((!hasOwnerAddressPara && (parameters.length == 2)) ||
            (hasOwnerAddressPara && (parameters.length == 3))) {
      try {
        resourceCode = Integer.parseInt(parameters[index]);
      } catch (NumberFormatException e) {
        System.out.println("freezeBalanceV2  [ResourceCode:0 BANDWIDTH,1 ENERGY,2 TRON_POWER]");
        return;
      }
    }

    boolean result = walletApiWrapper.freezeBalanceV2(ownerAddress, frozen_balance
            , resourceCode);
    if (result) {
      System.out.println("freezeBalanceV2 " + successfulHighlight() + " !!!");
    } else {
      System.out.println("freezeBalanceV2 " + failedHighlight() + " !!!");
    }
  }

  private void unfreezeBalance(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || parameters.length < 1 || parameters.length > 3) {
      System.out.println("Use unfreezeBalance command with below syntax: ");
      System.out.println(
          "unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH,1 ENERGY,2 TRON_POWER) [receiverAddress]");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    int resourceCode = 0;
    byte[] receiverAddress = null;
    if (parameters.length == 1) {
      resourceCode = Integer.parseInt(parameters[index++]);
    } else if (parameters.length == 2) {
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
      System.out.println("UnfreezeBalance " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UnfreezeBalance " + failedHighlight() + " !!!");
    }
  }

  private void unfreezeBalanceV2(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 2 || parameters.length == 3)) {
      System.out.println("Use unfreezeBalanceV2 command with below syntax: ");
      System.out.println(
              "unfreezeBalanceV2 [OwnerAddress] unfreezeBalance ResourceCode(0 BANDWIDTH,1 ENERGY,2 TRON_POWER)");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    long unfreezeBalance = 0;
    int resourceCode = 0;
    if (parameters.length == 2) {
      unfreezeBalance = Long.parseLong(parameters[index++]);
      resourceCode = Integer.parseInt(parameters[index++]);
    } else if (parameters.length == 3) {
      ownerAddress = getAddressBytes(parameters[index]);
      if (ownerAddress != null) {
        index++;
        unfreezeBalance = Long.parseLong(parameters[index++]);
        resourceCode = Integer.parseInt(parameters[index++]);
      } else {
        System.out.println(
                "unfreezeBalanceV2 OwnerAddress is invalid");
        return;
      }
    }

    boolean result = walletApiWrapper.unfreezeBalanceV2(ownerAddress, unfreezeBalance, resourceCode);
    if (result) {
      System.out.println("unfreezeBalanceV2 " + successfulHighlight() + " !!!");
    } else {
      System.out.println("unfreezeBalanceV2 " + failedHighlight() + " !!!");
    }
  }

  private void withdrawExpireUnfreeze(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 0 || parameters.length == 1)) {
      System.out.println("Use withdrawExpireUnfreeze command with below syntax: ");
      System.out.println(
              "withdrawExpireUnfreeze OwnerAddress");
      return;
    }

    byte[] ownerAddress = null;
    if (parameters.length == 1) {
      ownerAddress = getAddressBytes(parameters[0]);
      if (ownerAddress == null) {
        System.out.println(
                "withdrawExpireUnfreeze OwnerAddress is invalid");
        return;
      }
    }

    boolean result = walletApiWrapper.withdrawExpireUnfreeze(ownerAddress);
    if (result) {
      System.out.println("withdrawExpireUnfreeze " + successfulHighlight() + " !!!");
    } else {
      System.out.println("withdrawExpireUnfreeze " + failedHighlight() + " !!!");
    }
  }

  private void delegateResource(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 3 || parameters.length == 4 || parameters.length == 5 || parameters.length == 6)) {
      System.out.println("Use delegateResource command with below syntax: ");
      System.out.println(
              "delegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), "
                  + "ReceiverAddress [lock] [lockPeriod]");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    long balance;
    int resourceCode;
    byte[] receiverAddress;
    boolean lock = false;
    long lockPeriod = 0;

    if (parameters.length == 3) {
      balance = Long.parseLong(parameters[index++]);
      resourceCode = Integer.parseInt(parameters[index++]);
      receiverAddress = getAddressBytes(parameters[index]);
      if (receiverAddress == null) {
        System.out.println(
                "delegateResource receiverAddress is invalid");
        return;
      }
    } else {
      ownerAddress = getAddressBytes(parameters[index]);
      if (ownerAddress != null) {
        index ++;
      }
      balance = Long.parseLong(parameters[index++]);
      resourceCode = Integer.parseInt(parameters[index++]);
      receiverAddress = getAddressBytes(parameters[index++]);
      if (receiverAddress == null) {
        System.out.println(
            "delegateResource receiverAddress is invalid");
        return;
      }

      if ((ownerAddress != null && parameters.length == 5) || (ownerAddress == null && parameters.length == 4)) {
        lock = Boolean.parseBoolean(parameters[index++]);
      }
      if (parameters.length == 6 || (ownerAddress == null && parameters.length == 5)) {
        lock = Boolean.parseBoolean(parameters[index++]);
        lockPeriod = Long.parseLong(parameters[index]);
      }
    }

    boolean result = walletApiWrapper.delegateresource(
        ownerAddress, balance, resourceCode, receiverAddress, lock, lockPeriod);
    if (result) {
      System.out.println("delegateResource " + successfulHighlight() + " !!!");
    } else {
      System.out.println("delegateResource " + failedHighlight() + " !!!");
    }
  }

  private void unDelegateResource(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || !(parameters.length == 3 || parameters.length == 4)) {
      System.out.println("Use unDelegateResource command with below syntax: ");
      System.out.println(
              "unDelegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), ReceiverAddress");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    long balance = 0;
    int resourceCode = 0;
    byte[] receiverAddress = null;
    if (parameters.length == 3) {
      balance = Long.parseLong(parameters[index++]);
      resourceCode = Integer.parseInt(parameters[index++]);
      receiverAddress = getAddressBytes(parameters[index++]);
      if (receiverAddress == null) {
        System.out.println(
                "unDelegateResource receiverAddress is invalid");
        return;
      }
    } else if (parameters.length == 4) {
      ownerAddress = getAddressBytes(parameters[index++]);
      if (ownerAddress != null) {
        balance = Long.parseLong(parameters[index++]);
        resourceCode = Integer.parseInt(parameters[index++]);
        receiverAddress = getAddressBytes(parameters[index++]);
        if (receiverAddress == null) {
          System.out.println(
                  "unDelegateResource receiverAddress is invalid");
          return;
        }
      } if (ownerAddress == null) {
        System.out.println(
                "unDelegateResource ownerAddress is invalid");
        return;
      }
    }
    boolean result = walletApiWrapper.undelegateresource(ownerAddress, balance, resourceCode, receiverAddress);
    if (result) {
      System.out.println("unDelegateResource " + successfulHighlight() + " !!!");
    } else {
      System.out.println("unDelegateResource " + failedHighlight() + " !!!");
    }
  }

  private void cancelAllUnfreezeV2(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters.length > 0) {
      System.out.println("Use CancelAllUnfreezeV2 command with below syntax: ");
      System.out.println("CancelAllUnfreezeV2");
      return;
    }
    boolean result = walletApiWrapper.cancelAllUnfreezeV2();
    if (result) {
      System.out.println("cancelAllUnfreezeV2 " + successfulHighlight() + " !!!");
    } else {
      System.out.println("cancelAllUnfreezeV2 " + failedHighlight() + " !!!");
    }
  }

  private void getBandwidthPrices(String[] parameters) {
    if (parameters.length > 0) {
      System.out.println("Use GetBandwidthPrices command with below syntax: ");
      System.out.println("GetBandwidthPrices");
      return;
    }
    Response.PricesResponseMessage result = walletApiWrapper.getBandwidthPrices();
    System.out.println("The BandwidthPrices is " + result.getPrices());
  }

  private void getEnergyPrices(String[] parameters) {
    if (parameters.length > 0) {
      System.out.println("Use GetEnergyPrices command with below syntax: ");
      System.out.println("GetEnergyPrices");
      return;
    }
    Response.PricesResponseMessage result = walletApiWrapper.getEnergyPrices();
    System.out.println("The EnergyPrices is "+ result.getPrices());
  }

  private void getMemoFee(String[] parameters) {
    if (parameters.length > 0) {
      System.out.println("Use GetMemoFee command with below syntax: ");
      System.out.println("GetMemoFee");
      return;
    }
    Response.PricesResponseMessage result = walletApiWrapper.getMemoFee();
    System.out.println("The MemoFee is " + result.getPrices());
  }

  private void unfreezeAsset(String[] parameters) throws IOException,
      CipherException, CancelException, IllegalException {
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
      System.out.println("UnfreezeAsset " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UnfreezeAsset " + failedHighlight() + " !!!");
    }
  }

  private void createProposal(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      long id = Long.parseLong(parameters[index++]);
      long value = Long.parseLong(parameters[index++]);
      parametersMap.put(id, value);
    }
    boolean result = walletApiWrapper.createProposal(ownerAddress, parametersMap);
    if (result) {
      System.out.println("CreateProposal " + successfulHighlight() + " !!");
    } else {
      System.out.println("CreateProposal " + failedHighlight() + " !!");
    }
  }

  private void approveProposal(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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

    long id = Long.parseLong(parameters[index++]);
    boolean isAddApproval = Boolean.parseBoolean(parameters[index++]);
    boolean result = walletApiWrapper.approveProposal(ownerAddress, id, isAddApproval);
    if (result) {
      System.out.println("ApproveProposal " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ApproveProposal " + failedHighlight() + " !!!");
    }
  }

  private void deleteProposal(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("DeleteProposal " + successfulHighlight() + " !!!");
    } else {
      System.out.println("DeleteProposal " + failedHighlight() + " !!!");
    }
  }

  private void listProposals() {
    Response.ProposalList proposalList = walletApiWrapper.getProposalsList();
    if (proposalList != null) {
      System.out.println(Utils.formatMessageString(proposalList));
    } else {
      System.out.println("List witnesses " + failedHighlight() + " !!!");
    }
  }

  private void getProposal(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getProposal command needs 1 parameter like: ");
      System.out.println("getProposal id ");
      return;
    }
    String id = parameters[0];

    Response.Proposal proposal = walletApiWrapper.getProposal(id);
    if (proposal != null) {
      System.out.println(Utils.formatMessageString(proposal));
    } else {
      System.out.println("GetProposal " + failedHighlight() + " !!!");
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
    Response.DelegatedResourceList delegatedResourceList = WalletApi.getDelegatedResource(fromAddress, toAddress);
    if (delegatedResourceList != null) {
      System.out.println(Utils.formatMessageString(delegatedResourceList));
    } else {
      System.out.println("GetDelegatedResource " + failedHighlight() + " !!!");
    }
  }

  private void getDelegatedResourceAccountIndex(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getDelegatedResourceAccountIndex command needs 1 parameters like: ");
      System.out.println("getDelegatedResourceAccountIndex ownerAddress");
      return;
    }
    String ownerAddress = parameters[0];
    Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex = WalletApi.getDelegatedResourceAccountIndex(ownerAddress);
    if (delegatedResourceAccountIndex != null) {
      System.out.println(Utils.formatMessageString(delegatedResourceAccountIndex));
    } else {
      System.out.println("GetDelegatedResourceAccountIndex " + failedHighlight() + " !!!");
    }
  }

  private void getDelegatedResourceV2(String[] parameters) {
    if (parameters == null || parameters.length != 2) {
      System.out.println("Using getdelegatedresourcev2 command needs 2 parameters like: ");
      System.out.println("getdelegatedresourcev2 fromAddress toAddress");
      return;
    }
    String fromAddress = parameters[0];
    String toAddress = parameters[1];
    Response.DelegatedResourceList delegatedResourceList = WalletApi.getDelegatedResourceV2(fromAddress, toAddress);
    if (delegatedResourceList != null) {
      System.out.println(Utils.formatMessageString(delegatedResourceList));
    } else {
      System.out.println("GetDelegatedResourceV2 " + failedHighlight() + " !!!");
    }
  }

  private void getDelegatedResourceAccountIndexV2(String[] parameters) throws IllegalException {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getDelegatedResourceAccountIndexV2 command needs 1 parameters like: ");
      System.out.println("getdelegatedresourceaccountindexv2 ownerAddress");
      return;
    }
    String ownerAddress = parameters[0];
    Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex = WalletApi.getDelegatedResourceAccountIndexV2(ownerAddress);
    if (delegatedResourceAccountIndex != null) {
      System.out.println(Utils.formatMessageString(delegatedResourceAccountIndex));
    } else {
      System.out.println("GetDelegatedResourceAccountIndexV2 " + failedHighlight() + " !!!");
    }
  }

  private void outputGetCanWithdrawUnfreezeAmountTip() {
    System.out.println("Using getCanWithdrawUnfreezeAmount command needs 2 parameters like: ");
    System.out.println("getcanwithdrawunfreezeamount ownerAddress timestamp");
  }

  private void getCanWithdrawUnfreezeAmount(String[] parameters) throws CipherException, IOException, CancelException {
    if (parameters == null || !(parameters.length == 1 || parameters.length == 2)) {
      this.outputGetCanWithdrawUnfreezeAmountTip();
      return;
    }
    int index = 0;
    long timestamp = 0;
    byte[] ownerAddress = null;

    if (parameters.length == 1) {
      try {
        timestamp = Long.parseLong(parameters[index]);
        if (timestamp < 0) {
          System.out.println("Invalid param, timestamp >= 0");
          return;
        }
      } catch (NumberFormatException nfe) {
        this.outputGetCanWithdrawUnfreezeAmountTip();
        return;
      }

      ownerAddress = this.getLoginAddress();
      if (ownerAddress == null) {
        System.out.println("getcanwithdrawunfreezeamount ownerAddress is invalid");
        return ;
      }
    } else if (parameters.length == 2) {
      ownerAddress = getAddressBytes(parameters[index++]);
      if (ownerAddress == null) {
        this.outputGetCanWithdrawUnfreezeAmountTip();
        return;
      }

      try {
        timestamp = Long.parseLong(parameters[index]);
        if (timestamp < 0) {
          System.out.println("Invalid param, timestamp >= 0");
          return;
        }
      } catch (NumberFormatException nfe) {
        this.outputGetCanWithdrawUnfreezeAmountTip();
        return;
      }
    }

    long canWithdrawUnfreezeAmount = WalletApi.getCanWithdrawUnfreezeAmount(ownerAddress, timestamp);
    System.out.println("GetCanWithdrawUnfreezeAmount " + successfulHighlight() + " amount:"
        + canWithdrawUnfreezeAmount + " !!!");
  }


  private void outputGetCanDelegatedMaxSizeTip() {
    System.out.println("Using getcandelegatedmaxsize command needs 2 parameters like: ");
    System.out.println("getcandelegatedmaxsize ownerAddress type");
  }

  private void getCanDelegatedMaxSize(String[] parameters) throws CipherException, IOException, CancelException {
    if (parameters == null || !(parameters.length == 1 || parameters.length == 2)) {
      this.outputGetCanDelegatedMaxSizeTip();
      return;
    }
    int index = 0;
    int type = 0;
    byte[] ownerAddress = null;

    if (parameters.length == 1) {
      try {
        type = Integer.parseInt(parameters[index]);
        if (ResourceCode.BANDWIDTH.ordinal() != type && ResourceCode.ENERGY.ordinal() != type) {
          System.out.println("getcandelegatedmaxsize type must be: 0 or 1");
          return;
        }
      } catch (NumberFormatException nfe) {
        this.outputGetCanDelegatedMaxSizeTip();
        return;
      }

      ownerAddress = this.getLoginAddress();
      if (ownerAddress == null) {
        System.out.println("getcandelegatedmaxsize ownerAddress is invalid");
        return ;
      }
    } else if (parameters.length == 2) {
      ownerAddress = getAddressBytes(parameters[index++]);
      if (ownerAddress == null) {
        this.outputGetCanDelegatedMaxSizeTip();
        return ;
      }

      try {
        type = Integer.parseInt(parameters[index]);
        if (ResourceCode.BANDWIDTH.ordinal() != type && ResourceCode.ENERGY.ordinal() != type) {
          System.out.println("getcandelegatedmaxsize type must be: 0 or 1");
          return;
        }
      } catch (NumberFormatException nfe) {
        this.outputGetCanDelegatedMaxSizeTip();
        return;
      }
    }

    try {
      long size = WalletApi.getCanDelegatedMaxSize(ownerAddress, type);
      System.out.println("GetCanDelegatedMaxSize=" + size);
      System.out.println("GetCanDelegatedMaxSize " + successfulHighlight() + " !!!");
    } catch (Exception e) {
      printStackTrace(e);
      System.out.println("GetCanDelegatedMaxSize " + failedHighlight() + " !!!");
    }
  }

  private void outputGetAvailableUnfreezeCountTip() {
    System.out.println("Using getavailableunfreezecount command needs 1 parameters like: ");
    System.out.println("getavailableunfreezecount owner_address ");
  }

  private void getAvailableUnfreezeCount(String[] parameters) throws CipherException, IOException, CancelException {
    if (parameters == null || !(parameters.length == 0 || parameters.length == 1)) {
      this.outputGetAvailableUnfreezeCountTip();
      return;
    }
    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 1) {
        ownerAddress = getAddressBytes(parameters[index]);
        if (ownerAddress == null) {
          this.outputGetAvailableUnfreezeCountTip();
          return;
        }
    } else {
      ownerAddress = this.getLoginAddress();
      if (ownerAddress == null) {
        this.outputGetAvailableUnfreezeCountTip();
        return;
      }
    }

    try {
      long count = WalletApi.getAvailableUnfreezeCount(ownerAddress);
      System.out.println("GetAvailableUnfreezeCount=" + count);
      System.out.println("GetAvailableUnfreezeCount " + successfulHighlight() + "!!!");
    } catch (Exception e) {
      printStackTrace(e);
      System.out.println("GetAvailableUnfreezeCount " + failedHighlight() + " !!!");
    }
  }

  private void exchangeCreate(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("ExchangeCreate " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ExchangeCreate " + failedHighlight() + " !!!");
    }
  }

  private void exchangeInject(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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

    long exchangeId = Long.parseLong(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.parseLong(parameters[index++]);
    boolean result = walletApiWrapper.exchangeInject(ownerAddress, exchangeId, tokenId, quant);
    if (result) {
      System.out.println("ExchangeInject " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ExchangeInject " + failedHighlight() + " !!!");
    }
  }

  private void exchangeWithdraw(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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

    long exchangeId = Long.parseLong(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.parseLong(parameters[index++]);
    boolean result = walletApiWrapper.exchangeWithdraw(ownerAddress, exchangeId, tokenId, quant);
    if (result) {
      System.out.println("ExchangeWithdraw " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ExchangeWithdraw " + failedHighlight() + " !!!");
    }
  }

  private void exchangeTransaction(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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

    long exchangeId = Long.parseLong(parameters[index++]);
    byte[] tokenId = parameters[index++].getBytes();
    long quant = Long.parseLong(parameters[index++]);
    long expected = Long.parseLong(parameters[index++]);
    boolean result = walletApiWrapper
        .exchangeTransaction(ownerAddress, exchangeId, tokenId, quant, expected);
    if (result) {
      System.out.println("ExchangeTransaction " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ExchangeTransaction " + failedHighlight() + " !!!");
    }
  }

  private void listExchanges() {
    Response.ExchangeList exchangeList = walletApiWrapper.getExchangeList();
    if (exchangeList != null) {
      System.out.println(Utils.formatMessageString(exchangeList));
    } else {
      System.out.println("ListExchanges " + failedHighlight() + " !!!");
    }
  }

  private void getExchange(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getExchange command needs 1 parameter like: ");
      System.out.println("getExchange id");
      return;
    }
    String id = parameters[0];

    Response.Exchange exchange = walletApiWrapper.getExchange(id);
    if (exchange != null) {
      System.out.println(Utils.formatMessageString(exchange));
    } else {
      System.out.println("GetExchange " + failedHighlight() + " !!!");
    }
  }

  private void withdrawBalance(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("WithdrawBalance " + successfulHighlight() + " !!!");
    } else {
      System.out.println("WithdrawBalance " + failedHighlight() + " !!!");
    }
  }

  private void getNextMaintenanceTime() {
    long nextMaintenanceTime = walletApiWrapper.getNextMaintenanceTime();
    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    String date = formatter.format(nextMaintenanceTime);
    System.out.println("Next maintenance time is : " + date);
  }

  private void getTransactionById(String[] parameters) throws InvalidProtocolBufferException, IllegalException {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getTransactionById command needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Chain.Transaction transaction = WalletApi.getTransactionById(txid);
    System.out.println(Utils.printTransaction(Protocol.Transaction.parseFrom(transaction.toByteArray())));
  }

  private void getTransactionInfoById(String[] parameters) throws IllegalException {
    String txid = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getTransactionInfoById command needs 1 parameter, transaction id");
      return;
    } else {
      txid = parameters[0];
    }
    Response.TransactionInfo transactionInfo = WalletApi.getTransactionInfoById(txid);
    if (transactionInfo != null) {
      System.out.println(Utils.formatMessageString(transactionInfo));
    } else {
      System.out.println("GetTransactionInfoById " + failedHighlight() + " !!!");
    }
  }

  private void getBlockById(String[] parameters) throws InvalidProtocolBufferException {
    String blockID = "";
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getBlockById command needs 1 parameter like: ");
      System.out.println("getBlockById block_id");
      return;
    } else {
      blockID = parameters[0];
    }
    Chain.Block block = WalletApi.getBlockById(blockID);
    if (block != null) {
      System.out.println(Utils.printBlock(block));
    } else {
      System.out.println("GetBlockById " + failedHighlight() + " !!");
    }
  }

  private void getBlockByLimitNext(String[] parameters) throws IllegalException, InvalidProtocolBufferException {
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

    Response.BlockListExtention blockList = WalletApi.getBlockByLimitNext(start, end);
    if (blockList != null) {
      System.out.println(Utils.printBlockList(blockList));
    } else {
      System.out.println("GetBlockByLimitNext " + failedHighlight() + " !!");
    }
  }

  private void getBlockByLatestNum(String[] parameters) throws IllegalException, InvalidProtocolBufferException {
    long num = 0;
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getBlockByLatestNum command needs 1 parameter, block_num");
      return;
    } else {
      num = Long.parseLong(parameters[0]);
    }
    Response.BlockListExtention blockList = WalletApi.getBlockByLatestNum2(num);
    if (blockList != null) {
      if (blockList.getBlockCount() == 0) {
        System.out.println("No block");
        return;
      }
      System.out.println(Utils.printBlockList(blockList));
    } else {
      System.out.println("GetBlockByLimitNext " + failedHighlight() + " !!");
    }
  }

  private void updateSetting(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("Using updateSetting needs 2 parameters like: ");
      System.out.println("updateSetting [OwnerAddress] contract_address consume_user_resource_percent");
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

    long consumeUserResourcePercent = Long.parseLong(parameters[index++]);
    if (consumeUserResourcePercent > 100 || consumeUserResourcePercent < 0) {
      System.out.println("consume_user_resource_percent must >= 0 and <= 100");
      return;
    }
    boolean result = walletApiWrapper
        .updateSetting(ownerAddress, contractAddress, consumeUserResourcePercent);
    if (result) {
      System.out.println("UpdateSetting " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UpdateSetting " + failedHighlight() + " !!!");
    }
  }

  private void updateEnergyLimit(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("UpdateSetting for origin_energy_limit " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UpdateSetting for origin_energy_limit " + failedHighlight() + " !!!");
    }
  }

  private void clearContractABI(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("ClearContractABI " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ClearContractABI " + failedHighlight() + " !!!");
    }
  }

  private void clearWalletKeystoreIfExists() {
    if (walletApiWrapper.clearWalletKeystore()) {
      System.out.println("ClearWalletKeystore " + successfulHighlight() + " !!!");
    } else {
      System.out.println("ClearWalletKeystore " + failedHighlight() + " !!!");
    }
  }

  private void updateBrokerage(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("UpdateBrokerage " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UpdateBrokerage " + failedHighlight() + " !!!");
    }
  }

  private void getReward(String[] parameters) {
    int index = 0;
    byte[] ownerAddress;
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
    GrpcAPI.NumberMessage reward = walletApiWrapper.getReward(ownerAddress);
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
    long brokerage = walletApiWrapper.getBrokerage(ownerAddress);
    System.out.println("The brokerage is : " + brokerage);
  }

  private void getTransactionInfoByBlockNum(String[] parameters) throws InvalidProtocolBufferException {
    if (parameters.length != 1) {
      System.out.println("You need input number with the following syntax:");
      System.out.println("GetTransactionInfoByBlockNum number");
      return;
    }

    long blockNum = Long.parseLong(parameters[0]);
    Response.TransactionInfoList transactionInfoList = WalletApiWrapper.getTransactionInfoByBlockNum(blockNum);

    if (transactionInfoList != null) {
      if (transactionInfoList.getTransactionInfoCount() == 0) {
        System.out.println("[]");
      } else {
        System.out.println(Utils.printTransactionInfoList(transactionInfoList));
      }
    } else {
      System.out.println("GetTransactionInfoByBlockNum " + failedHighlight() + " !!!");
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
      throws Exception {

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
    if (!(constructorStr.equals("#") || argsStr.equals("#"))) {
      if (isHex) {
        codeStr += argsStr;
      } else {
        codeStr += Hex.toHexString(AbiUtil.encodeInput(constructorStr, argsStr));
      }
    }
    long value = 0;
    value = Long.parseLong(parameters[idx++]);
    long tokenValue = Long.parseLong(parameters[idx++]);
    String tokenId = parameters[idx++];
    if ("#".equals(tokenId)) {
      tokenId = EMPTY;
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
      System.out.println("Broadcast the createSmartContract " + successfulHighlight() + ".\n"
          + "Please check the given transaction id to confirm deploy status on blockchain using getTransactionInfoById command.");
    } else {
      System.out.println("Broadcast the createSmartContract " + failedHighlight() + " !!!");
    }
  }

  private void deployConstantContract(String[] parameters)
      throws Exception {

    if (parameters == null || (parameters.length != 5 && parameters.length != 8)) {
      System.out.println("DeployConstantContract needs at least 4 parameters like: ");
      System.out.println("DeployConstantContract ownerAddress(use # if you own)"
          + " byteCode constructor params isHex [value token_value token_id]");
      return;
    }

    int idx = 0;

    String ownerAddressStr = parameters[idx++];
    byte[] ownerAddress = null;
    if (!"#".equals(ownerAddressStr)) {
      ownerAddress = WalletApi.decodeFromBase58Check(ownerAddressStr);
      if (ownerAddress == null) {
        System.out.println("Invalid Owner Address.");
        return;
      }
    }

    String codeStr = parameters[idx++];
    String constructorStr = parameters[idx++];
    String argsStr = parameters[idx++];
    boolean isHex = Boolean.parseBoolean(parameters[idx++]);
    long callValue = 0;
    long tokenValue = 0;
    String tokenId = "";
    if (parameters.length == 8) {
      callValue = Long.parseLong(parameters[idx++]);
      tokenValue = Long.parseLong(parameters[idx++]);
      tokenId = parameters[idx];
    }

    if (!(constructorStr.equals("#") || argsStr.equals("#"))) {
      if (isHex) {
        codeStr += argsStr;
      } else {
        codeStr += Hex.toHexString(AbiUtil.encodeInput(constructorStr, argsStr));
      }
    }

    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }

    walletApiWrapper.callContract(
        ownerAddress, null, callValue, Hex.decode(codeStr), 0, tokenValue, tokenId, true);
  }

  private void triggerContract(String[] parameters)
      throws Exception {

    if (parameters == null || (parameters.length != 8 && parameters.length != 9)) {
      System.out.println("TriggerContract needs 8 or 9 parameters like: ");
      System.out.println("TriggerContract [OwnerAddress] contractAddress method args isHex"
          + " fee_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided)");
      return;
    }

    int index = 0;
    byte[] ownerAddress = null;
    if (parameters.length == 9) {
      ownerAddress = WalletApi.decodeFromBase58Check(parameters[index++]);
      if (ownerAddress == null) {
        System.out.println("Invalid OwnerAddress.");
        return;
      }
    }

    String contractAddrStr = parameters[index++];
    String methodStr = parameters[index++];
    String argsStr = parameters[index++];
    boolean isHex = Boolean.parseBoolean(parameters[index++]);
    long feeLimit = Long.parseLong(parameters[index++]);
    long callValue = Long.parseLong(parameters[index++]);
    long tokenValue = Long.parseLong(parameters[index++]);
    String tokenId = parameters[index];

    if (argsStr.equalsIgnoreCase("#")) {
      argsStr = "";
    }

    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }

    byte[] input = new byte[0];
    if (!methodStr.equalsIgnoreCase("#")) {
      input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, isHex));
    }
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddrStr);

    boolean result = walletApiWrapper.callContract(
        ownerAddress, contractAddress, callValue, input, feeLimit, tokenValue, tokenId, false);
    if (result) {
      System.out.println("Broadcast the TriggerContract " + successfulHighlight() + ".\n"
          + "Please check the given transaction id to get the result on blockchain using getTransactionInfoById command");
    } else {
      System.out.println("Broadcast the TriggerContract " + failedHighlight() + ".");
    }
  }

  private void triggerConstantContract(String[] parameters)
      throws Exception {

    if (parameters == null || (parameters.length != 5 && parameters.length != 8)) {
      System.out.println("TriggerConstantContract needs 5 or 8 parameters like: ");
      System.out.println("TriggerConstantContract ownerAddress(use # if you own)"
          + " contractAddress method args isHex [value token_value token_id(e.g: TRXTOKEN, use # if don't provided)]");
      return;
    }

    int idx = 0;

    String ownerAddressStr = parameters[idx++];
    byte[] ownerAddress = null;
    if (!"#".equals(ownerAddressStr)) {
      ownerAddress = WalletApi.decodeFromBase58Check(ownerAddressStr);
      if (ownerAddress == null) {
        System.out.println("Invalid Owner Address.");
        return;
      }
    }

    String contractAddressStr = parameters[idx++];
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddressStr);
    if (contractAddress == null) {
      System.out.println("Invalid Contract Address.");
      return;
    }

    String methodStr = parameters[idx++];
    String argsStr = parameters[idx++];
    boolean isHex = Boolean.parseBoolean(parameters[idx++]);
    long callValue = 0;
    long tokenValue = 0;
    String tokenId = "";
    if (parameters.length == 8) {
      callValue = Long.parseLong(parameters[idx++]);
      tokenValue = Long.parseLong(parameters[idx++]);
      tokenId = parameters[idx];
    }

    if (argsStr.equalsIgnoreCase("#")) {
      argsStr = "";
    }

    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }

    byte[] input = new byte[0];
    if (!methodStr.equalsIgnoreCase("#")) {
      input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, isHex));
    }

    walletApiWrapper.callContract(
        ownerAddress, contractAddress, callValue, input, 0, tokenValue, tokenId, true);
  }

  private void estimateEnergy(String[] parameters)
      throws IOException, CipherException, CancelException  {

    if (parameters == null || (parameters.length != 5 && parameters.length != 8)) {
      System.out.println("EstimateEnergy needs 5 or 8 parameters like: ");
      System.out.println("EstimateEnergy ownerAddress(use # if you own)"
          + " contractAddress method args isHex "
          + "[value token_value token_id(e.g: TRXTOKEN, use # if don't provided)]");
      return;
    }

    int idx = 0;

    String ownerAddressStr = parameters[idx++];
    byte[] ownerAddress = null;
    if (!"#".equals(ownerAddressStr)) {
      ownerAddress = WalletApi.decodeFromBase58Check(ownerAddressStr);
      if (ownerAddress == null) {
        System.out.println("Invalid Owner Address.");
        return;
      }
    }

    String contractAddressStr = parameters[idx++];
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddressStr);
    if (contractAddress == null) {
      System.out.println("Invalid Contract Address.");
      return;
    }

    String methodStr = parameters[idx++];
    String argsStr = parameters[idx++];
    boolean isHex = Boolean.parseBoolean(parameters[idx++]);
    long callValue = 0;
    long tokenValue = 0;
    String tokenId = "";
    if (parameters.length == 8) {
      callValue = Long.parseLong(parameters[idx++]);
      tokenValue = Long.parseLong(parameters[idx++]);
      tokenId = parameters[idx];
    }

    if (argsStr.equalsIgnoreCase("#")) {
      argsStr = "";
    }

    if (tokenId.equalsIgnoreCase("#")) {
      tokenId = "";
    }

    byte[] input = new byte[0];
    if (!methodStr.equalsIgnoreCase("#")) {
      input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, isHex));
    }

    walletApiWrapper.estimateEnergy(
        ownerAddress, contractAddress, callValue, input, tokenValue, tokenId);
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

    Common.SmartContract contractDeployContract = WalletApi.getContract(addressBytes);
    if (contractDeployContract != null) {
      System.out.println(Utils.formatMessageString(contractDeployContract));
    } else {
      System.out.println("Query contract " + failedHighlight() + " !!!");
    }
  }

  private void getContractInfo(String[] parameters) {
    if (parameters == null ||
        parameters.length != 1) {
      System.out.println("Using getContractInfo needs 1 parameter like: ");
      System.out.println("GetContractInfo contractAddress");
      return;
    }

    byte[] addressBytes = WalletApi.decodeFromBase58Check(parameters[0]);
    if (addressBytes == null) {
      System.out.println("GetContractInfo: invalid address !!!");
      return;
    }

    Response.SmartContractDataWrapper contractDeployContract = WalletApi.getContractInfo(addressBytes);
    if (contractDeployContract != null) {
      System.out.println(Utils.formatMessageString(contractDeployContract));
    } else {
      System.out.println("Query contract " + failedHighlight() + " !!!");
    }
  }

  private void generateAddress(String[] parameters) {
    try {
      boolean isECKey  = parameters == null || parameters.length == 0
         ||  Boolean.parseBoolean(parameters[0]);
      SignInterface cryptoEngine = SignUtils.getGeneratedRandomSign(Utils.getRandom(), isECKey);
      byte[] priKey = cryptoEngine.getPrivateKey();
      byte[] address = cryptoEngine.getAddress();
      String addressStr = WalletApi.encode58Check(address);
      String priKeyStr = ByteArray.toHexString(priKey);
      AddressPrKeyPairMessage.Builder builder = AddressPrKeyPairMessage.newBuilder();
      builder.setAddress(addressStr);
      builder.setPrivateKey(priKeyStr);
      System.out.println(Utils.formatMessageString(builder.build()));
    } catch (Exception e) {
      System.out.println("GenerateAddress " + failedHighlight() + " !!!");
    }
  }

  private void updateAccountPermission(String[] parameters)
      throws CipherException, IOException, CancelException, IllegalException {
    if (parameters.length > 2) {
      System.out.println(
          "Using updateAccountPermission needs 2 parameters or no parameters, like UpdateAccountPermission or UpdateAccountPermission ownerAddress permissions, permissions is a JSON formatted string.");
      return;
    }
    String ownerAddressStr = EMPTY;
    String permissionJsonStr = EMPTY;
    if (parameters.length == 0) {
      String address = walletApiWrapper.getAddress();
      String permissionData = new UpdateAccountPermissionInteractive().start(address);
      ownerAddressStr = address;
      permissionJsonStr = permissionData;
    }
    if (parameters.length == 1) {
      String permissionData = new UpdateAccountPermissionInteractive().start(parameters[0]);
      ownerAddressStr = parameters[0];
      permissionJsonStr = permissionData;
    }
    if (parameters.length == 2) {
      ownerAddressStr = parameters[0];
      permissionJsonStr = parameters[1];
    }

    byte[] ownerAddress = WalletApi.decodeFromBase58Check(ownerAddressStr);
    if (ownerAddress == null) {
      System.out.println("GetContract: invalid address!");
      return;
    }

    boolean ret = walletApiWrapper.accountPermissionUpdate(ownerAddress, permissionJsonStr);
    if (ret) {
      System.out.println("UpdateAccountPermission " + successfulHighlight() + " !!!");
    } else {
      System.out.println("UpdateAccountPermission " + failedHighlight() + " !!!");
    }
  }


  private void getTransactionSignWeight(String[] parameters) throws InvalidProtocolBufferException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using getTransactionSignWeight needs 1 parameter, like getTransactionSignWeight transaction which is hex string");
      return;
    }
    String transactionStr = parameters[0];
    Chain.Transaction transaction = Chain.Transaction.parseFrom(ByteArray.fromHexString(transactionStr));

    Response.TransactionSignWeight transactionSignWeight = WalletApi.getTransactionSignWeight(transaction);
    if (transactionSignWeight != null) {
      System.out.println(Utils.printTransactionSignWeight(transactionSignWeight));
    } else {
      System.out.println("GetTransactionSignWeight " + failedHighlight() + " !!!");
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
    Chain.Transaction transaction = Chain.Transaction.parseFrom(ByteArray.fromHexString(transactionStr));

    Response.TransactionApprovedList transactionApprovedList = WalletApi
        .getTransactionApprovedList(transaction);
    if (transactionApprovedList != null) {
      System.out.println(Utils.printTransactionApprovedList(transactionApprovedList));
    } else {
      System.out.println("GetTransactionApprovedList " + failedHighlight() + " !!!");
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
    Chain.Transaction transaction = Chain.Transaction.parseFrom(ByteArray.fromHexString(transactionStr));
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
      System.out.println("AddTransactionSign " + failedHighlight() + " !!!");
    }

  }

  private void broadcastTransaction(String[] parameters) throws InvalidProtocolBufferException {
    if (parameters == null || parameters.length != 1) {
      System.out.println(
          "Using broadcastTransaction needs 1 parameter, like broadcastTransaction transaction which is hex string");
      return;
    }

    String transactionStr = parameters[0];
    Chain.Transaction transaction = Chain.Transaction.parseFrom(ByteArray.fromHexString(transactionStr));
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Invalid transaction");
      return;
    }

    boolean ret = WalletApi.broadcastTransaction(transaction);
    if (ret) {
      System.out.println("BroadcastTransaction " + successfulHighlight() + " !!!");
    } else {
      System.out.println("BroadcastTransaction " + failedHighlight() + " !!!");
    }
  }

  private boolean isFromPublicAddress(String[] parameters) {
    if (Utils.isNumericString(parameters[0])) {
      if (Long.valueOf(parameters[0]) > 0) {
        return true;
      }
    } else {
      if (Long.valueOf(parameters[1]) > 0) {
        return true;
      }
    }
    return false;
  }

  private void marketSellAsset(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("MarketSellAsset " + successfulHighlight() + " !!!");
    } else {
      System.out.println("MarketSellAsset " + failedHighlight() + " !!!");
    }
  }


  private void marketCancelOrder(String[] parameters)
      throws IOException, CipherException, CancelException, IllegalException {
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
      System.out.println("MarketCancelOrder " + successfulHighlight() + " !!!");
    } else {
      System.out.println("MarketCancelOrder " + failedHighlight() + " !!!");
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

    Response.MarketOrderList marketOrderList = walletApiWrapper.getMarketOrderByAccount(ownerAddress);
    if (marketOrderList == null) {
      System.out.println("GetMarketOrderByAccount " + failedHighlight() + " !!!");
    } else {
      System.out.println(Utils.formatMessageString(marketOrderList));
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

    Response.MarketPriceList marketPriceList = walletApiWrapper
        .getMarketPriceByPair(sellTokenId, buyTokenId);
    if (marketPriceList == null) {
      System.out.println("GetMarketPriceByPair " + failedHighlight() + " !!!");
    } else {
      System.out.println(Utils.formatMessageString(marketPriceList));
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

    Response.MarketOrderList orderListByPair = walletApiWrapper
        .getMarketOrderListByPair(sellTokenId, buyTokenId);
    if (orderListByPair == null) {
      System.out.println("getMarketOrderListByPair " + failedHighlight() + " !!!");
    } else {
      System.out.println(Utils.formatMessageString(orderListByPair));
    }
  }


  private void getMarketPairList(String[] parameters) {
    if (parameters == null || parameters.length != 0) {
      System.out.println("Using getMarketPairList command does not need any parameters, like: ");
      System.out.println(
          "getMarketPairList");
      return;
    }

    Response.MarketOrderPairList pairList = walletApiWrapper
        .getMarketPairList();
    if (pairList == null) {
      System.out.println("getMarketPairList " + failedHighlight() + " !!!");
    } else {
      System.out.println(Utils.formatMessageString(pairList));
    }
  }

  private void getMarketOrderById(String[] parameters) {
    if (parameters == null || parameters.length != 1) {
      System.out.println("Using getMarketOrderById command needs 1 parameters like:");
      System.out.println(
          "getMarketOrderById orderId");
      return;
    }

    byte[] orderId = ByteArray.fromHexString(parameters[0]);
    Response.MarketOrder order = walletApiWrapper
        .getMarketOrderById(orderId);
    if (order == null) {
      System.out.println("getMarketOrderById " + failedHighlight() + " !!!");
    } else {
      System.out.println(Utils.formatMessageString(order));
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
    System.out.println("Create2 Address: " + WalletApi.encode58Check(Hash.sha3omit12(mergedData)));
  }

  private boolean checkAmountValid(BigInteger amount, BigInteger scalingFactor) {
    if (amount.compareTo(BigInteger.ZERO) < 0) {
      return false;
    }
    BigInteger[] quotientAndReminder = amount.divideAndRemainder(scalingFactor);
    if (quotientAndReminder[1].compareTo(BigInteger.ZERO) != 0) {
      return false;
    }
    if (quotientAndReminder[0].compareTo(BigInteger.valueOf(Long.MAX_VALUE)) > 0) {
      return false;
    }
    return true;
  }

  private void help(String[] parameters) {
    if (parameters.length != 0 && parameters.length != 1) {
      System.out.println("help needs no or 1 parameter like the following: ");
      System.out.println("help [cmd] ");
      return;
    }

    if (parameters.length == 0) {
      System.out.println("Help: Table of Tron Wallet-cli commands");
      System.out.println("For detailed information about a specific command, please add the command after 'help' as it will display tips.");
      printHelp();
      System.out.println("Exit or Quit");
      System.out.println("Enter any of the commands listed in the table to display operation prompts.");
      System.out.println();
      System.out.println("For example, if you want help with make a TRX transfer, you can enter '"
          + greenBoldHighlight("help SendCoin") + "'.");
    }

    if (parameters.length == 1) {
      String cmd = parameters[0];
      String commandExample = getCommandHelp(cmd.toLowerCase());
      System.out.println(commandExample);
    }
  }

  public static String[] getCmd(String cmdLine) {
    if (cmdLine.indexOf("\"") < 0 || cmdLine.toLowerCase().startsWith("deploycontract")
        || cmdLine.toLowerCase().startsWith("deployconstantcontract")
        || cmdLine.toLowerCase().startsWith("triggercontract")
        || cmdLine.toLowerCase().startsWith("triggerconstantcontract")
        || cmdLine.toLowerCase().startsWith("updateaccountpermission")
        || cmdLine.toLowerCase().startsWith("estimateenergy")) {
      return cmdLine.split("\\s+", -1);
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
    if (version) {
      System.out.println("Version" + VERSION);
      System.exit(0);
    }
    System.out.println();
    System.out.println("Welcome to Tron " + blueBoldHighlight("Wallet-Cli"));
    printBanner();
    System.out.println();
    System.out.println("Please type one of the following commands to proceed.");
    System.out.println(greenBoldHighlight("Login") + ", " + greenBoldHighlight("LoginAll")
        + ", " + greenBoldHighlight("RegisterWallet")
        + " or " + greenBoldHighlight("ImportWallet") + ", etc.");
    System.out.println(" ");
    System.out.println(
        "You may also use the " + greenBoldHighlight("Help") + " command at anytime to display a "
            + "full list of commands.");
    System.out.println("You can add any command supported by wallet-cli after the help command to view its usage help.");
    System.out.println();

    try {
      Terminal terminal = TerminalBuilder.builder().system(true).dumb(true).build();
      Completer commandCompleter = new StringsCompleter(commandList);
      LineReader lineReader = LineReaderBuilder.builder()
          .terminal(terminal)
          .completer(commandCompleter)
          .option(LineReader.Option.CASE_INSENSITIVE, true)
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
          if (LedgerUserHelper.ledgerUserForbid(walletApiWrapper, cmdLowerCase)) {
            continue;
          }
          switch (cmdLowerCase) {
            case "help": {
              help(parameters);
              break;
            }
            case "addressbook": {
              addressBook();
              break;
            }
            case "registerwallet": {
              registerWallet();
              break;
            }
            case "modifywalletname": {
              modifyWalletName(parameters);
              break;
            }
            case "generatesubaccount": {
              generateSubAccount();
              break;
            }
            case "importwallet": {
              importWallet();
              break;
            }
            case "importwalletbymnemonic": {
              importWalletByMnemonic();
              break;
            }
            case "importwalletbyledger": {
              importWalletByLedger();
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
            case "clearwalletkeystore": {
              clearWalletKeystoreIfExists();
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
            case "loginall": {
              loginAll();
              break;
            }
            case "switchwallet": {
              switchWallet();
              break;
            }
            case "switchnetwork": {
              switchNetwork(parameters);
              break;
            }
            case "resetwallet": {
              resetWallet();
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
            case "exportwalletmnemonic": {
              exportWalletMnemonic();
              break;
            }
            case "exportwalletkeystore": {
              exportWalletKeystore(parameters);
              break;
            }
            case "importwalletbykeystore": {
              importWalletByKeystore(parameters);
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
            case "transferUSDT": {
              transferUSDT(parameters);
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
            case "viewbackuprecords": {
              viewBackupRecords(parameters);
              break;
            }
            case "viewtransactionhistory": {
              viewTransactionHistory(parameters);
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
            case "freezebalancev2": {
              freezeBalanceV2(parameters);
              break;
            }
            case "unfreezebalance": {
              unfreezeBalance(parameters);
              break;
            }
            case "unfreezebalancev2": {
              unfreezeBalanceV2(parameters);
              break;
            }
            case "withdrawexpireunfreeze": {
              withdrawExpireUnfreeze(parameters);
              break;
            }
            case "delegateresource": {
              delegateResource(parameters);
              break;
            }
            case "undelegateresource": {
              unDelegateResource(parameters);
              break;
            }
            case "cancelallunfreezev2": {
              cancelAllUnfreezeV2(parameters);
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
            case "currentnetwork": {
              currentNetwork();
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
            case "getdelegatedresourcev2": {
              getDelegatedResourceV2(parameters);
              break;
            }
            case "getdelegatedresourceaccountindexv2": {
              getDelegatedResourceAccountIndexV2(parameters);
              break;
            }
            case "getcandelegatedmaxsize": {
              getCanDelegatedMaxSize(parameters);
              break;
            }
            case "getavailableunfreezecount": {
              getAvailableUnfreezeCount(parameters);
              break;
            }
            case "getcanwithdrawunfreezeamount": {
              getCanWithdrawUnfreezeAmount(parameters);
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
            case "gasfreetrace": {
              gasFreeTrace(parameters);
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
            case "getnextmaintenancetime": {
              getNextMaintenanceTime();
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
            case "gasfreeinfo": {
              gasFreeInfo(parameters);
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
            case "deployconstantcontract": {
              deployConstantContract(parameters);
              break;
            }
            case "triggercontract": {
              triggerContract(parameters);
              break;
            }
            case "triggerconstantcontract": {
              triggerConstantContract(parameters);
              break;
            }
            case "estimateenergy": {
              estimateEnergy(parameters);
              break;
            }
            case "gasfreetransfer": {
              gasFreeTransfer(parameters);
              break;
            }
            case "getcontract": {
              getContract(parameters);
              break;
            }
            case "getcontractinfo": {
              getContractInfo(parameters);
              break;
            }
            case "generateaddress": {
              generateAddress(parameters);
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
            case "create2": {
              create2(parameters);
              break;
            }
            case "gettransactioninfobyblocknum": {
              getTransactionInfoByBlockNum(parameters);
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
            case "getblockbyidornum": {
              getBlockByIdOrNum(parameters);
              break;
            }
            case "getbandwidthprices": {
              getBandwidthPrices(parameters);
              break;
            }
            case "getenergyprices": {
              getEnergyPrices(parameters);
              break;
            }
            case "getmemofee": {
              getMemoFee(parameters);
              break;
            }
            case "exit":
            case "quit": {
              cleanup();
              System.out.println("Exit !!!");
              return;
            }
            case "lock": {
              lock();
              break;
            }
            case "unlock": {
              unlock(parameters);
              break;
            }
            default: {
              System.out.println("Invalid cmd: " + cmd);
              help(new String[]{});
            }
          }
        } catch (CipherException | CancelException | IOException | IllegalException e) {
          System.out.println(cmd + failedHighlight());
          System.out.println(e.getMessage());
        }  catch (EndOfFileException e) {
          System.out.println("\nBye.");
          return;
        } catch (Exception e) {
          System.out.println(cmd + failedHighlight());
          System.out.println(e.getMessage());
          if (e.getCause() != null) {
            System.out.println(e.getCause().getMessage());
          }
        }
      }
    } catch (IOException e) {
      System.out.println("\nBye.");
    }
  }

  private void transferUSDT(String[] parameters) {
    if (parameters == null || (parameters.length != 2 && parameters.length != 3)) {
      System.out.println("TransferUSDT needs 2 parameters like following: ");
      System.out.println("TransferUSDT [OwnerAddress] ToAddress Amount");
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
    long amount = Long.parseLong(amountStr);

//    boolean result = walletApiWrapper.transferUSDT(ownerAddress, toAddress, amount);
//    if (result) {
//      System.out.println("Transfer " + amount + " to " + base58ToAddress + " " + successfulHighlight() + " !!");
//    } else {
//      System.out.println("Transfer " + amount + " to " + base58ToAddress + " " + failedHighlight() + " !!");
//    }
  }

  private void viewBackupRecords(String[] parameters) {
    if (parameters.length > 0) {
      System.out.println("viewBackupRecords needs no parameters like the following: ");
      System.out.println("viewBackupRecords");
      return;
    }
    walletApiWrapper.viewBackupRecords();
  }

  private void viewTransactionHistory(String[] parameters) {
    if (parameters.length > 0) {
      System.out.println("viewTransactionHistory needs no parameters like the following: ");
      System.out.println("viewTransactionHistory");
      return;
    }
    walletApiWrapper.viewTransactionHistory();
  }


  private void addressBook() {
    walletApiWrapper.addressBook();
  }

  private void modifyWalletName(String[] parameters) throws IOException {
    if (parameters.length != 1) {
      System.out.println("ModifyWalletName needs 1 parameter like the following: ");
      System.out.println("ModifyWalletName name ");
      return;
    }
    String newName = parameters[0];
    if(!isValidWalletName(newName)) {
      System.out.println("The wallet name "
          + String.format("must be between %d and %d characters", MIN_LENGTH, MAX_LENGTH));
      return;
    }
    boolean success = walletApiWrapper.modifyWalletName(newName);
    if (success) {
      System.out.println("Modify Wallet Name " + successfulHighlight() + " !!");
    } else {
      System.out.println("Modify Wallet Name " + failedHighlight() + " !!");
    }
  }

  private void gasFreeTransfer(String[] parameters) throws NoSuchAlgorithmException, IOException,
      InvalidKeyException, CipherException {
    System.out.println("Gas free currently only supports " + blueBoldHighlight("USDT") + " transfers, and more token types will be enriched in the future.");
    if (ArrayUtils.isEmpty(parameters) || parameters.length != 2) {
      System.out.println("GasFreeTransfer needs 2 parameters like the following: ");
      System.out.println("GasFreeTransfer receiverAddress amount");
      return;
    }
    String receiver = parameters[0];
    long value = Long.parseLong(parameters[1]);
    boolean success = walletApiWrapper.gasFreeTransfer(receiver, value);
    if (success) {
      System.out.println("GasFreeTransfer " + successfulHighlight() + " !!!");
    } else {
      System.out.println("GasFreeTransfer " + failedHighlight() + " !!!");
    }

  }

  private void gasFreeInfo(String[] parameters) throws Exception {
    if (parameters.length > 1) {
      System.out.println("gasFreeInfo needs no parameter or 1 parameter like the following: ");
      System.out.println("gasFreeInfo Address ");
      return;
    }
    String address = EMPTY;
    if (ArrayUtils.isNotEmpty(parameters)) {
      address = parameters[0];
    }
    boolean success = walletApiWrapper.getGasFreeInfo(address);
    if (success) {
      System.out.println("gasFreeInfo: " + successfulHighlight() + " !!");
    } else {
      System.out.println("gasFreeInfo " + failedHighlight() + " !!");
    }
  }

  private void gasFreeTrace(String[] parameters) throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    if (parameters.length > 1 || ArrayUtils.isEmpty(parameters)) {
      System.out.println("GasFreeTrace needs 1 parameter like the following: ");
      System.out.println("GasFreeTrace id ");
      return;
    }
    String traceId = parameters[0];
    boolean success = walletApiWrapper.gasFreeTrace(traceId);
    if (success) {
      System.out.println("GasFreeTrace: " + successfulHighlight() + "!!");
    } else {
      System.out.println("GasFreeTrace " + failedHighlight() + " !!");
    }
  }

  private void currentNetwork() {
    NetType currentNet = WalletApi.getCurrentNetwork();
    Pair<Pair<String, Boolean>, Pair<String, Boolean>> customNodes = WalletApi.getCustomNodes();
    if (currentNet == CUSTOM && (customNodes == null || (org.apache.commons.lang3.StringUtils.isEmpty(customNodes.getLeft().getLeft())
          && org.apache.commons.lang3.StringUtils.isEmpty(customNodes.getRight().getLeft())))) {
        System.out.println("The configuration of both fullnode and solidity cannot be empty at the same time.");
        return;
    }
    String fullNode = customNodes.getLeft().getLeft();
    String solidityNode = customNodes.getRight().getLeft();
    System.out.println("current network: " + blueBoldHighlight(currentNet.name()));
    if (CUSTOM == currentNet) {
      Boolean isFullnodeEmpty = customNodes.getLeft().getRight();
      Boolean isSoliditynodeEmpty = customNodes.getRight().getRight();
      System.out.println("fullNode: " + (org.apache.commons.lang3.StringUtils.isEmpty(fullNode) || Boolean.TRUE.equals(isFullnodeEmpty)
          ? EMPTY_STR : fullNode) + ", solidityNode: " +
          (org.apache.commons.lang3.StringUtils.isEmpty(solidityNode) || Boolean.TRUE.equals(isSoliditynodeEmpty) ? EMPTY_STR : solidityNode));
    }
  }

  private void getChainParameters() {
    Response.ChainParameters chainParameters = walletApiWrapper.getChainParameters();
    if (chainParameters != null) {
      System.out.println(Utils.formatMessageString(chainParameters));
    } else {
      System.out.println("GetChainParameters " + failedHighlight() + " !!");
    }
  }

  private byte[] getLoginAddress() {
    if (walletApiWrapper.isLoginState()) {
      String ownerAddressStr = walletApiWrapper.getAddress();
      return WalletApi.decodeFromBase58Check(ownerAddressStr);
    }
    return null;
  }

  private void getBlockByIdOrNum(String[] parameters) throws InvalidProtocolBufferException {
    String idOrNum = null;
    boolean detail = false;
    if (parameters == null || parameters.length == 0) {
      // query current header
      System.out.println("Get current header !!!");
    } else {
      if (parameters.length == 1) {
       String param = parameters[0];
       if ("help".equalsIgnoreCase(param)) {
         // print help
         System.out.println("1.get current header using the following command:");
         System.out.println("getBlockByIdOrNum");
         System.out.println("2. get current block command:");
         System.out.println("getBlockByIdOrNum true");
         System.out.println("3. get header by id or number with the following syntax:");
         System.out.println("getBlockByIdOrNum idOrNum");
         System.out.println("4. get block by id or number with the following syntax:");
         System.out.println("getBlockByIdOrNum idOrNum true");
         return;
        }
       if ("true".equalsIgnoreCase(param)) {
         // query current block
         detail = true;
       } else {
         // query header by id or num
         idOrNum = parameters[0];
       }
      } else {
        idOrNum = parameters[0];
        detail = Boolean.parseBoolean(parameters[1]);
      }
    }
    Response.BlockExtention blockExtention = walletApiWrapper.getBlock(idOrNum, detail);
      if (blockExtention == null) {
        System.out.println("No header for idOrNum : " + idOrNum);
        return;
      }
      System.out.println(Utils.printBlockExtention(blockExtention));
  }

  private void lock() {
    boolean result = walletApiWrapper.lock();
    if (result) {
      System.out.println("lock " + successfulHighlight() + " !!!");
    } else {
      System.out.println("lock " + failedHighlight() + " !!!");
    }
  }

  private void cleanup() {
    walletApiWrapper.cleanup();
  }

  private void unlock(String[] parameters) throws IOException {
    long durationSeconds = ArrayUtils.isEmpty(parameters) ? 300 : getLong(parameters[0]);
    boolean result = walletApiWrapper.unlock(durationSeconds);
    if (result) {
      System.out.println("unlock " + successfulHighlight() + " !!!");
    } else {
      System.out.println("unlock " + failedHighlight() + " !!!");
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
