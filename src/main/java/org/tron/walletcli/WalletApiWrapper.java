package org.tron.walletcli;

import static com.google.common.collect.Lists.newArrayList;
import static java.net.HttpURLConnection.HTTP_OK;
import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.enums.NetType.CUSTOM;
import static org.tron.common.enums.NetType.MAIN;
import static org.tron.common.enums.NetType.NILE;
import static org.tron.common.enums.NetType.SHASTA;
import static org.tron.common.utils.Utils.LOCK_WARNING;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.inputPassword;
import static org.tron.common.utils.Utils.isValid;
import static org.tron.gasfree.GasFreeApi.concat;
import static org.tron.gasfree.GasFreeApi.gasFreeSubmit;
import static org.tron.gasfree.GasFreeApi.getDomainSeparator;
import static org.tron.gasfree.GasFreeApi.getMessage;
import static org.tron.gasfree.GasFreeApi.keccak256;
import static org.tron.gasfree.GasFreeApi.signOffChain;
import static org.tron.gasfree.GasFreeApi.validateSignOffChain;
import static org.tron.keystore.StringUtils.byte2Char;
import static org.tron.keystore.StringUtils.char2Byte;
import static org.tron.keystore.StringUtils.clear;
import static org.tron.keystore.Wallet.validPassword;
import static org.tron.keystore.WalletUtils.loadCredentials;
import static org.tron.keystore.WalletUtils.show;
import static org.tron.ledger.LedgerFileUtil.LEDGER_DIR_NAME;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.walletserver.WalletApi.addressValid;
import static org.tron.walletserver.WalletApi.decodeFromBase58Check;
import static org.tron.walletserver.WalletApi.getAllWalletFile;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.ByteString;
import com.typesafe.config.Config;
import io.netty.util.internal.StringUtil;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Scanner;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.tuple.Pair;
import org.bouncycastle.util.encoders.Hex;
import org.hid4java.HidDevice;
import org.jline.reader.EndOfFileException;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.reader.UserInterruptException;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.BlockExtention;
import org.tron.api.GrpcAPI.BytesMessage;
import org.tron.api.GrpcAPI.DecryptNotes;
import org.tron.api.GrpcAPI.DecryptNotesMarked;
import org.tron.api.GrpcAPI.DecryptNotesTRC20;
import org.tron.api.GrpcAPI.DiversifierMessage;
import org.tron.api.GrpcAPI.ExchangeList;
import org.tron.api.GrpcAPI.ExpandedSpendingKeyMessage;
import org.tron.api.GrpcAPI.IncomingViewingKeyDiversifierMessage;
import org.tron.api.GrpcAPI.IncomingViewingKeyMessage;
import org.tron.api.GrpcAPI.IvkDecryptAndMarkParameters;
import org.tron.api.GrpcAPI.IvkDecryptParameters;
import org.tron.api.GrpcAPI.IvkDecryptTRC20Parameters;
import org.tron.api.GrpcAPI.NfParameters;
import org.tron.api.GrpcAPI.NodeList;
import org.tron.api.GrpcAPI.Note;
import org.tron.api.GrpcAPI.OvkDecryptParameters;
import org.tron.api.GrpcAPI.OvkDecryptTRC20Parameters;
import org.tron.api.GrpcAPI.PaymentAddressMessage;
import org.tron.api.GrpcAPI.PricesResponseMessage;
import org.tron.api.GrpcAPI.PrivateParameters;
import org.tron.api.GrpcAPI.PrivateParametersWithoutAsk;
import org.tron.api.GrpcAPI.PrivateShieldedTRC20Parameters;
import org.tron.api.GrpcAPI.PrivateShieldedTRC20ParametersWithoutAsk;
import org.tron.api.GrpcAPI.ProposalList;
import org.tron.api.GrpcAPI.ReceiveNote;
import org.tron.api.GrpcAPI.ShieldedTRC20Parameters;
import org.tron.api.GrpcAPI.SpendNote;
import org.tron.api.GrpcAPI.SpendNoteTRC20;
import org.tron.api.GrpcAPI.TransactionInfoList;
import org.tron.api.GrpcAPI.ViewingKeyMessage;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.enums.NetType;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.exception.ZksnarkException;
import org.tron.core.zen.ShieldedAddressInfo;
import org.tron.core.zen.ShieldedNoteInfo;
import org.tron.core.zen.ShieldedTRC20NoteInfo;
import org.tron.core.zen.ShieldedTRC20Wrapper;
import org.tron.core.zen.ShieldedWrapper;
import org.tron.core.zen.ZenUtils;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.ExpandedSpendingKey;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.SpendingKey;
import org.tron.gasfree.GasFreeApi;
import org.tron.gasfree.request.GasFreeSubmitRequest;
import org.tron.gasfree.response.GasFreeAddressResponse;
import org.tron.keystore.ClearWalletUtils;
import org.tron.keystore.Credentials;
import org.tron.keystore.Wallet;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.ledger.LedgerAddressUtil;
import org.tron.ledger.LedgerFileUtil;
import org.tron.ledger.console.ConsoleColor;
import org.tron.ledger.console.ImportAccount;
import org.tron.ledger.console.TronLedgerImportAccount;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.mnemonic.SubAccount;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.Exchange;
import org.tron.protos.Protocol.MarketOrder;
import org.tron.protos.Protocol.MarketOrderList;
import org.tron.protos.Protocol.MarketOrderPairList;
import org.tron.protos.Protocol.MarketPriceList;
import org.tron.protos.Protocol.Proposal;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.AssetIssueContractOuterClass.AssetIssueContract;
import org.tron.protos.contract.ShieldContract.IncrementalMerkleVoucherInfo;
import org.tron.protos.contract.ShieldContract.OutputPoint;
import org.tron.protos.contract.ShieldContract.OutputPointInfo;
import org.tron.walletserver.GrpcClient;
import org.tron.walletserver.WalletApi;
import org.web3j.utils.Numeric;

@Slf4j
public class WalletApiWrapper {

  @Getter
  @Setter
  private WalletApi wallet;
  private static final String MnemonicFilePath = "Mnemonic";
  private static final String GAS_FREE_SUPPORT_NETWORK_TIP = "Gas free currently only supports the " + blueBoldHighlight("MAIN") + " network and " + blueBoldHighlight("NILE") + " test network, and does not support other networks at the moment.";

  public String registerWallet(char[] password, int wordsNumber) throws CipherException, IOException {
    if (!WalletApi.passwordValid(password)) {
      return null;
    }

    byte[] passwd = char2Byte(password);

    WalletFile walletFile = WalletApi.CreateWalletFile(passwd, wordsNumber);
    clear(passwd);

    String keystoreName = WalletApi.store2Keystore(walletFile);
    logout();
    return keystoreName;
  }

  public String importWallet(char[] password, byte[] priKey, List<String> mnemonic) throws CipherException, IOException {
    if (!WalletApi.passwordValid(password)) {
      return null;
    }
    if (!WalletApi.priKeyValid(priKey)) {
      return null;
    }

    byte[] passwd = char2Byte(password);

    WalletFile walletFile = WalletApi.CreateWalletFile(passwd, priKey, mnemonic);
    clear(passwd);

    String keystoreName = WalletApi.store2Keystore(walletFile);
    if (mnemonic == null && WalletUtils.hasStoreFile(walletFile.getAddress(), MnemonicFilePath)) {
      WalletUtils.deleteStoreFile(walletFile.getAddress(), MnemonicFilePath);
    }
    if (isUnifiedExist()) {
      wallet.getWalletList().add(walletFile);
    }
    if (!isUnifiedExist()) {
      logout();
    }
    return keystoreName;
  }

  public String importWalletByLedger(char[] password, HidDevice device) {
    if (!WalletApi.passwordValid(password)) {
      return null;
    }
    String walletFileName = "";

    try {
      Terminal terminal = TerminalBuilder.builder().system(true).dumb(true).build();
      LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();

      String defaultPath = TronLedgerImportAccount.findFirstMissingPath(
          LedgerFileUtil.getFileName(device));

      String defaultImportAddress = LedgerAddressUtil.getImportAddress(defaultPath, device);
      if (defaultImportAddress == null || defaultImportAddress.isEmpty()) {
        System.out.println(ANSI_RED + "No available address to import, please open 'tron app' and try again!" + ANSI_RESET);
        return null;
      }

      String choice;
      boolean quit = false;
      int retryCount = 0 ;
      int MAX_RETRY_COUNT = 3;
      while (retryCount++ < MAX_RETRY_COUNT) {
        System.out.println("-------------------------------------------------");
        System.out.println("Default Account Address: " + defaultImportAddress);
        System.out.println("Default Path: " + defaultPath);
        System.out.println("-------------------------------------------------");

        String[] options = {
            "1. Import Default Account",
            "2. Change Path",
            "3. Custom Path"
        };

        for (String option : options) {
          System.out.println(option);
        }

        choice = lineReader.readLine("Please select an option, other inputs will exit this operation: ").trim();
        switch (choice) {
          case "1":
            walletFileName = doImportAccount(password
                , defaultPath, defaultImportAddress, device);
            quit = true;
            break;
          case "2":
            System.out.println("You selected: Change Path");
            walletFileName = doChangeAccount(password, device);
            quit = true;
            break;
          case "3":
            System.out.println("You selected: Custom Path");
            walletFileName = doCustomPath(password, device);
            if ("cancel".equalsIgnoreCase(walletFileName)) {
              continue;
            } else {
              quit = true;
              break;
            }
          case "q":
            quit = true;
            break;
          default:
            System.out.println("Invalid option. Please select 1, 2, 3 or q.");
            continue;
        }
        if (quit) {
          break;
        }
      }
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }

    return walletFileName;
  }

  public String doChangeAccount(char[] password, HidDevice device) throws IOException {
    ImportAccount account = TronLedgerImportAccount.changeAccount(device);
    if (account == null) {
      return null;
    }
    return doImportAccount(password, account.getPath(), account.getAddress(), device);
  }

  public String doCustomPath(char[] password, HidDevice device) throws IOException {
    System.out.println(ANSI_RED+"\nRisk Alert");
    System.out.println("\nYou are not advised to change the \"Path\" of a generated account address unless you are an advanced user.");
    System.out.println("\nPlease do not use the \"Custom Path\" feature if you do not understand how account addresses are generated or the definition of \"Path\", in case you lose access to the new account generated.");

    System.out.println("\nPlease Understand the Risks & Continue.\n"+ConsoleColor.ANSI_RESET);

    Terminal terminal = TerminalBuilder.builder().system(true).dumb(true).build();
    LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();

    int invalidAttempts = 0;
    final int MAX_ATTEMPTS = 3;

    while (invalidAttempts < MAX_ATTEMPTS) {
      try {
        String input = lineReader.readLine("Enter 'y' to continue or 'c' to cancel: ").trim().toLowerCase();
        if ("y".equals(input)) {
          ImportAccount account = TronLedgerImportAccount.enterMnemonicPath(device);
          if (account == null) {
            return null;
          }
          return doImportAccount(password, account.getPath(), account.getAddress(), device);
        } else if ("c".equals(input)) {
          return "cancel";
        } else {
          invalidAttempts++;
          System.out.println("Invalid input. Please enter 'y' or 'c'.");
          if (invalidAttempts == MAX_ATTEMPTS) {
            System.out.println("Maximum invalid attempts reached. Exiting.");
            return "cancel";
          }
        }
      } catch (UserInterruptException | EndOfFileException e) {
        System.out.println("Input interrupted. Exiting.");
        return "cancel";
      }
    }
    return "cancel";
  }

  public String doImportAccount(char[] password, String path, String importAddress, HidDevice device)
      throws IOException {
    byte[] passwdByte = char2Byte(password);
    try {
      WalletFile walletLedgerFile = WalletApi.CreateLedgerWalletFile(
          passwdByte, importAddress, path);
      boolean result = loginLedger(passwdByte, walletLedgerFile);
      if (!result) {
        System.out.println("Login Ledger " + failedHighlight() + " for address: " + importAddress);
        return EMPTY;
      }
      String keystoreName = WalletApi.store2KeystoreLedger(walletLedgerFile);
      LedgerFileUtil.writePathsToFile(Collections.singletonList(path), device);
      if (isUnifiedExist()) {
        wallet.getWalletList().add(walletLedgerFile);
      }
      return keystoreName;
    } catch (Exception e) {
      System.out.println("Import account " + failedHighlight() + "!");
      return EMPTY;
    } finally {
      clear(passwdByte);
    }
  }

  public boolean changePassword(char[] oldPassword, char[] newPassword)
      throws IOException, CipherException {
    logout();
    if (!WalletApi.passwordValid(newPassword)) {
      System.out.println("Warning: ChangePassword " + failedHighlight() + ", NewPassword is invalid !!");
      return false;
    }

    byte[] oldPasswd = char2Byte(oldPassword);
    byte[] newPasswd = char2Byte(newPassword);

    boolean result = WalletApi.changeKeystorePassword(oldPasswd, newPasswd);
    clear(oldPasswd);
    clear(newPasswd);

    return result;
  }

  public boolean isLoginState() {
    return wallet != null && wallet.isLoginState();
  }

  public boolean isUnifiedExist() {
    return isLoginState() && ArrayUtils.isNotEmpty(wallet.getUnifiedPassword());
  }

  public boolean switchWallet() {
    if (!isUnifiedExist()) {
      System.out.println("Please log in with a unified password and try again.");
      return false;
    }
    byte[] password = wallet.getUnifiedPassword();
    List<WalletFile> walletList = wallet.getWalletList();
    selectWalletFileByList(walletList);
    // switch to another wallet
    wallet.setLogin();
    wallet.setUnifiedPassword(password);
    wallet.setWalletList(walletList);
    WalletFile walletFile = wallet.getWalletFile();
    if (walletFile == null) {
      System.out.println("Warning: Login " + failedHighlight() + ", Please check your walletFile");
      return false;
    }
    wallet.setCredentials(null);
    try{
      String decryptStr = getLedgerPath(password, walletFile);
      String prefix = "m/44'/195'/";
      boolean isLedgerUser = decryptStr.startsWith(prefix);
      if (isLedgerUser) {
        wallet.setPath(decryptStr);
        wallet.setLedgerUser(true);
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return false;
    }
    wallet.setLogin();
    return true;
  }

  public boolean loginAll() throws IOException {
    logout();

    System.out.println("Please input your password.");
    byte[] password = char2Byte(inputPassword(false));

    File[] allWalletFile = getAllWalletFile();
    if (ArrayUtils.isEmpty(allWalletFile)) {
      throw new IOException(
          "No keystore file found, please use " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " first!");
    }
    List<WalletFile> walletFileList = newArrayList();
    for (int i = 0; i < allWalletFile.length; i++) {
      File file = allWalletFile[i];
      WalletFile walletFile = WalletUtils.loadWalletFile(file);
      walletFile.setName(file.getName());
      walletFile.setSourceFile(file);
      boolean valid;
      try {
        valid = validPassword(password, walletFile);
      } catch (Exception e) {
        valid = false;
      }
      if (valid) {
        walletFileList.add(walletFile);
      }
      show(i + 1, allWalletFile.length);
    }
    if (walletFileList.isEmpty()) {
      System.out.println("There is no corresponding Keystore file for this password.");
      return false;
    }
    selectWalletFileByList(walletFileList);

    wallet.setLogin();
    wallet.setUnifiedPassword(password);
    wallet.setWalletList(walletFileList);
    WalletFile walletFile = wallet.getWalletFile();
    if (walletFile == null) {
      System.out.println("Warning: Login " + failedHighlight() + ", Please check your walletFile");
      return false;
    }
    wallet.setCredentials(null);
    try{
      String decryptStr = getLedgerPath(password, walletFile);
      String prefix = "m/44'/195'/";
      boolean isLedgerUser = decryptStr.startsWith(prefix);
      if (isLedgerUser) {
        wallet.setPath(decryptStr);
        wallet.setLedgerUser(true);
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return false;
    }

    wallet.setLogin();
    return true;
  }

  private void selectWalletFileByList(List<WalletFile> walletFileList) {
    int size = walletFileList.size();
    if (size > 1) {
      for (int i = 0; i < size; i++) {
        System.out.println("The " + (i + 1) + "th keystore file name is " + walletFileList.get(i).getName());
      }
      System.out.println("Please choose between " + greenBoldHighlight(1) + " and "
          + greenBoldHighlight(size));
      Scanner in = new Scanner(System.in);
      while (true) {
        String input = in.nextLine().trim();
        String num = input.split("\\s+")[0];
        int n;
        try {
          n = Integer.parseInt(num);
        } catch (NumberFormatException e) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose again between 1 and " + size);
          continue;
        }
        if (n < 1 || n > size) {
          System.out.println("Please choose again between 1 and " + size);
          continue;
        }
        WalletFile walletFile = walletFileList.get(n - 1);

        wallet = new WalletApi(walletFile);
        break;
      }
    } else {
      WalletFile wf = walletFileList.get(0);
      wallet = new WalletApi(wf);
      System.out.println("The keystore file " + blueBoldHighlight(wf.getName()) + " is loaded.");
    }
  }

  public boolean login() throws IOException, CipherException {
    logout();
    wallet = WalletApi.loadWalletFromKeystore();

    System.out.println("Please input your password.");
    char[] password = inputPassword(false);
    byte[] passwd = char2Byte(password);
    clear(password);
    wallet.checkPassword(passwd);

    WalletFile walletFile = wallet.getWalletFile();
    if (walletFile == null) {
      System.out.println("Warning: Login " + failedHighlight() + ", Please check your walletFile");
      return false;
    }

    try{
      String decryptStr = getLedgerPath(passwd, walletFile);
      String prefix = "m/44'/195'/";
      boolean isLedgerUser = decryptStr.startsWith(prefix);
      if (isLedgerUser) {
        wallet.setPath(decryptStr);
        wallet.setLedgerUser(true);
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return false;
    }

    wallet.setLogin();
    wallet.setCredentials(null);
    return true;
  }

  public boolean loginLedger(byte[] passwdByte, WalletFile walletLedgerFile) {
    if (!isUnifiedExist()) {
      logout();
    }
    // old
    List<WalletFile> walletList = newArrayList();
    byte[] unifiedPassword = null;
    if (isUnifiedExist()) {
      walletList = wallet.getWalletList();
      unifiedPassword = wallet.getUnifiedPassword();
    }
    // new
    wallet = new WalletApi(walletLedgerFile);
    wallet.setWalletList(walletList);
    wallet.setUnifiedPassword(unifiedPassword);
    try {
      String decryptStr = getLedgerPath(passwdByte, walletLedgerFile);
      String prefix = "m/44'/195'/";
      boolean isLedgerUser = decryptStr.startsWith(prefix);
      if (isLedgerUser) {
        wallet.setPath(decryptStr);
        wallet.setLedgerUser(true);
      }
      wallet.setLogin();
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return false;
    }
    return true;
  }

  public static String getLedgerPath(byte[] passwdByte, WalletFile walletLedgerFile)
      throws CipherException {
    byte[] decrypt = Wallet.decrypt2PrivateBytes(passwdByte, walletLedgerFile);
    return new String(decrypt);
  }


  public void logout() {
    if (wallet != null) {
      wallet.logout();
      wallet = null;
    }
    //Neddn't logout
  }


  public boolean generateSubAccount() throws IOException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: GenerateSubAccount " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = char2Byte(password);
    try {
      wallet.checkPassword(passwd);
    } catch (CipherException e) {
      System.out.println("Password check " + failedHighlight() + "!");
      return false;
    }
    byte[] mnemonic = null;
    SubAccount subAccount = null;
    try {
      String ownerAddress = WalletApi.encode58Check(wallet.getAddress());
      mnemonic = MnemonicUtils.exportMnemonic(passwd, ownerAddress);
      if (mnemonic == null || mnemonic.length == 0) {
        return false;
      }
      subAccount = new SubAccount(passwd, new String(mnemonic), 0);
      subAccount.start(wallet);
    } catch (Exception e) {
      System.out.println("Warning: GenerateSubAccount " + failedHighlight() + ", " + e.getMessage());
      return false;
    } finally {
      if (subAccount != null) {
        subAccount.clearSensitiveData();
      }
      clear(mnemonic);
      clear(password);
      clear(passwd);
    }

    return true;
  }

  public boolean importWalletByMnemonic(List<String> mnemonicWords, byte[] passwd) {
    SubAccount subAccount = null;
    try {
      if (mnemonicWords == null || mnemonicWords.isEmpty()) {
        return false;
      }
      subAccount = new SubAccount(passwd, String.join(" ", mnemonicWords), 1);
      subAccount.start(wallet);
    } catch (Exception e) {
      System.out.println("Warning: importWalletByMnemonic " + failedHighlight() + ", " + e.getMessage());
      return false;
    } finally {
      if (subAccount != null) {
        subAccount.clearSensitiveData();
      }
      clear(passwd);
    }
    return true;
  }

  //password is current, will be enc by password2.
  public byte[] backupWallet() throws IOException, CipherException {
    if (wallet == null || !wallet.isLoginState()) {
      wallet = WalletApi.loadWalletFromKeystore();
      if (wallet == null) {
        System.out.println("Warning: BackupWallet " + failedHighlight() + ", no wallet can be backup !!");
        return null;
      }
    }

    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = char2Byte(password);
    clear(password);
    byte[] privateKey = wallet.getPrivateBytes(passwd);
    clear(passwd);

    return privateKey;
  }

  public byte[] exportWalletMnemonic() throws IOException, CipherException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: ExportWalletMnemonic " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    //1.input password
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = char2Byte(password);
    wallet.checkPassword(passwd);
    clear(password);

    //2.export mnemonic words
    return MnemonicUtils.exportMnemonic(passwd, getAddress());
  }

  public String exportKeystore(String walletChannel, File exportFullDir)
      throws IOException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: ExportKeystore " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    //1.input password
    System.out.println("Please input your password.");
    char[] password = Utils.inputPassword(false);
    byte[] passwd = char2Byte(password);
    try {
      wallet.checkPassword(passwd);
    } catch (CipherException e) {
      System.out.println("Password check " + failedHighlight() + "!");
      return null;
    } finally {
      clear(password);
      clear(passwd);
    }

    return wallet.exportKeystore(walletChannel, exportFullDir);
  }

  public String importWalletByKeystore(byte[] passwdByte, File importFile)
      throws IOException {
    WalletFile walletFile = WalletUtils.loadWalletFile(importFile);

    byte[] priKey = null;
    try {
      priKey = Wallet.decrypt2PrivateBytes(passwdByte, walletFile);
    } catch (Exception e) {
      System.out.println(e.getMessage());
    }

    if (priKey != null) {
      if (!isUnifiedExist()) {
        System.out.println("Please enter the password for the new account after importing the keystore into wallet-cli, enter it twice.");
      }
      char[] password = isUnifiedExist() ?
          byte2Char(wallet.getUnifiedPassword()) : Utils.inputPassword2Twice(false);
      try {
        return importWallet(password, priKey, null);
      } catch (Exception e) {
        System.out.println(e.getMessage());
      } finally {
        clear(password);
      }
    }
    return EMPTY;
  }

  public String getAddress() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: GetAddress " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    return WalletApi.encode58Check(wallet.getAddress());
  }

  public Account queryAccount() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: QueryAccount " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    return wallet.queryAccount();
  }

  public boolean sendCoin(byte[] ownerAddress, byte[] toAddress, long amount)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: SendCoin " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.sendCoin(ownerAddress, toAddress, amount);
  }

  public boolean transferAsset(byte[] ownerAddress, byte[] toAddress, String assertName,
      long amount)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: TransferAsset " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.transferAsset(ownerAddress, toAddress, assertName.getBytes(), amount);
  }

  public boolean participateAssetIssue(byte[] ownerAddress, byte[] toAddress, String assertName,
      long amount) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: TransferAsset " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.participateAssetIssue(ownerAddress, toAddress, assertName.getBytes(), amount);
  }

  public boolean assetIssue(byte[] ownerAddress, String name, String abbrName, long totalSupply,
      int trxNum, int icoNum,
      int precision, long startTime, long endTime, int voteScore, String description, String url,
      long freeNetLimit, long publicFreeNetLimit, HashMap<String, String> frozenSupply)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: assetIssue " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    AssetIssueContract.Builder builder = AssetIssueContract.newBuilder();
    if (ownerAddress == null) {
      ownerAddress = wallet.getAddress();
    }
    builder.setOwnerAddress(ByteString.copyFrom(ownerAddress));
    builder.setName(ByteString.copyFrom(name.getBytes()));
    builder.setAbbr(ByteString.copyFrom(abbrName.getBytes()));

    if (totalSupply <= 0) {
      System.out.println("totalSupply should greater than 0. but really is " + totalSupply);
      return false;
    }
    builder.setTotalSupply(totalSupply);

    if (trxNum <= 0) {
      System.out.println("trxNum should greater than 0. but really is " + trxNum);
      return false;
    }
    builder.setTrxNum(trxNum);

    if (icoNum <= 0) {
      System.out.println("num should greater than 0. but really is " + icoNum);
      return false;
    }
    builder.setNum(icoNum);

    if (precision < 0) {
      System.out.println("precision should greater or equal to 0. but really is " + precision);
      return false;
    }
    builder.setPrecision(precision);

    long now = System.currentTimeMillis();
    if (startTime <= now) {
      System.out.println("startTime should greater than now. but really is startTime("
          + startTime + ") now(" + now + ")");
      return false;
    }
    if (endTime <= startTime) {
      System.out.println("endTime should greater or equal to startTime. but really is endTime("
          + endTime + ") startTime(" + startTime + ")");
      return false;
    }

    if (freeNetLimit < 0) {
      System.out.println("freeAssetNetLimit should greater or equal to 0. but really is "
          + freeNetLimit);
      return false;
    }
    if (publicFreeNetLimit < 0) {
      System.out.println("publicFreeAssetNetLimit should greater or equal to 0. but really is "
          + publicFreeNetLimit);
      return false;
    }

    builder.setStartTime(startTime);
    builder.setEndTime(endTime);
    builder.setVoteScore(voteScore);
    builder.setDescription(ByteString.copyFrom(description.getBytes()));
    builder.setUrl(ByteString.copyFrom(url.getBytes()));
    builder.setFreeAssetNetLimit(freeNetLimit);
    builder.setPublicFreeAssetNetLimit(publicFreeNetLimit);

    for (String daysStr : frozenSupply.keySet()) {
      String amountStr = frozenSupply.get(daysStr);
      long amount = Long.parseLong(amountStr);
      long days = Long.parseLong(daysStr);
      AssetIssueContract.FrozenSupply.Builder frozenSupplyBuilder
          = AssetIssueContract.FrozenSupply.newBuilder();
      frozenSupplyBuilder.setFrozenAmount(amount);
      frozenSupplyBuilder.setFrozenDays(days);
      builder.addFrozenSupply(frozenSupplyBuilder.build());
    }

    return wallet.createAssetIssue(builder.build());
  }

  public boolean createAccount(byte[] ownerAddress, byte[] address)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createAccount " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.createAccount(ownerAddress, address);
  }


  public boolean createWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.createWitness(ownerAddress, url.getBytes());
  }

  public boolean updateWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.updateWitness(ownerAddress, url.getBytes());
  }

  public Block getBlock(long blockNum) {
    return WalletApi.getBlock(blockNum);
  }

  public long getTransactionCountByBlockNum(long blockNum) {
    return WalletApi.getTransactionCountByBlockNum(blockNum);
  }

  public BlockExtention getBlock2(long blockNum) {
    return WalletApi.getBlock2(blockNum);
  }

  public boolean voteWitness(byte[] ownerAddress, HashMap<String, String> witness)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: VoteWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.voteWitness(ownerAddress, witness);
  }

  public Optional<WitnessList> listWitnesses() {
    try {
      return WalletApi.listWitnesses();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<AssetIssueList> getAssetIssueList() {
    try {
      return WalletApi.getAssetIssueList();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<AssetIssueList> getAssetIssueList(long offset, long limit) {
    try {
      return WalletApi.getAssetIssueList(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public AssetIssueContract getAssetIssueByName(String assetName) {
    return WalletApi.getAssetIssueByName(assetName);
  }

  public Optional<AssetIssueList> getAssetIssueListByName(String assetName) {
    try {
      return WalletApi.getAssetIssueListByName(assetName);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public AssetIssueContract getAssetIssueById(String assetId) {
    return WalletApi.getAssetIssueById(assetId);
  }

  public Optional<ProposalList> getProposalListPaginated(long offset, long limit) {
    try {
      return WalletApi.getProposalListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ExchangeList> getExchangeListPaginated(long offset, long limit) {
    try {
      return WalletApi.getExchangeListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<NodeList> listNodes() {
    try {
      return WalletApi.listNodes();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public GrpcAPI.NumberMessage getTotalTransaction() {
    return WalletApi.getTotalTransaction();
  }

  public GrpcAPI.NumberMessage getNextMaintenanceTime() {
    return WalletApi.getNextMaintenanceTime();
  }

  public boolean updateAccount(byte[] ownerAddress, byte[] accountNameBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAccount " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.updateAccount(ownerAddress, accountNameBytes);
  }

  public boolean setAccountId(byte[] ownerAddress, byte[] accountIdBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: setAccount " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.setAccountId(ownerAddress, accountIdBytes);
  }


  public boolean updateAsset(byte[] ownerAddress, byte[] description, byte[] url, long newLimit,
      long newPublicLimit) throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAsset " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.updateAsset(ownerAddress, description, url, newLimit, newPublicLimit);
  }

  public boolean freezeBalance(byte[] ownerAddress, long frozen_balance, long frozen_duration,
      int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.freezeBalance(ownerAddress, frozen_balance, frozen_duration, resourceCode,
        receiverAddress);
  }

  public boolean freezeBalanceV2(byte[] ownerAddress, long frozen_balance,
                               int resourceCode)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalanceV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.freezeBalanceV2(ownerAddress, frozen_balance, resourceCode);
  }

  public boolean buyStorage(byte[] ownerAddress, long quantity)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: buyStorage " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.buyStorage(ownerAddress, quantity);
  }

  public boolean buyStorageBytes(byte[] ownerAddress, long bytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: buyStorageBytes " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.buyStorageBytes(ownerAddress, bytes);
  }

  public boolean sellStorage(byte[] ownerAddress, long storageBytes)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: sellStorage " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.sellStorage(ownerAddress, storageBytes);
  }


  public boolean unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeBalance(ownerAddress, resourceCode, receiverAddress);
  }

  public boolean unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance
          , int resourceCode)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalanceV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeBalanceV2(ownerAddress, unfreezeBalance, resourceCode);
  }

  public boolean withdrawExpireUnfreeze(byte[] ownerAddress)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawExpireUnfreeze " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.withdrawExpireUnfreeze(ownerAddress);
  }

  public boolean delegateresource(byte[] ownerAddress, long balance
          , int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: delegateresource " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.delegateResource(ownerAddress, balance
        , resourceCode, receiverAddress, lock, lockPeriod);
  }

  public boolean undelegateresource(byte[] ownerAddress, long balance
          , int resourceCode, byte[] receiverAddress)
          throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: undelegateresource " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unDelegateResource(ownerAddress, balance, resourceCode, receiverAddress);
  }

  public boolean cancelAllUnfreezeV2()
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: cancelAllUnfreezeV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }
    return wallet.cancelAllUnfreezeV2();
  }

  public boolean unfreezeAsset(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeAsset " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeAsset(ownerAddress);
  }

  public boolean withdrawBalance(byte[] ownerAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.withdrawBalance(ownerAddress);
  }

  public boolean createProposal(byte[] ownerAddress, HashMap<Long, Long> parametersMap)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.createProposal(ownerAddress, parametersMap);
  }


  public Optional<ProposalList> getProposalsList() {
    try {
      return WalletApi.listProposals();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<Proposal> getProposals(String id) {
    try {
      return WalletApi.getProposal(id);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ExchangeList> getExchangeList() {
    try {
      return WalletApi.listExchanges();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<Exchange> getExchange(String id) {
    try {
      return WalletApi.getExchange(id);
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }

  public Optional<ChainParameters> getChainParameters() {
    try {
      return WalletApi.getChainParameters();
    } catch (Exception ex) {
      ex.printStackTrace();
      return Optional.empty();
    }
  }


  public boolean approveProposal(byte[] ownerAddress, long id, boolean is_add_approval)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: approveProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.approveProposal(ownerAddress, id, is_add_approval);
  }

  public boolean deleteProposal(byte[] ownerAddress, long id)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: deleteProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.deleteProposal(ownerAddress, id);
  }

  public boolean exchangeCreate(byte[] ownerAddress, byte[] firstTokenId, long firstTokenBalance,
      byte[] secondTokenId, long secondTokenBalance)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeCreate " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeCreate(ownerAddress, firstTokenId, firstTokenBalance,
        secondTokenId, secondTokenBalance);
  }

  public boolean exchangeInject(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeInject " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeInject(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeWithdraw(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeWithdraw " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeWithdraw(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeTransaction(byte[] ownerAddress, long exchangeId, byte[] tokenId,
      long quant, long expected)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeTransaction " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeTransaction(ownerAddress, exchangeId, tokenId, quant, expected);
  }

  public boolean updateSetting(byte[] ownerAddress, byte[] contractAddress,
      long consumeUserResourcePercent)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.updateSetting(ownerAddress, contractAddress, consumeUserResourcePercent);

  }

  public boolean updateEnergyLimit(byte[] ownerAddress, byte[] contractAddress,
      long originEnergyLimit)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.updateEnergyLimit(ownerAddress, contractAddress, originEnergyLimit);
  }

  public boolean clearContractABI(byte[] ownerAddress, byte[] contractAddress)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.clearContractABI(ownerAddress, contractAddress);
  }

  public boolean clearWalletKeystore() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: clearWalletKeystore " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    boolean clearWalletKeystoreRet =  wallet.clearWalletKeystore();
    if (clearWalletKeystoreRet) {
      logout();
    }
    return clearWalletKeystoreRet;
  }


  public boolean deployContract(byte[] ownerAddress, String name, String abiStr, String codeStr,
      long feeLimit, long value, long consumeUserResourcePercent, long originEnergyLimit,
      long tokenValue, String tokenId, String libraryAddressPair, String compilerVersion)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createContract " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet
        .deployContract(ownerAddress, name, abiStr, codeStr, feeLimit, value,
            consumeUserResourcePercent,
            originEnergyLimit, tokenValue, tokenId,
            libraryAddressPair, compilerVersion);
  }

  public boolean callContract(byte[] ownerAddress, byte[] contractAddress, long callValue,
      byte[] data, long feeLimit,
      long tokenValue, String tokenId, boolean isConstant)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: callContract " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet
        .triggerContract(ownerAddress, contractAddress, callValue, data, feeLimit, tokenValue,
            tokenId,
            isConstant, false).getLeft();
  }

  public boolean estimateEnergy(byte[] ownerAddress, byte[] contractAddress, long callValue,
      byte[] data, long tokenValue, String tokenId)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: estimateEnergy failed, Please login first !!");
      return false;
    }

    return wallet
        .estimateEnergy(ownerAddress, contractAddress, callValue, data, tokenValue, tokenId);
  }

  public boolean accountPermissionUpdate(byte[] ownerAddress, String permission)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: accountPermissionUpdate " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.accountPermissionUpdate(ownerAddress, permission);
  }


  public Transaction addTransactionSign(Transaction transaction)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: addTransactionSign " + failedHighlight() + ",  Please login first !!");
      return null;
    }
    return wallet.addTransactionSign(transaction);
  }

  public boolean sendShieldedCoin(String fromAddress, long fromAmount, List<Long> shieldedInputList,
      List<GrpcAPI.Note> shieldedOutputList, String toAddress, long toAmount)
      throws CipherException, IOException, CancelException, ZksnarkException {
    PrivateParameters.Builder builder = PrivateParameters.newBuilder();
    if (!StringUtil.isNullOrEmpty(fromAddress) && fromAmount > 0) {
      byte[] from = WalletApi.decodeFromBase58Check(fromAddress);
      if (from == null) {
        return false;
      }
      builder.setTransparentFromAddress(ByteString.copyFrom(from));
      builder.setFromAmount(fromAmount);
    }

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount);
    }

    if (shieldedInputList.size() > 0) {
      OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
        outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
        outPointBuild.setIndex(noteInfo.getIndex());
        request.addOutPoints(outPointBuild.build());
      }
      Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
          WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
      if (!merkleVoucherInfo.isPresent()
          || merkleVoucherInfo.get().getVouchersCount() != shieldedInputList.size()) {
        System.out.println("Can't get all merkel tree, please check the notes.");
        return false;
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldedAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedWrapper.getInstance().getShieldedAddressInfoMap().get(shieldedAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getValue());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
        spendNoteBuilder.setNote(noteBuild.build());
        spendNoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendNoteBuilder.setVoucher(merkleVoucherInfo.get().getVouchers(i));
        spendNoteBuilder.setPath(merkleVoucherInfo.get().getPaths(i));

        builder.addShieldedSpends(spendNoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(shieldedOutputList.get(i)).build());
      }
    }

    return WalletApi.sendShieldedCoin(builder.build(), wallet);
  }

  public boolean sendShieldedCoinWithoutAsk(String fromAddress, long fromAmount,
      List<Long> shieldedInputList,
      List<GrpcAPI.Note> shieldedOutputList, String toAddress, long toAmount)
      throws CipherException, IOException, CancelException, ZksnarkException {
    PrivateParametersWithoutAsk.Builder builder = PrivateParametersWithoutAsk.newBuilder();
    if (!StringUtil.isNullOrEmpty(fromAddress)) {
      byte[] from = WalletApi.decodeFromBase58Check(fromAddress);
      if (from == null) {
        return false;
      }
      builder.setTransparentFromAddress(ByteString.copyFrom(from));
      builder.setFromAmount(fromAmount);
    }

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount);
    }

    byte[] ask = new byte[32];
    if (shieldedInputList.size() > 0) {
      OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
        outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
        outPointBuild.setIndex(noteInfo.getIndex());
        request.addOutPoints(outPointBuild.build());
      }
      Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
          WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
      if (!merkleVoucherInfo.isPresent()
          || merkleVoucherInfo.get().getVouchersCount() != shieldedInputList.size()) {
        System.out.println("Can't get all merkel tree, please check the notes.");
        return false;
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedWrapper.getInstance().getShieldedAddressInfoMap().get(shieldAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          System.arraycopy(expandedSpendingKey.getAsk(), 0, ask, 0, 32);
          builder.setAk(ByteString.copyFrom(
              ExpandedSpendingKey.getAkFromAsk(expandedSpendingKey.getAsk())));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getValue());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
        spendNoteBuilder.setNote(noteBuild.build());
        spendNoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendNoteBuilder.setVoucher(merkleVoucherInfo.get().getVouchers(i));
        spendNoteBuilder.setPath(merkleVoucherInfo.get().getPaths(i));

        builder.addShieldedSpends(spendNoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(shieldedOutputList.get(i)).build());
      }
    }

    return WalletApi.sendShieldedCoinWithoutAsk(builder.build(), ask, wallet);
  }

  public boolean resetShieldedNote() {
    System.out.println("Start to reset reset shielded notes, please wait ...");
    ShieldedWrapper.getInstance().setResetNote(true);
    return true;
  }

  public boolean scanNoteByIvk(final String ivk, long start, long end) {
    GrpcAPI.IvkDecryptParameters ivkDecryptParameters = IvkDecryptParameters.newBuilder()
        .setStartBlockIndex(start)
        .setEndBlockIndex(end)
        .setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)))
        .build();

    Optional<DecryptNotes> decryptNotes = WalletApi.scanNoteByIvk(ivkDecryptParameters, true);
    if (!decryptNotes.isPresent()) {
      System.out.println("scanNoteByIvk failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(decryptNotes.get()));
//            for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                Note note = noteTx.getNote();
//                System.out.println("\ntxid:{}\nindex:{}\naddress:{}\nrcm:{}\nvalue:{}\nmemo:{}",
//                        ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                        noteTx.getIndex(),
//                        note.getPaymentAddress(),
//                        ByteArray.toHexString(note.getRcm().toByteArray()),
//                        note.getValue(),
//                        ZenUtils.getMemo(note.getMemo().toByteArray()));
//            }
//            System.out.println("complete.");
    }
    return true;
  }

  public boolean scanAndMarkNoteByAddress(final String shieldedAddress, long start, long end) {
    ShieldedAddressInfo addressInfo = ShieldedWrapper.getInstance().getShieldedAddressInfoMap()
        .get(shieldedAddress);
    if (addressInfo == null) {
      System.out.println("Can't find shieldedAddress in local, please check shieldedAddress.");
      return false;
    }

    try {
      IvkDecryptAndMarkParameters.Builder builder = IvkDecryptAndMarkParameters.newBuilder();
      builder.setStartBlockIndex(start);
      builder.setEndBlockIndex(end);
      builder.setIvk(ByteString.copyFrom(addressInfo.getIvk()));
      builder.setAk(ByteString.copyFrom(addressInfo.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(addressInfo.getFullViewingKey().getNk()));

      Optional<DecryptNotesMarked> decryptNotes = WalletApi.scanAndMarkNoteByIvk(builder.build());
      if (decryptNotes.isPresent()) {
        System.out.println(Utils.formatMessageString(decryptNotes.get()));

//                for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                    DecryptNotesMarked.NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                    Note note = noteTx.getNote();
//                    System.out.println("\ntxid:{}\nindex:{}\nisSpend:{}\naddress:{}\nrcm:{}\nvalue:{}\nmemo:{}",
//                            ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                            noteTx.getIndex(),
//                            noteTx.getIsSpend(),
//                            note.getPaymentAddress(),
//                            ByteArray.toHexString(note.getRcm().toByteArray()),
//                            note.getValue(),
//                            ZenUtils.getMemo(note.getMemo().toByteArray()));
//                }
      } else {
        System.out.println("scanAndMarkNoteByIvk failed !!!");
      }
    } catch (Exception e) {

    }
    System.out.println("complete.");
    return true;
  }

  public boolean scanShieldedNoteByovk(final String shieldedAddress, long start, long end) {
    GrpcAPI.OvkDecryptParameters ovkDecryptParameters = OvkDecryptParameters.newBuilder()
        .setStartBlockIndex(start)
        .setEndBlockIndex(end)
        .setOvk(ByteString.copyFrom(ByteArray.fromHexString(shieldedAddress)))
        .build();

    Optional<DecryptNotes> decryptNotes = WalletApi.scanNoteByOvk(ovkDecryptParameters, true);
    if (!decryptNotes.isPresent()) {
      System.out.println("ScanNoteByOvk failed !!!");
    } else {
      System.out.println(Utils.formatMessageString(decryptNotes.get()));
//            for (int i = 0; i < decryptNotes.get().getNoteTxsList().size(); i++) {
//                NoteTx noteTx = decryptNotes.get().getNoteTxs(i);
//                Note note = noteTx.getNote();
//                System.out.println("\ntxid:{}\nindex:{}\npaymentAddress:{}\nrcm:{}\nmemo:{}\nvalue:{}",
//                        ByteArray.toHexString(noteTx.getTxid().toByteArray()),
//                        noteTx.getIndex(),
//                        note.getPaymentAddress(),
//                        ByteArray.toHexString(note.getRcm().toByteArray()),
//                        ZenUtils.getMemo(note.getMemo().toByteArray()),
//                        note.getValue());
//            }
      System.out.println("complete.");
    }
    return true;
  }

  public Optional<ShieldedAddressInfo> getNewShieldedAddress() {
    ShieldedAddressInfo addressInfo = new ShieldedAddressInfo();
    try {
      Optional<BytesMessage> sk = WalletApi.getSpendingKey();
      Optional<DiversifierMessage> d = WalletApi.getDiversifier();

      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(sk.get());

      BytesMessage.Builder askBuilder = BytesMessage.newBuilder();
      askBuilder.setValue(expandedSpendingKeyMessage.get().getAsk());
      Optional<BytesMessage> ak = WalletApi.getAkFromAsk(askBuilder.build());

      BytesMessage.Builder nskBuilder = BytesMessage.newBuilder();
      nskBuilder.setValue(expandedSpendingKeyMessage.get().getNsk());
      Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nskBuilder.build());

      ViewingKeyMessage.Builder viewBuilder = ViewingKeyMessage.newBuilder();
      viewBuilder.setAk(ak.get().getValue());
      viewBuilder.setNk(nk.get().getValue());
      Optional<IncomingViewingKeyMessage> ivk = WalletApi
          .getIncomingViewingKey(viewBuilder.build());

      IncomingViewingKeyDiversifierMessage.Builder builder = IncomingViewingKeyDiversifierMessage
          .newBuilder();
      builder.setD(d.get());
      builder.setIvk(ivk.get());
      Optional<PaymentAddressMessage> addressMessage = WalletApi
          .getZenPaymentAddress(builder.build());
      addressInfo.setSk(sk.get().getValue().toByteArray());
      addressInfo.setD(new DiversifierT(d.get().getD().toByteArray()));
      addressInfo.setIvk(ivk.get().getIvk().toByteArray());
      addressInfo.setOvk(expandedSpendingKeyMessage.get().getOvk().toByteArray());
      addressInfo.setPkD(addressMessage.get().getPkD().toByteArray());

//            System.out.println("ivk " + ByteArray.toHexString(ivk.get().getIvk().toByteArray()));
//            System.out.println("ovk " + ByteArray.toHexString(expandedSpendingKeyMessage.get().getOvk().toByteArray()));

      if (addressInfo.validateCheck()) {
        return Optional.of(addressInfo);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return Optional.empty();
  }

  public byte[] getRandomOvk() {
    try {
      Optional<BytesMessage> sk = WalletApi.getSpendingKey();
      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(sk.get());
      return expandedSpendingKeyMessage.get().getOvk().toByteArray();
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  public Optional<ShieldedAddressInfo> getNewShieldedAddressBySkAndD(byte[] sk, byte[] d) {
    ShieldedAddressInfo addressInfo = new ShieldedAddressInfo();
    try {
      BytesMessage.Builder skBuilder = BytesMessage.newBuilder();
      skBuilder.setValue(ByteString.copyFrom(sk));

      DiversifierMessage.Builder dBuilder = DiversifierMessage.newBuilder();
      dBuilder.setD(ByteString.copyFrom(d));

      Optional<ExpandedSpendingKeyMessage> expandedSpendingKeyMessage = WalletApi
          .getExpandedSpendingKey(skBuilder.build());

      BytesMessage.Builder askBuilder = BytesMessage.newBuilder();
      askBuilder.setValue(expandedSpendingKeyMessage.get().getAsk());
      Optional<BytesMessage> ak = WalletApi.getAkFromAsk(askBuilder.build());

      BytesMessage.Builder nskBuilder = BytesMessage.newBuilder();
      nskBuilder.setValue(expandedSpendingKeyMessage.get().getNsk());
      Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nskBuilder.build());

      ViewingKeyMessage.Builder viewBuilder = ViewingKeyMessage.newBuilder();
      viewBuilder.setAk(ak.get().getValue());
      viewBuilder.setNk(nk.get().getValue());
      Optional<IncomingViewingKeyMessage> ivk = WalletApi
          .getIncomingViewingKey(viewBuilder.build());

      IncomingViewingKeyDiversifierMessage.Builder builder = IncomingViewingKeyDiversifierMessage
          .newBuilder();
      builder.setD(dBuilder.build());
      builder.setIvk(ivk.get());
      Optional<PaymentAddressMessage> addressMessage = WalletApi
          .getZenPaymentAddress(builder.build());
      addressInfo.setSk(sk);
      addressInfo.setD(new DiversifierT(d));
      addressInfo.setIvk(ivk.get().getIvk().toByteArray());
      addressInfo.setOvk(expandedSpendingKeyMessage.get().getOvk().toByteArray());
      addressInfo.setPkD(addressMessage.get().getPkD().toByteArray());

      if (addressInfo.validateCheck()) {
        return Optional.of(addressInfo);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return Optional.empty();
  }

  public String getShieldedNulltifier(long index) {
    ShieldedNoteInfo noteInfo = ShieldedWrapper.getInstance().getUtxoMapNote().get(index);
    if (noteInfo == null) {
      return null;
    }

    OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
    OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
    outPointBuild.setHash(ByteString.copyFrom(ByteArray.fromHexString(noteInfo.getTrxId())));
    outPointBuild.setIndex(noteInfo.getIndex());
    request.addOutPoints(outPointBuild.build());
    Optional<IncrementalMerkleVoucherInfo> merkleVoucherInfo =
        WalletApi.GetMerkleTreeVoucherInfo(request.build(), true);
    if (!merkleVoucherInfo.isPresent() || merkleVoucherInfo.get().getVouchersCount() < 1) {
      System.out.println("get merkleVoucherInfo failure.");
      return null;
    }

    Note.Builder noteBuild = Note.newBuilder();
    noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
    noteBuild.setValue(noteInfo.getValue());
    noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
    noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

    System.out.println("address " + noteInfo.getPaymentAddress());
    System.out.println("value " + noteInfo.getValue());
    System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
    System.out.println("trxId " + noteInfo.getTrxId());
    System.out.println("index " + noteInfo.getIndex());
    System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

    String shieldedAddress = noteInfo.getPaymentAddress();
    ShieldedAddressInfo addressInfo = ShieldedWrapper.getInstance().getShieldedAddressInfoMap()
        .get(shieldedAddress);

    SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());

    try {
      FullViewingKey fullViewingKey = spendingKey.fullViewingKey();
      NfParameters.Builder builder = NfParameters.newBuilder();
      builder.setNote(noteBuild.build());
      builder.setVoucher(merkleVoucherInfo.get().getVouchers(0));
      builder.setAk(ByteString.copyFrom(fullViewingKey.getAk()));
      builder.setNk(ByteString.copyFrom(fullViewingKey.getNk()));

      Optional<BytesMessage> nullifier = WalletApi.createShieldedNullifier(builder.build());
      return ByteArray.toHexString(nullifier.get().getValue().toByteArray());

    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  public byte[] getRcm() {
    return WalletApi.getRcm().get().getValue().toByteArray();
  }

  public boolean updateBrokerage(byte[] ownerAddress, int brokerage)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.updateBrokerage(ownerAddress, brokerage);
  }

  public GrpcAPI.NumberMessage getReward(byte[] ownerAddress) {
    return WalletApi.getReward(ownerAddress);
  }

  public GrpcAPI.NumberMessage getBrokerage(byte[] ownerAddress) {
    return WalletApi.getBrokerage(ownerAddress);
  }

  public PricesResponseMessage getBandwidthPrices() {
    return WalletApi.getBandwidthPrices();
  }

  public PricesResponseMessage getEnergyPrices() {
    return WalletApi.getEnergyPrices();
  }

  public PricesResponseMessage getMemoFee() {
    return WalletApi.getMemoFee();
  }

  public boolean scanShieldedTRC20NoteByIvk(byte[] address, final String ivk,
                                            final String ak, final String nk,
                                            long start, long end, String[] events) {
    GrpcAPI.IvkDecryptTRC20Parameters.Builder builder = IvkDecryptTRC20Parameters
        .newBuilder();
    builder.setStartBlockIndex(start)
           .setEndBlockIndex(end)
           .setShieldedTRC20ContractAddress(ByteString.copyFrom(address))
           .setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)))
           .setAk(ByteString.copyFrom(ByteArray.fromHexString(ak)))
           .setNk(ByteString.copyFrom(ByteArray.fromHexString(nk)));
    if (events != null ) {
      for (String event : events) {
        builder.addEvents(event);
      }
    }
    GrpcAPI.IvkDecryptTRC20Parameters parameters = builder.build();

    Optional<DecryptNotesTRC20> notes = WalletApi.scanShieldedTRC20NoteByIvk(
        parameters, true);
    if (!notes.isPresent()) {
      return false;
    }
    if (notes.get().getNoteTxsList().size() > 0) {
      BigInteger scalingFactor;
      if (ShieldedTRC20Wrapper.getInstance().ifShieldedTRC20WalletLoaded()
          && ByteUtil.equals(address, WalletApi.decodeFromBase58Check(
              ShieldedTRC20Wrapper.getInstance().getShieldedTRC20ContractAddress()))) {
        scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
      } else {
        try {
          String scalingFactorHexStr = getScalingFactor(address);
          scalingFactor = new BigInteger(scalingFactorHexStr, 16);
        } catch (Exception e) {
          return false;
        }
      }

      System.out.println("[");
      for(DecryptNotesTRC20.NoteTx noteTx : notes.get().getNoteTxsList()) {
        System.out.println("\t{");
        System.out.println("\t\t note: {");
        BigInteger showValue =
            BigInteger.valueOf(noteTx.getNote().getValue()).multiply(scalingFactor);
        System.out.println("\t\t\t value: " + showValue.toString());
        System.out.println("\t\t\t payment_address: " + noteTx.getNote().getPaymentAddress());
        System.out.println("\t\t\t rcm: "
            + ByteArray.toHexString(noteTx.getNote().getRcm().toByteArray()));
        System.out.println("\t\t\t memo: " + noteTx.getNote().getMemo().toStringUtf8());
        System.out.println("\t\t }\n\t\t position: " + noteTx.getPosition());
        if (!(ak == null || nk == null)) {
          System.out.println("\t\t is_spent: " + noteTx.getIsSpent());
        }
        System.out.println("\t\t tx_id: " + ByteArray.toHexString(noteTx.getTxid().toByteArray()));
        System.out.println("\t}");
      }
      System.out.println("]");
    } else {
      System.out.println("No notes found!");
    }
    return true;
  }

  public boolean scanShieldedTRC20NoteByOvk(final String ovk, long start, long end,
                                            byte[] contractAddress, String[] events) {
    GrpcAPI.OvkDecryptTRC20Parameters.Builder builder = OvkDecryptTRC20Parameters.newBuilder();
    builder.setStartBlockIndex(start)
           .setEndBlockIndex(end)
           .setOvk(ByteString.copyFrom(ByteArray.fromHexString(ovk)))
           .setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));
    if (events != null ) {
      for (String event : events) {
        builder.addEvents(event);
      }
    }
    GrpcAPI.OvkDecryptTRC20Parameters parameters = builder.build();
    Optional<DecryptNotesTRC20> notes = WalletApi.scanShieldedTRC20NoteByOvk(parameters, true);
    if (!notes.isPresent()) {
      return false;
    }
    if (notes.get().getNoteTxsList().size() > 0) {
      BigInteger scalingFactor;
      if (ShieldedTRC20Wrapper.getInstance().ifShieldedTRC20WalletLoaded()
          && ByteUtil.equals(contractAddress, WalletApi.decodeFromBase58Check(
          ShieldedTRC20Wrapper.getInstance().getShieldedTRC20ContractAddress()))) {
        scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
      } else {
        try {
          String scalingFactorHexStr = getScalingFactor(contractAddress);
          scalingFactor = new BigInteger(scalingFactorHexStr, 16);
        } catch (Exception e) {
          return false;
        }
      }

      System.out.println("[");
      for(DecryptNotesTRC20.NoteTx noteTx : notes.get().getNoteTxsList()) {
        System.out.println("\t{");
        //note
        if (noteTx.hasNote()) {
          System.out.println("\t\t note: {");
          BigInteger showValue =
              BigInteger.valueOf(noteTx.getNote().getValue()).multiply(scalingFactor);
          System.out.println("\t\t\t value: " + showValue.toString());
          System.out.println("\t\t\t payment_address: " + noteTx.getNote().getPaymentAddress());
          System.out.println("\t\t\t rcm: "
              + ByteArray.toHexString(noteTx.getNote().getRcm().toByteArray()));
          System.out.println("\t\t\t memo: " + noteTx.getNote().getMemo().toStringUtf8());
          System.out.println("\t\t }");
        } else {
          //This is specific for BURN.
          try {
            String toAddress =
                WalletApi.encode58Check(noteTx.getTransparentToAddress().toByteArray());
            System.out.println("\t\t transparent_to_address: " + toAddress);
          } catch (Exception e) {
            System.out.println("\t\t transparent_to_address: "
                + ByteArray.toHexString(noteTx.getTransparentToAddress().toByteArray()));
          }
          System.out.println("\t\t transparent_amount: " + noteTx.getToAmount());
        }
        System.out.println("\t\t tx_id: " + ByteArray.toHexString(noteTx.getTxid().toByteArray()));
        System.out.println("\t}");
      }
      System.out.println("]");
    } else {
      System.out.println("No notes found!");
    }
    return true;
  }

  public boolean sendShieldedTRC20Coin(int shieldedContractType, BigInteger fromAmount,
                                       List<Long> shieldedInputList,
                                       List<GrpcAPI.Note> shieldedOutputList,
                                       String toAddress, BigInteger toAmount,
                                       String contractAddress, String shieldedContractAddress)
      throws CipherException, IOException, CancelException, ZksnarkException {
    BigInteger scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
    if (shieldedContractType == 0
        && BigInteger.valueOf(shieldedOutputList.get(0).getValue())
                     .multiply(scalingFactor)
                     .compareTo(fromAmount) != 0) {
      System.out.println("MINT: fromPublicAmount must be equal to note amount.");
      return false;
    }
    if (shieldedContractType == 2) {
      ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
          .get(shieldedInputList.get(0));
      BigInteger valueBalanceBi = noteInfo.getRawValue();
      if (shieldedOutputList.size() > 0) {
        valueBalanceBi = valueBalanceBi.subtract(BigInteger.valueOf(
            shieldedOutputList.get(0).getValue()).multiply(scalingFactor));
      }
      if (valueBalanceBi.compareTo(toAmount) != 0) {
        System.out.println("BURN: shielded input amount must be equal to output amount.");
        return false;
      }
    }

    PrivateShieldedTRC20Parameters.Builder builder = PrivateShieldedTRC20Parameters.newBuilder();
    builder.setFromAmount(fromAmount.toString());
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    if (shieldedContractAddressBytes == null) {
      System.out.println("Invalid shieldedContractAddress.");
      return false;
    }
    builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(shieldedContractAddressBytes));

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount.toString());
    }

    long valueBalance = 0;
    if (!shieldedInputList.isEmpty()) {
      List<String> rootAndPath = new ArrayList<>();
      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        long position = noteInfo.getPosition();
        rootAndPath.add(getRootAndPath(shieldedContractAddress, position));
      }
      if (rootAndPath.isEmpty() || rootAndPath.size() != shieldedInputList.size()) {
        System.out.println("Can't get all merkle tree, please check the notes.");
        return false;
      }

      for(int i = 0; i < rootAndPath.size(); i++) {
        if (rootAndPath.get(i) == null) {
          System.out.println("Can't get merkle path, please check the note " + i + ".");
          return false;
        }
      }

      for (int i = 0; i < shieldedInputList.size(); ++i) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldedAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedTRC20Wrapper.getInstance().getShieldedAddressInfoMap().get(shieldedAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getRawValue().toString());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("position " + noteInfo.getPosition());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        byte[] eachRootAndPath = ByteArray.fromHexString(rootAndPath.get(i));
        byte[] root = Arrays.copyOfRange(eachRootAndPath, 0, 32);
        byte[] path = Arrays.copyOfRange(eachRootAndPath, 32, 1056);
        SpendNoteTRC20.Builder spendTRC20NoteBuilder = SpendNoteTRC20.newBuilder();
        spendTRC20NoteBuilder.setNote(noteBuild.build());
        spendTRC20NoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendTRC20NoteBuilder.setRoot(ByteString.copyFrom(root));
        spendTRC20NoteBuilder.setPath(ByteString.copyFrom(path));
        spendTRC20NoteBuilder.setPos(noteInfo.getPosition());

        valueBalance = Math.addExact(valueBalance, noteInfo.getValue());
        builder.addShieldedSpends(spendTRC20NoteBuilder.build());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure, please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); i++) {
        GrpcAPI.Note note = shieldedOutputList.get(i);
        valueBalance = Math.subtractExact(valueBalance, note.getValue());
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(note).build());
      }
    }
    if (shieldedContractType == 1 && valueBalance != 0) {
      System.out.println("TRANSFER: the sum of shielded input amount should be equal to the " +
              "sum of shielded output amount");
      return false;
    }
    ShieldedTRC20Parameters parameters =
        WalletApi.createShieldedContractParameters(builder.build());
    if (parameters == null) {
      System.out.println("CreateShieldedContractParameters failed, please check input data!");
      return false;
    }
    String inputData = parameters.getTriggerContractInput();
    if (inputData == null) {
      System.out.println("CreateShieldedContractParameters failed, please check input data!");
      return false;
    }

    if (shieldedContractType == 0) { //MINT
      boolean setAllowanceResult = setAllowance(contractAddress, shieldedContractAddress,
          fromAmount);
      if (!setAllowanceResult) {
        System.out.println("SetAllowance failed, please check wallet account!");
        return false;
      }
      boolean mintResult = triggerShieldedContract(shieldedContractAddress, inputData, 0);
      if (mintResult) {
        System.out.println("MINT succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract MINT " + failedHighlight() + "!!");
        return false;
      }
    } else if (shieldedContractType == 1) { //TRANSFER
      boolean transferResult = triggerShieldedContract(shieldedContractAddress, inputData, 1);
      if (transferResult) {
        System.out.println("TRANSFER succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract TRANSFER " + failedHighlight() + "!");
        return false;
      }
    } else if (shieldedContractType == 2) { //BURN
      boolean burnResult = triggerShieldedContract(shieldedContractAddress, inputData, 2);
      if (burnResult) {
        System.out.println("BURN succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract BURN " + failedHighlight() + "!");
        return false;
      }
    } else {
      System.out.println("Unsupported shieldedContractType!");
      return false;
    }
  }

  public boolean sendShieldedTRC20CoinWithoutAsk(int shieldedContractType, BigInteger fromAmount,
                                                 List<Long> shieldedInputList,
                                                 List<GrpcAPI.Note> shieldedOutputList,
                                                 String toAddress, BigInteger toAmount,
                                                 String contractAddress,
                                                 String shieldedContractAddress)
      throws CipherException, IOException, CancelException, ZksnarkException {
    BigInteger scalingFactor = ShieldedTRC20Wrapper.getInstance().getScalingFactor();
    if (shieldedContractType == 0
        && BigInteger.valueOf(shieldedOutputList.get(0).getValue())
                     .multiply(scalingFactor)
                     .compareTo(fromAmount) != 0) {
      System.out.println("MINT: fromPublicAmount must be equal to note amount.");
      return false;
    }
    if (shieldedContractType == 2) {
      ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
          .get(shieldedInputList.get(0));
      BigInteger valueBalanceBi = noteInfo.getRawValue();
      if (shieldedOutputList.size() > 0) {
        valueBalanceBi = valueBalanceBi.subtract(BigInteger.valueOf(
            shieldedOutputList.get(0).getValue()).multiply(scalingFactor));
      }
      if (valueBalanceBi.compareTo(toAmount) != 0) {
        System.out.println("BURN: shielded input amount must be equal to output amount.");
        return false;
      }
    }

    PrivateShieldedTRC20ParametersWithoutAsk.Builder builder =
        PrivateShieldedTRC20ParametersWithoutAsk.newBuilder();
    builder.setFromAmount(fromAmount.toString());
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    if (shieldedContractAddressBytes == null) {
      System.out.println("Invalid shieldedContractAddress.");
      return false;
    }
    builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(shieldedContractAddressBytes));

    if (!StringUtil.isNullOrEmpty(toAddress)) {
      byte[] to = WalletApi.decodeFromBase58Check(toAddress);
      if (to == null) {
        return false;
      }
      builder.setTransparentToAddress(ByteString.copyFrom(to));
      builder.setToAmount(toAmount.toString());
    }

    byte[] ask = new byte[32];
    long valueBalance = 0;
    if (!shieldedInputList.isEmpty()) {
      List<String> rootAndPath = new ArrayList<>();
      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        long position = noteInfo.getPosition();
        rootAndPath.add(getRootAndPath(shieldedContractAddress, position));
      }
      if (rootAndPath.isEmpty() || rootAndPath.size() != shieldedInputList.size()) {
        System.out.println("Can't get all merkle tree, please check the notes.");
        return false;
      }

      for(int i = 0; i < rootAndPath.size(); i++) {
        if (rootAndPath.get(i) == null) {
          System.out.println("Can't get merkle path, please check the note " + i + ".");
          return false;
        }
      }

      for (int i = 0; i < shieldedInputList.size(); i++) {
        ShieldedTRC20NoteInfo noteInfo = ShieldedTRC20Wrapper.getInstance().getUtxoMapNote()
            .get(shieldedInputList.get(i));
        if (i == 0) {
          String shieldAddress = noteInfo.getPaymentAddress();
          ShieldedAddressInfo addressInfo =
              ShieldedTRC20Wrapper.getInstance().getShieldedAddressInfoMap().get(shieldAddress);
          SpendingKey spendingKey = new SpendingKey(addressInfo.getSk());
          ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();

          System.arraycopy(expandedSpendingKey.getAsk(), 0, ask, 0, 32);
          builder.setAk(ByteString.copyFrom(
              ExpandedSpendingKey.getAkFromAsk(expandedSpendingKey.getAsk())));
          builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
          builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));
        }

        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(noteInfo.getPaymentAddress());
        noteBuild.setValue(noteInfo.getValue());
        noteBuild.setRcm(ByteString.copyFrom(noteInfo.getR()));
        noteBuild.setMemo(ByteString.copyFrom(noteInfo.getMemo()));

        System.out.println("address " + noteInfo.getPaymentAddress());
        System.out.println("value " + noteInfo.getRawValue().toString());
        System.out.println("rcm " + ByteArray.toHexString(noteInfo.getR()));
        System.out.println("trxId " + noteInfo.getTrxId());
        System.out.println("index " + noteInfo.getIndex());
        System.out.println("position " + noteInfo.getPosition());
        System.out.println("memo " + ZenUtils.getMemo(noteInfo.getMemo()));

        byte[] eachRootAndPath = ByteArray.fromHexString(rootAndPath.get(i));
        byte[] root = Arrays.copyOfRange(eachRootAndPath, 0, 32);
        byte[] path = Arrays.copyOfRange(eachRootAndPath, 32, 1056);
        SpendNoteTRC20.Builder spendTRC20NoteBuilder = SpendNoteTRC20.newBuilder();
        spendTRC20NoteBuilder.setNote(noteBuild.build());
        spendTRC20NoteBuilder.setAlpha(ByteString.copyFrom(getRcm()));
        spendTRC20NoteBuilder.setRoot(ByteString.copyFrom(root));
        spendTRC20NoteBuilder.setPath(ByteString.copyFrom(path));
        spendTRC20NoteBuilder.setPos(noteInfo.getPosition());

        builder.addShieldedSpends(spendTRC20NoteBuilder.build());
        valueBalance = Math.addExact(valueBalance, noteInfo.getValue());
      }
    } else {
      byte[] ovk = getRandomOvk();
      if (ovk != null) {
        builder.setOvk(ByteString.copyFrom(ovk));
      } else {
        System.out.println("Get random ovk from Rpc failure,please check config");
        return false;
      }
    }

    if (shieldedOutputList.size() > 0) {
      for (int i = 0; i < shieldedOutputList.size(); ++i) {
        GrpcAPI.Note note = shieldedOutputList.get(i);
        valueBalance = Math.subtractExact(valueBalance, note.getValue());
        builder.addShieldedReceives(
            ReceiveNote.newBuilder().setNote(note).build());
      }
    }

    if (shieldedContractType == 1 && valueBalance != 0) {
      System.out.println("TRANSFER: the sum of shielded input amount should be equal to the " +
          "sum of shielded output amount.");
      return false;
    }

    ShieldedTRC20Parameters parameters =
        WalletApi.createShieldedContractParametersWithoutAsk(builder.build(), ask);
    if (parameters == null) {
      System.out.println("CreateShieldedContractParametersWithoutAsk failed,"
          + " please check input data!");
      return false;
    }

    String inputData = parameters.getTriggerContractInput();
    if (inputData == null) {
      System.out.println("CreateShieldedContractParametersWithoutAsk failed, " +
          "please check input data!");
      return false;
    }
    if (shieldedContractType == 0) { //MINT
      boolean setAllowanceResult = setAllowance(contractAddress, shieldedContractAddress,
          fromAmount);
      if (!setAllowanceResult) {
        System.out.println("SetAllowance failed, please check wallet account!");
        return false;
      }
      boolean mintResult = triggerShieldedContract(shieldedContractAddress, inputData, 0);
      if (mintResult) {
        System.out.println("MINT succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract MINT " + failedHighlight() + "!!");
        return false;
      }
    } else if (shieldedContractType == 1) { //TRANSFER
      boolean transferResult = triggerShieldedContract(shieldedContractAddress, inputData, 1);
      if (transferResult) {
        System.out.println("TRANSFER succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract TRANSFER " + failedHighlight() + "!");
        return false;
      }
    } else if (shieldedContractType == 2) { //BURN
      boolean burnResult = triggerShieldedContract(shieldedContractAddress, inputData, 2);
      if (burnResult) {
        System.out.println("BURN succeed!");
        return true;
      } else {
        System.out.println("Trigger shielded contract BURN " + failedHighlight() + "!");
        return false;
      }
    } else {
      System.out.println("Error shieldedContractType!");
      return false;
    }
  }

  public String getRootAndPath(String address, long position) {
    byte[] shieldedContractAddress = WalletApi.decodeFromBase58Check(address);
    String methodStr = "getPath(uint256)";
    byte[] indexBytes = ByteArray.fromLong(position);
    String argsStr = ByteArray.toHexString(indexBytes);
    argsStr = "000000000000000000000000000000000000000000000000" + argsStr;
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, true));
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: getRootAndPath failed,  Please login wallet first !!");
      return null;
    }
    return wallet.constantCallShieldedContract(shieldedContractAddress, input, methodStr);
  }

  public String getScalingFactor(byte[] address) {
    String methodStr = "scalingFactor()";
    byte[] input = Hex.decode(AbiUtil.parseMethod(methodStr, "", false));
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: get Scaling Factor failed,  Please login wallet first !!");
      return null;
    }
    String scalingFactorHexStr = wallet.constantCallShieldedContract(address, input, methodStr);
    if (scalingFactorHexStr != null) {
      return scalingFactorHexStr;
    } else {
      System.out.println("Get Scaling Factor " + failedHighlight() + "!! Please check shielded contract!");
      return null;
    }
  }

  public boolean setAllowance(String contractAddress, String shieldedContractAddress,
      BigInteger value) throws CipherException, IOException, CancelException {
    byte[] contractAddressBytes = WalletApi.decodeFromBase58Check(contractAddress);
    byte[] shieldedContractAddressBytes = WalletApi.decodeFromBase58Check(shieldedContractAddress);
    String methodStr = "approve(address,uint256)";
    byte[] mergedBytes = ByteUtil.merge(new byte[11], shieldedContractAddressBytes,
        ByteUtil.bigIntegerToBytes(value, 32));
    String argsStr = ByteArray.toHexString(mergedBytes);
    byte[] inputData = Hex.decode(AbiUtil.parseMethod(methodStr, argsStr, true));
    byte[] ownerAddress = wallet.getAddress();

    return callContract(ownerAddress, contractAddressBytes, 0, inputData, 20_000_000L,
        0, "", false);
  }

  public boolean triggerShieldedContract(String contractAddress, String data,
                                         int shieldedContractType)
      throws CipherException, IOException, CancelException {
    byte[] contractAddressBytes = WalletApi.decodeFromBase58Check(contractAddress);
    String methodStr;
    if (shieldedContractType == 0) {
      methodStr = "mint(uint256,bytes32[9],bytes32[2],bytes32[21])";
    } else if (shieldedContractType == 1) {
      methodStr = "transfer(bytes32[10][],bytes32[2][],bytes32[9][],bytes32[2],bytes32[21][])";
    } else if (shieldedContractType == 2) {
      methodStr = "burn(bytes32[10],bytes32[2],uint256,bytes32[2],address,bytes32[3],bytes32[9][],bytes32[21][])";
    } else {
      System.out.println("unsupported shieldedContractType! ");
      return false;
    }
    byte[] inputData = Hex.decode(AbiUtil.parseMethod(methodStr, data, true));
    byte[] ownerAddress = wallet.getAddress();

    return callContract(ownerAddress, contractAddressBytes, 0, inputData, 200_000_000L,
        0, "", false);
  }

  public static Optional<TransactionInfoList> getTransactionInfoByBlockNum(long blockNum) {
    return WalletApi.getTransactionInfoByBlockNum(blockNum);
  }

  public boolean marketSellAsset(
      byte[] owner,
      byte[] sellTokenId,
      long sellTokenQuantity,
      byte[] buyTokenId,
      long buyTokenQuantity)
      throws CipherException, IOException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.marketSellAsset(owner, sellTokenId, sellTokenQuantity,
        buyTokenId, buyTokenQuantity);
  }

  public boolean marketCancelOrder(byte[] owner, byte[] orderId)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.marketCancelOrder(owner, orderId);
  }

  public boolean getLedgerUser( ) {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: getLedgerUser " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.isLedgerUser();
  }

  public Optional<MarketOrderList> getMarketOrderByAccount(byte[] address) {
    return WalletApi.getMarketOrderByAccount(address);
  }

  public Optional<MarketPriceList> getMarketPriceByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return WalletApi.getMarketPriceByPair(sellTokenId, buyTokenId);
  }


  public Optional<MarketOrderList> getMarketOrderListByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return WalletApi.getMarketOrderListByPair(sellTokenId, buyTokenId);
  }


  public Optional<MarketOrderPairList> getMarketPairList() {
    return WalletApi.getMarketPairList();
  }

  public Optional<MarketOrder> getMarketOrderById(byte[] order) {
    return WalletApi.getMarketOrderById(order);
  }

  public BlockExtention getBlock(String idOrNum, boolean detail) {
    return WalletApi.getBlock(idOrNum, detail);
  }

  public boolean lock () {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    if (!wallet.isLockAccount()) {
      throw new IllegalStateException("The account locking and unlocking functions are not available. Please configure " + greenBoldHighlight("lockAccount = true") + " in " + blueBoldHighlight("config.conf") + " and try again.");
    }
    wallet.lock();
    return true;
  }

  public boolean unlock(long durationSeconds) throws IOException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    if (!wallet.isLockAccount()) {
      throw new IllegalStateException("The account locking and unlocking functions are not available. Please configure " + greenBoldHighlight("lockAccount = true") + " in " + blueBoldHighlight("config.conf") + " and try again.");
    }
    System.out.println("Please input your password.");
    char[] password = inputPassword(false);
    byte[] passwd = char2Byte(password);
    try {
      wallet.checkPassword(passwd);
    } catch (CipherException e) {
      System.out.println("Password check " + failedHighlight() + "!");
      return false;
    }
    return wallet.unlock(passwd, durationSeconds);
  }

  public void cleanup () {
    if (wallet != null && wallet.isLoginState()) {
      wallet.cleanup();
    }
  }

  public boolean resetWallet() {
    String ownerAddress = EMPTY;
    List<String> walletPath;
    try {
      walletPath = WalletUtils.getStoreFileNames(ownerAddress, "Wallet");
    } catch (Exception e) {
      System.err.println("Error retrieving wallet file names: " + e.getMessage());
      return false;
    }
    List<String> filePaths = new ArrayList<>(walletPath);

    List<String> mnemonicPath = WalletUtils.getStoreFileNames(ownerAddress, "Mnemonic");
    if (mnemonicPath != null && !mnemonicPath.isEmpty()) {
      filePaths.addAll(mnemonicPath);
    }
    boolean deleteAll;
    try {
      deleteAll = ClearWalletUtils.confirmAndDeleteWallet(ownerAddress, filePaths);
    } catch (Exception e) {
      System.err.println("Error confirming and deleting wallet: " + e.getMessage());
      return false;
    }
    // remove about ledger
    if (deleteAll) {
      File ledgerDir = new File(LEDGER_DIR_NAME);
      if (ledgerDir.exists()) {
        try {
          FileUtils.cleanDirectory(ledgerDir);
        } catch (IOException e) {
          e.printStackTrace();
        }
      }
    }
    return deleteAll;
  }

  public boolean switchNetwork(String netWorkSymbol, String fulNode, String solidityNode)
      throws InterruptedException {
    if (StringUtils.isEmpty(netWorkSymbol) && StringUtils.isEmpty(fulNode) && StringUtils.isEmpty(solidityNode)) {
      System.out.println("Please select network：");
      NetType[] values = NetType.values();
      for (int i = 0; i < values.length; i++) {
        if (values[i] != CUSTOM) {
          System.out.println(i + 1 + ". " + values[i].name());
        }
      }
      System.out.print("Enter numbers to select a network (" + greenBoldHighlight("1-3") + "):");

      Scanner scanner = new Scanner(System.in);
      String choice = scanner.nextLine();

      switch (choice) {
        case "1":
          netWorkSymbol = "MAIN";
          break;
        case "2":
          netWorkSymbol = "NILE";
          break;
        case "3":
          netWorkSymbol = "SHASTA";
          break;
        default:
          System.out.println("Invalid selection!");
          return false;
      }
    }
    Pair<GrpcClient, NetType> pair = getGrpcClientAndNetType(netWorkSymbol, fulNode, solidityNode);
    WalletApi.updateRpcCli(pair.getLeft());
    WalletApi.setCurrentNetwork(pair.getRight());
    System.out.println("Now, current network is : " + blueBoldHighlight(WalletApi.getCurrentNetwork().toString()));
    return true;
  }

  private Pair<GrpcClient, NetType> getGrpcClientAndNetType(String netWorkSymbol, String fullNode,
    String solidityNode) {
    GrpcClient client;
    NetType currentNet;
    if (StringUtils.isEmpty(netWorkSymbol) &&
        (StringUtils.isNotEmpty(fullNode) || StringUtils.isNotEmpty(solidityNode))) {
      if (!isValid(fullNode, solidityNode)) {
        throw new IllegalArgumentException("host:port format is invalid.");
      }
      if (NILE.getGrpc().getFullNode().equals(fullNode) && NILE.getGrpc().getSolidityNode().equals(solidityNode)){
        currentNet = NILE;
        client = new GrpcClient(
            NILE.getGrpc().getFullNode(),
            NILE.getGrpc().getSolidityNode()
        );
      } else if (SHASTA.getGrpc().getFullNode().equals(fullNode) && SHASTA.getGrpc().getSolidityNode().equals(solidityNode)) {
        currentNet = SHASTA;
        client = new GrpcClient(
            SHASTA.getGrpc().getFullNode(),
            SHASTA.getGrpc().getSolidityNode()
        );
      } else if (MAIN.getGrpc().getFullNode().equals(fullNode) && MAIN.getGrpc().getSolidityNode().equals(solidityNode)) {
        currentNet = MAIN;
        client = new GrpcClient(
            MAIN.getGrpc().getFullNode(),
            MAIN.getGrpc().getSolidityNode()
        );
      } else {
        currentNet = CUSTOM;
        client = new GrpcClient(fullNode, solidityNode);
        WalletApi.setCustomNodes(Pair.of(fullNode, solidityNode));
      }
    } else {
      if (NILE.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new GrpcClient(
            NILE.getGrpc().getFullNode(),
            NILE.getGrpc().getSolidityNode()
        );
        currentNet = NILE;
      } else if (MAIN.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new GrpcClient(
            MAIN.getGrpc().getFullNode(),
            MAIN.getGrpc().getSolidityNode()
        );
        currentNet = MAIN;
      } else if (SHASTA.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new GrpcClient(
            SHASTA.getGrpc().getFullNode(),
            SHASTA.getGrpc().getSolidityNode()
        );
        currentNet = SHASTA;
      } else if ("LOCAL".equalsIgnoreCase(netWorkSymbol)) {
        Config config = Configuration.getByPath("config.conf");
        if (config.hasPath("fullnode.ip.list")) {
          List<String> fullNodeList = config.getStringList("fullnode.ip.list");
          if (!fullNodeList.isEmpty()) {
            fullNode = fullNodeList.get(0);
          }
        }
        if (config.hasPath("soliditynode.ip.list")) {
          List<String> solidityNodeList = config.getStringList("soliditynode.ip.list");
          if (!solidityNodeList.isEmpty()) {
            solidityNode = solidityNodeList.get(0);
          }
        }
        if (StringUtils.isEmpty(fullNode) && StringUtils.isEmpty(solidityNode)) {
          throw new IllegalArgumentException("The configuration of fullnode.ip.list or " +
              "soliditynode.ip.list in config. conf is incorrect.");
        }
        if (NILE.getGrpc().getFullNode().equals(fullNode) && NILE.getGrpc().getSolidityNode().equals(solidityNode)){
          currentNet = NILE;
          client = new GrpcClient(
              NILE.getGrpc().getFullNode(),
              NILE.getGrpc().getSolidityNode()
          );
        } else if (SHASTA.getGrpc().getFullNode().equals(fullNode) && SHASTA.getGrpc().getSolidityNode().equals(solidityNode)) {
          currentNet = SHASTA;
          client = new GrpcClient(
              SHASTA.getGrpc().getFullNode(),
              SHASTA.getGrpc().getSolidityNode()
          );
        } else if (MAIN.getGrpc().getFullNode().equals(fullNode) && MAIN.getGrpc().getSolidityNode().equals(solidityNode)) {
          currentNet = MAIN;
          client = new GrpcClient(
              MAIN.getGrpc().getFullNode(),
              MAIN.getGrpc().getSolidityNode()
          );
        } else {
          currentNet = CUSTOM;
          client = new GrpcClient(fullNode, solidityNode);
          WalletApi.setCustomNodes(Pair.of(fullNode, solidityNode));
        }
      } else {
        throw new IllegalArgumentException("The network symbol you entered cannot be recognized.");
      }
    }
    return Pair.of(client, currentNet);
  }

  public boolean getGasFreeInfo(String address) throws NoSuchAlgorithmException, IOException, InvalidKeyException, CipherException, CancelException {
    if (WalletApi.getCurrentNetwork() != MAIN && WalletApi.getCurrentNetwork() != NILE) {
      System.out.println(GAS_FREE_SUPPORT_NETWORK_TIP);
      return false;
    }
    if (StringUtils.isEmpty(address)) {
      address = getAddress();
      if (StringUtils.isEmpty(address)) {
        return false;
      }
    }
    if (!addressValid(address)) {
      System.out.println("The receiverAddress you entered is invalid.");
      return false;
    }
    String resp = GasFreeApi.address(WalletApi.getCurrentNetwork(), address);
    if (StringUtils.isEmpty(resp)) {
      return false;
    }
    JSONObject root = JSON.parseObject(resp);
    int respCode = root.getIntValue("code");
    JSONObject data = root.getJSONObject("data");
    if (HTTP_OK == respCode) {
      if (Objects.nonNull(data)) {
        String gasFreeAddress = data.getString("gasFreeAddress");
        boolean active = data.getBooleanValue("active");
        JSONArray assets = data.getJSONArray("assets");
        if (Objects.nonNull(assets)) {
          JSONObject asset = assets.getJSONObject(0);
          String tokenAddress = asset.getString("tokenAddress");
          // Query token balance based on gas free address
          byte[] d = Hex.decode(AbiUtil.parseMethod("balanceOf(address)",
              "\"" + gasFreeAddress + "\"", false));
          long activateFee = asset.getLongValue("activateFee");
          long transferFee = asset.getLongValue("transferFee");
          Long tokenBalance = wallet.triggerContract(null, decodeFromBase58Check(tokenAddress),
              0, d, 0, 0, EMPTY, true, true).getRight();
          GasFreeAddressResponse gasFreeAddressResponse = new GasFreeAddressResponse();
          gasFreeAddressResponse.setGasFreeAddress(gasFreeAddress);
          gasFreeAddressResponse.setActive(active);
          gasFreeAddressResponse.setActivateFee(active ? 0 : activateFee);
          gasFreeAddressResponse.setTransferFee(transferFee);
          gasFreeAddressResponse.setTokenBalance(tokenBalance);
          long maxTransferValue = tokenBalance - gasFreeAddressResponse.getActivateFee() - transferFee;
          gasFreeAddressResponse.setMaxTransferValue((maxTransferValue > 0 ? maxTransferValue : 0));
          System.out.println(JSON.toJSONString(gasFreeAddressResponse, true));
        }
        return true;
      } else {
        System.out.println("gas free address does not exist.");
        return false;
      }
    } else {
      System.out.println(root.getString("message"));
      return false;
    }
  }

  public boolean gasFreeTransfer(String receiver, long value) throws NoSuchAlgorithmException, IOException, InvalidKeyException, CipherException {
    if (WalletApi.getCurrentNetwork() != MAIN && WalletApi.getCurrentNetwork() != NILE) {
      System.out.println(GAS_FREE_SUPPORT_NETWORK_TIP);
      return false;
    }
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: GasFreeTransfer " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    if (!wallet.isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (!addressValid(receiver)) {
      System.out.println("The receiverAddress you entered is invalid.");
      return false;
    }
    String address = getAddress();
    GasFreeSubmitRequest gasFreeSubmitRequest = new GasFreeSubmitRequest();
    gasFreeSubmitRequest.setUser(address);
    gasFreeSubmitRequest.setReceiver(receiver);
    gasFreeSubmitRequest.setValue(value);
    gasFreeSubmitRequest.setVersion(1);
    NetType currentNet = WalletApi.getCurrentNetwork();
    byte[] domainSeparator = getDomainSeparator(currentNet);
    byte[] message = getMessage(currentNet, gasFreeSubmitRequest);
    // permitTransferMessageHash
    byte[] concat = concat(
        Numeric.hexStringToByteArray("0x1901"),
        domainSeparator,
        message
    );
    Credentials credentials = wallet.getCredentials();
    if (credentials == null) {
      System.out.println("Please input your password.");
      byte[] password = char2Byte(inputPassword(false));
      credentials = loadCredentials(password, wallet.getWalletFile());
    }
    String privateKey = Hex.toHexString(credentials.getPair().getPrivateKey());
    String signature = signOffChain(keccak256(concat), privateKey);
    gasFreeSubmitRequest.setSig(signature);
    boolean validated = validateSignOffChain(keccak256(concat), signature, address);
    if (validated) {
      String result = gasFreeSubmit(currentNet, gasFreeSubmitRequest);
      if (StringUtils.isNotEmpty(result)) {
        Object o = JSON.parse(result);
        System.out.println("GasFreeTransfer result: \n" + JSON.toJSONString(o, true));
        JSONObject root = (JSONObject) o;
        int respCode = root.getIntValue("code");
        return HTTP_OK == respCode;
      } else {
        return false;
      }
    } else {
      System.out.println("Signature verification failed!");
      return false;
    }
  }

  public boolean gasFreeTrace(String traceId) throws NoSuchAlgorithmException, IOException, InvalidKeyException {
    if (WalletApi.getCurrentNetwork() != MAIN && WalletApi.getCurrentNetwork() != NILE) {
      System.out.println(GAS_FREE_SUPPORT_NETWORK_TIP);
      return false;
    }
    String result = GasFreeApi.gasFreeTrace(WalletApi.getCurrentNetwork(), traceId);
    if (StringUtils.isNotEmpty(result)) {
      Object o = JSON.parse(result);
      System.out.println("GasFreeTrace result: \n" + JSON.toJSONString(o, true));
      JSONObject root = (JSONObject) o;
      int respCode = root.getIntValue("code");
      if (HTTP_OK == respCode) {
        if (Objects.isNull(root.get("data"))) {
          System.out.println("This id " + blueBoldHighlight(traceId) + " does not have a trace.");
          return false;
        }
        return true;
      } else {
        System.out.println(root.getString("message"));
        return false;
      }
    }
    return false;
  }
}
