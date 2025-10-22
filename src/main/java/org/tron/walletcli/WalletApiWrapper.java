package org.tron.walletcli;

import static com.google.common.collect.Lists.newArrayList;
import static java.net.HttpURLConnection.HTTP_OK;
import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.apache.commons.lang3.StringUtils.isEmpty;
import static org.tron.common.enums.NetType.CUSTOM;
import static org.tron.common.enums.NetType.MAIN;
import static org.tron.common.enums.NetType.NILE;
import static org.tron.common.enums.NetType.SHASTA;
import static org.tron.common.utils.Utils.LOCK_WARNING;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.common.utils.Utils.getNode;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.inputPassword;
import static org.tron.common.utils.Utils.isValid;
import static org.tron.common.utils.Utils.listWallets;
import static org.tron.common.utils.Utils.nameWallet;
import static org.tron.common.utils.Utils.redBoldHighlight;
import static org.tron.common.utils.Utils.searchWallets;
import static org.tron.common.utils.Utils.yellowBoldHighlight;
import static org.tron.core.manager.TxHistoryManager.DASH;
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
import static org.tron.keystore.Wallet.decrypt2PrivateBytes;
import static org.tron.keystore.Wallet.validPassword;
import static org.tron.keystore.WalletUtils.loadCredentials;
import static org.tron.keystore.WalletUtils.show;
import static org.tron.ledger.LedgerFileUtil.LEDGER_DIR_NAME;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.walletserver.WalletApi.addressValid;
import static org.tron.walletserver.WalletApi.decodeFromBase58Check;
import static org.tron.walletserver.WalletApi.encode58Check;
import static org.tron.walletserver.WalletApi.getAllWalletFile;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.ByteString;
import com.typesafe.config.Config;
import java.io.File;
import java.io.IOException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Objects;
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
import org.tron.common.enums.NetType;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.Utils;
import org.tron.core.dao.BackupRecord;
import org.tron.core.dao.Tx;
import org.tron.core.manager.BackupRecordManager;
import org.tron.core.viewer.AddressBookView;
import org.tron.core.viewer.BackupRecordsViewer;
import org.tron.core.viewer.TxHistoryViewer;
import org.tron.core.config.Configuration;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.manager.TxHistoryManager;
import org.tron.gasfree.GasFreeApi;
import org.tron.gasfree.request.GasFreeSubmitRequest;
import org.tron.gasfree.response.GasFreeAddressResponse;
import org.tron.keystore.ClearWalletUtils;
import org.tron.keystore.Credentials;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.ledger.LedgerAddressUtil;
import org.tron.ledger.LedgerFileUtil;
import org.tron.ledger.LedgerSignUtil;
import org.tron.ledger.console.ConsoleColor;
import org.tron.ledger.console.ImportAccount;
import org.tron.ledger.console.TronLedgerImportAccount;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.mnemonic.SubAccount;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;
import org.tron.walletserver.ApiClient;
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
    nameWallet(walletFile, false);
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
    nameWallet(walletFile, false);
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
      int retryCount = 0;
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
    System.out.println(ANSI_RED + "\nRisk Alert");
    System.out.println("\nYou are not advised to change the \"Path\" of a generated account address unless you are an advanced user.");
    System.out.println("\nPlease do not use the \"Custom Path\" feature if you do not understand how account addresses are generated or the definition of \"Path\", in case you lose access to the new account generated.");

    System.out.println("\nPlease Understand the Risks & Continue.\n" + ConsoleColor.ANSI_RESET);

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
      nameWallet(walletLedgerFile, true);
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
    try {
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
      if (StringUtils.isEmpty(walletFile.getName())) {
        walletFile.setName(file.getName());
      }
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
    try {
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
      listWallets(walletFileList);
      Scanner in = new Scanner(System.in);
      System.out.println("Please choose No. between " + greenBoldHighlight(1) + " and " + greenBoldHighlight(size)+ ", or enter " + greenBoldHighlight("search") + " to search wallets");
      while (true) {
        String input = in.nextLine().trim();
        if ("search".equalsIgnoreCase(input)) {
          System.out.println("Enter search term (Name or Address), or '" +
              greenBoldHighlight("Enter") + "' to end search");
          while (true) {
            String searchInput = in.nextLine().trim();
            if (searchInput.isEmpty()) {
              break;
            }
            searchWallets(walletFileList, searchInput);
            System.out.println("\nEnter another search term or '" +
                greenBoldHighlight("Enter") + "' to end search");
          }
          System.out.println("Please choose No. between " + greenBoldHighlight(1) +
              " and " + greenBoldHighlight(walletFileList.size()));
          continue;
        }
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

    try {
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
    wallet.setPwdForDeploy(passwd);
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
    byte[] decrypt = decrypt2PrivateBytes(passwdByte, walletLedgerFile);
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
  public byte[] backupWallet(String cmdName) throws IOException, CipherException {
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
    Pair<byte[], WalletFile> pair = wallet.getPair(passwd);
    clear(passwd);
    byte[] privateKey = pair.getLeft();
    WalletFile wf = pair.getRight();
    if (ArrayUtils.isNotEmpty(privateKey)) {
      new BackupRecordManager().saveRecord(new BackupRecord(
          cmdName,
          wf.getSourceFile().getName(),
          wf.getAddress(),
          LocalDateTime.now()));
    }
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
    byte[] exportMnemonic = MnemonicUtils.exportMnemonic(passwd, getAddress());
    if (ArrayUtils.isNotEmpty(exportMnemonic)) {
      new BackupRecordManager().saveRecord(new BackupRecord(
          "exportWalletMnemonic",
          wallet.getWalletFile().getSourceFile().getName(),
          encode58Check(wallet.getAddress()),
          LocalDateTime.now()));
    }
    return exportMnemonic;
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

    String exportKeystore = wallet.exportKeystore(walletChannel, exportFullDir);
    if (exportKeystore != null) {
      new BackupRecordManager().saveRecord(new BackupRecord(
          "exportWalletKeystore",
          wallet.getWalletFile().getSourceFile().getName(),
          encode58Check(wallet.getAddress()),
          LocalDateTime.now()));
    }
    return exportKeystore;
  }

  public String importWalletByKeystore(byte[] passwdByte, File importFile)
      throws IOException {
    WalletFile walletFile = WalletUtils.loadWalletFile(importFile);

    byte[] priKey = null;
    try {
      priKey = decrypt2PrivateBytes(passwdByte, walletFile);
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

  public Response.Account queryAccount() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: QueryAccount " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    return wallet.queryAccount();
  }

  public Response.Account queryAccount(byte[] address) {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: QueryAccount " + failedHighlight() + ",  Please login first !!");
      return null;
    }

    return wallet.queryAccount();
  }

  public boolean sendCoin(byte[] ownerAddress, byte[] toAddress, long amount)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: SendCoin " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.sendCoin(ownerAddress, toAddress, amount);
  }

  public boolean transferAsset(byte[] ownerAddress, byte[] toAddress, String assertName,
                               long amount)
      throws IOException, CipherException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: TransferAsset " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.transferAsset(ownerAddress, toAddress, assertName.getBytes(), amount);
  }

  public boolean participateAssetIssue(byte[] ownerAddress, byte[] toAddress, String assertName,
                                       long amount) throws CipherException, IOException, CancelException, IllegalException {
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
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: assetIssue " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    if (ownerAddress == null) {
      ownerAddress = wallet.getAddress();
    }
    if (totalSupply <= 0) {
      System.out.println("totalSupply should greater than 0. but really is " + totalSupply);
      return false;
    }
    if (trxNum <= 0) {
      System.out.println("trxNum should greater than 0. but really is " + trxNum);
      return false;
    }
    if (icoNum <= 0) {
      System.out.println("num should greater than 0. but really is " + icoNum);
      return false;
    }
    if (precision < 0) {
      System.out.println("precision should greater or equal to 0. but really is " + precision);
      return false;
    }
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
    return wallet.createAssetIssue(ownerAddress, name, abbrName, totalSupply,
        trxNum, icoNum, precision, startTime, endTime, 0,
        description, url, freeNetLimit, publicFreeNetLimit, frozenSupply);
  }

  public boolean createAccount(byte[] ownerAddress, byte[] address)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createAccount " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.createAccount(ownerAddress, address);
  }


  public boolean createWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.createWitness(ownerAddress, url.getBytes());
  }

  public boolean updateWitness(byte[] ownerAddress, String url)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.updateWitness(ownerAddress, url.getBytes());
  }

  public Chain.Block getBlock(long blockNum) throws IllegalException {
    return WalletApi.getBlock(blockNum);
  }

  public long getTransactionCountByBlockNum(long blockNum) {
    return WalletApi.getTransactionCountByBlockNum(blockNum);
  }

  public Response.BlockExtention getBlock2(long blockNum) throws IllegalException {
    return WalletApi.getBlock2(blockNum);
  }

  public boolean voteWitness(byte[] ownerAddress, HashMap<String, String> witness)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: VoteWitness " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.voteWitness(ownerAddress, witness);
  }

  public Response.WitnessList listWitnesses() {
    try {
      return WalletApi.listWitnesses();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.AssetIssueList getAssetIssueList() {
    try {
      return WalletApi.getAssetIssueList();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.AssetIssueList getPaginatedAssetIssueList(long offset, long limit) {
    try {
      return WalletApi.getPaginatedAssetIssueList(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Contract.AssetIssueContract getAssetIssueByName(String assetName) {
    try {
      return WalletApi.getAssetIssueByName(assetName);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.AssetIssueList getAssetIssueListByName(String assetName) {
    try {
      return WalletApi.getAssetIssueListByName(assetName);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Contract.AssetIssueContract getAssetIssueById(String assetId) {
    try {
      return WalletApi.getAssetIssueById(assetId);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.ProposalList getProposalListPaginated(long offset, long limit) {
    try {
      return WalletApi.getProposalListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.ExchangeList getExchangeListPaginated(long offset, long limit) {
    try {
      return WalletApi.getExchangeListPaginated(offset, limit);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.NodeList listNodes() {
    try {
      return WalletApi.listNodes();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public long getNextMaintenanceTime() {
    return WalletApi.getNextMaintenanceTime();
  }

  public boolean updateAccount(byte[] ownerAddress, byte[] accountNameBytes)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAccount " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.updateAccount(ownerAddress, accountNameBytes);
  }

  public boolean setAccountId(byte[] ownerAddress, byte[] accountIdBytes)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: setAccount " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.setAccountId(ownerAddress, accountIdBytes);
  }


  public boolean updateAsset(byte[] ownerAddress, byte[] description, byte[] url, long newLimit,
                             long newPublicLimit) throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateAsset " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.updateAsset(ownerAddress, description, url, newLimit, newPublicLimit);
  }

  public boolean freezeBalance(byte[] ownerAddress, long frozen_balance, long frozen_duration,
                               int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.freezeBalance(ownerAddress, frozen_balance, frozen_duration, resourceCode,
        receiverAddress);
  }

  public boolean freezeBalanceV2(byte[] ownerAddress, long frozenBalance,
                                 int resourceCode)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: freezeBalanceV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }
    return wallet.freezeBalanceV2(ownerAddress, frozenBalance, resourceCode);
  }

  public boolean unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeBalance(ownerAddress, resourceCode, receiverAddress);
  }

  public boolean unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance
      , int resourceCode)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeBalanceV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeBalanceV2(ownerAddress, unfreezeBalance, resourceCode);
  }

  public boolean withdrawExpireUnfreeze(byte[] ownerAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawExpireUnfreeze " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.withdrawExpireUnfreeze(ownerAddress);
  }

  public boolean delegateresource(byte[] ownerAddress, long balance
      , int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: delegateresource " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.delegateResource(ownerAddress, balance
        , resourceCode, receiverAddress, lock, lockPeriod);
  }

  public boolean undelegateresource(byte[] ownerAddress, long balance
      , int resourceCode, byte[] receiverAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: undelegateresource " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unDelegateResource(ownerAddress, balance, resourceCode, receiverAddress);
  }

  public boolean cancelAllUnfreezeV2()
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: cancelAllUnfreezeV2 " + failedHighlight() + ", Please login first !!");
      return false;
    }
    return wallet.cancelAllUnfreezeV2();
  }

  public boolean unfreezeAsset(byte[] ownerAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: unfreezeAsset " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.unfreezeAsset(ownerAddress);
  }

  public boolean withdrawBalance(byte[] ownerAddress)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: withdrawBalance " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.withdrawBalance(ownerAddress);
  }

  public boolean createProposal(byte[] ownerAddress, HashMap<Long, Long> parametersMap)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: createProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.createProposal(ownerAddress, parametersMap);
  }


  public Response.ProposalList getProposalsList() {
    try {
      return WalletApi.listProposals();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.Proposal getProposal(String id) {
    try {
      return WalletApi.getProposal(id);
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.ExchangeList getExchangeList() {
    try {
      return WalletApi.listExchanges();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public Response.Exchange getExchange(String id) {
    try {
      return WalletApi.getExchange(id);
    } catch (IllegalException e) {
      return Response.Exchange.getDefaultInstance();
    }
  }

  public Response.ChainParameters getChainParameters() {
    try {
      return WalletApi.getChainParameters();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }


  public boolean approveProposal(byte[] ownerAddress, long id, boolean is_add_approval)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: approveProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.approveProposal(ownerAddress, id, is_add_approval);
  }

  public boolean deleteProposal(byte[] ownerAddress, long id)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: deleteProposal " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.deleteProposal(ownerAddress, id);
  }

  public boolean exchangeCreate(byte[] ownerAddress, byte[] firstTokenId, long firstTokenBalance,
                                byte[] secondTokenId, long secondTokenBalance)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeCreate " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeCreate(ownerAddress, firstTokenId, firstTokenBalance,
        secondTokenId, secondTokenBalance);
  }

  public boolean exchangeInject(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeInject " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeInject(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeWithdraw(byte[] ownerAddress, long exchangeId, byte[] tokenId, long quant)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeWithdraw " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeWithdraw(ownerAddress, exchangeId, tokenId, quant);
  }

  public boolean exchangeTransaction(byte[] ownerAddress, long exchangeId, byte[] tokenId,
                                     long quant, long expected)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: exchangeTransaction " + failedHighlight() + ", Please login first !!");
      return false;
    }

    return wallet.exchangeTransaction(ownerAddress, exchangeId, tokenId, quant, expected);
  }

  public boolean updateSetting(byte[] ownerAddress, byte[] contractAddress,
                               long consumeUserResourcePercent)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.updateSetting(ownerAddress, contractAddress, consumeUserResourcePercent);

  }

  public boolean updateEnergyLimit(byte[] ownerAddress, byte[] contractAddress,
                                   long originEnergyLimit)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet.updateEnergyLimit(ownerAddress, contractAddress, originEnergyLimit);
  }

  public boolean clearContractABI(byte[] ownerAddress, byte[] contractAddress)
      throws CipherException, IOException, CancelException, IllegalException {
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
    boolean clearWalletKeystoreRet = wallet.clearWalletKeystore();
    if (clearWalletKeystoreRet) {
      logout();
    }
    return clearWalletKeystoreRet;
  }


  public boolean deployContract(byte[] ownerAddress, String name, String abiStr, String codeStr,
                                long feeLimit, long value, long consumeUserResourcePercent, long originEnergyLimit,
                                long tokenValue, String tokenId, String libraryAddressPair, String compilerVersion)
      throws Exception {
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
      throws Exception {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: callContract " + failedHighlight() + ",  Please login first !!");
      return false;
    }

    return wallet
        .triggerContract(ownerAddress, contractAddress, callValue, data, feeLimit, tokenValue,
            tokenId,
            isConstant, false).getLeft();
  }

  public Pair<Boolean, Long> getUsdtBalance(byte[] ownerAddress)
      throws Exception {
    if (wallet == null || !wallet.isLoginState()) {
      // Reference Gasfree balance, login is required to query, as historical methods are reused
      System.out.println("Warning: getUsdtBalance " + failedHighlight() + ",  Please login first !!");
      return Pair.of(false, 0L);
    }
    if (ArrayUtils.isEmpty(ownerAddress)) {
      ownerAddress = wallet.getAddress();
    }
    byte[] d = Hex.decode(AbiUtil.parseMethod("balanceOf(address)",
        "\"" + encode58Check(ownerAddress) + "\"", false));
    NetType netType = WalletApi.getCurrentNetwork();
    byte[] contractAddress = WalletApi.decodeFromBase58Check(netType.getUsdtAddress());
    return wallet.triggerContract(ownerAddress, contractAddress,
        0, d, 0, 0, EMPTY, true, false);
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
      throws IOException, CipherException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: accountPermissionUpdate " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.accountPermissionUpdate(ownerAddress, permission);
  }


  public Chain.Transaction addTransactionSign(Chain.Transaction transaction)
      throws IOException, CipherException, CancelException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: addTransactionSign " + failedHighlight() + ",  Please login first !!");
      return null;
    }
    return wallet.addTransactionSign(transaction);
  }

  public boolean updateBrokerage(byte[] ownerAddress, int brokerage)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.updateBrokerage(ownerAddress, brokerage);
  }

  public org.tron.trident.api.GrpcAPI.NumberMessage getReward(byte[] ownerAddress) {
    return WalletApi.getReward(ownerAddress);
  }

  public long getBrokerage(byte[] ownerAddress) {
    return WalletApi.getBrokerage(ownerAddress);
  }

  public Response.PricesResponseMessage getBandwidthPrices() {
    return WalletApi.getBandwidthPrices();
  }

  public Response.PricesResponseMessage getEnergyPrices() {
    return WalletApi.getEnergyPrices();
  }

  public Response.PricesResponseMessage getMemoFee() {
    return WalletApi.getMemoFee();
  }

  public static Response.TransactionInfoList getTransactionInfoByBlockNum(long blockNum) {
    try {
      return WalletApi.getTransactionInfoByBlockNum(blockNum);
    } catch (Exception e) {
      return null;
    }
  }

  public boolean marketSellAsset(
      byte[] owner,
      byte[] sellTokenId,
      long sellTokenQuantity,
      byte[] buyTokenId,
      long buyTokenQuantity)
      throws CipherException, IOException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.marketSellAsset(owner, sellTokenId, sellTokenQuantity,
        buyTokenId, buyTokenQuantity);
  }

  public boolean marketCancelOrder(byte[] owner, byte[] orderId)
      throws IOException, CipherException, CancelException, IllegalException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.marketCancelOrder(owner, orderId);
  }

  public boolean getLedgerUser() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: getLedgerUser " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.isLedgerUser();
  }

  public Response.MarketOrderList getMarketOrderByAccount(byte[] address) {
    try {
      return WalletApi.getMarketOrderByAccount(address);
    } catch (Exception e) {
      return null;
    }
  }

  public Response.MarketPriceList getMarketPriceByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    try {
      return WalletApi.getMarketPriceByPair(sellTokenId, buyTokenId);
    } catch (Exception e) {
      return null;
    }
  }


  public Response.MarketOrderList getMarketOrderListByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    try {
      return WalletApi.getMarketOrderListByPair(sellTokenId, buyTokenId);
    } catch (Exception e) {
      return null;
    }
  }


  public Response.MarketOrderPairList getMarketPairList() {
    try {
      return WalletApi.getMarketPairList();
    } catch (Exception e) {
      return null;
    }
  }

  public Response.MarketOrder getMarketOrderById(byte[] order) {
    try {
      return WalletApi.getMarketOrderById(order);
    } catch (Exception e) {
      return null;
    }
  }

  public Response.BlockExtention getBlock(String idOrNum, boolean detail) {
    try {
      return WalletApi.getBlock(idOrNum, detail);
    } catch (Exception e) {
      return null;
    }
  }

  public boolean lock() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: updateSetting " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    if (!WalletApi.isLockAccount()) {
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
    if (!WalletApi.isLockAccount()) {
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

  public void cleanup() {
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

  public boolean switchNetwork(String netWorkSymbol, String fulNode, String solidityNode) {
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

      try {
        int i = Integer.parseInt(choice);
        if (i > NetType.values().length - 1) {
          System.out.println("Invalid selection!");
          return false;
        }
        netWorkSymbol = NetType.values()[i - 1].name();
      } catch (NumberFormatException e) {
        System.out.println("Invalid input!");
        return false;
      }

    }
    Pair<ApiClient, NetType> pair = getApiClientAndNetType(netWorkSymbol, fulNode, solidityNode);
    WalletApi.updateRpcCli(pair.getLeft());
    WalletApi.setCurrentNetwork(pair.getRight());
    System.out.println("Now, current network is : " + blueBoldHighlight(WalletApi.getCurrentNetwork().toString()));
    return true;
  }

  private Pair<ApiClient, NetType> getApiClientAndNetType(String netWorkSymbol, String fullNode,
                                                          String solidityNode) {
    ApiClient client;
    NetType currentNet;
    if (StringUtils.isEmpty(netWorkSymbol) &&
        (StringUtils.isNotEmpty(fullNode) || StringUtils.isNotEmpty(solidityNode))) {
      if (!isValid(fullNode, solidityNode)) {
        throw new IllegalArgumentException("host:port format is invalid.");
      }
      boolean isFullnodeEmpty = false;
      boolean isSoliditynodeEmpty = false;
      if (isEmpty(fullNode) && !isEmpty(solidityNode)) {
        fullNode = solidityNode;
        isFullnodeEmpty = true;
        System.out.println(yellowBoldHighlight("If only soliditynode.ip.list is configured, transactions and other operations will not be available."));
      } else if (!isEmpty(fullNode) && isEmpty(solidityNode)) {
        solidityNode = fullNode;
        isSoliditynodeEmpty = true;
      }
      if (NILE.getGrpc().getFullNode().equals(fullNode) && NILE.getGrpc().getSolidityNode().equals(solidityNode)) {
        currentNet = NILE;
        client = new ApiClient(
            NILE.getGrpc().getFullNode(),
            NILE.getGrpc().getSolidityNode()
        );
      } else if (SHASTA.getGrpc().getFullNode().equals(fullNode) && SHASTA.getGrpc().getSolidityNode().equals(solidityNode)) {
        currentNet = SHASTA;
        client = new ApiClient(
            SHASTA.getGrpc().getFullNode(),
            SHASTA.getGrpc().getSolidityNode()
        );
      } else if (MAIN.getGrpc().getFullNode().equals(fullNode) && MAIN.getGrpc().getSolidityNode().equals(solidityNode)) {
        currentNet = MAIN;
        client = new ApiClient(
            MAIN.getGrpc().getFullNode(),
            MAIN.getGrpc().getSolidityNode()
        );
      } else {
        currentNet = CUSTOM;
        client = new ApiClient(fullNode, solidityNode, isFullnodeEmpty, isSoliditynodeEmpty);
        WalletApi.setCustomNodes(Pair.of(Pair.of(fullNode, isFullnodeEmpty), Pair.of(solidityNode, isSoliditynodeEmpty)));
      }
    } else {
      if (NILE.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new ApiClient(NILE);
        currentNet = NILE;
      } else if (MAIN.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new ApiClient(MAIN);
        currentNet = MAIN;
      } else if (SHASTA.name().equalsIgnoreCase(netWorkSymbol)) {
        client = new ApiClient(SHASTA);
        currentNet = SHASTA;
      } else if ("LOCAL".equalsIgnoreCase(netWorkSymbol)) {
        Config config = Configuration.getByPath("config.conf");
        fullNode = getNode(config, "fullnode.ip.list");
        solidityNode = getNode(config, "soliditynode.ip.list");
        if (isEmpty(fullNode) && isEmpty(solidityNode)) {
          throw new IllegalArgumentException(redBoldHighlight("fullnode.ip.lit") + " and " + redBoldHighlight("fullnode.ip.lit") + " cannot both be empty in config.conf.");
        }
        boolean isFullnodeEmpty = false;
        boolean isSoliditynodeEmpty = false;
        if (isEmpty(fullNode) && !isEmpty(solidityNode)) {
          fullNode = solidityNode;
          isFullnodeEmpty = true;
          System.out.println(yellowBoldHighlight("If only soliditynode.ip.list is configured, transactions and other operations will not be available."));
        } else if (!isEmpty(fullNode) && isEmpty(solidityNode)) {
          solidityNode = fullNode;
          isSoliditynodeEmpty = true;
        }
        if (NILE.getGrpc().getFullNode().equals(fullNode) && NILE.getGrpc().getSolidityNode().equals(solidityNode)) {
          currentNet = NILE;
          client = new ApiClient(
              NILE.getGrpc().getFullNode(),
              NILE.getGrpc().getSolidityNode()
          );
        } else if (SHASTA.getGrpc().getFullNode().equals(fullNode) && SHASTA.getGrpc().getSolidityNode().equals(solidityNode)) {
          currentNet = SHASTA;
          client = new ApiClient(
              SHASTA.getGrpc().getFullNode(),
              SHASTA.getGrpc().getSolidityNode()
          );
        } else if (MAIN.getGrpc().getFullNode().equals(fullNode) && MAIN.getGrpc().getSolidityNode().equals(solidityNode)) {
          currentNet = MAIN;
          client = new ApiClient(
              MAIN.getGrpc().getFullNode(),
              MAIN.getGrpc().getSolidityNode()
          );
        } else {
          currentNet = CUSTOM;
          client = new ApiClient(fullNode, solidityNode, isFullnodeEmpty, isSoliditynodeEmpty);
          WalletApi.setCustomNodes(Pair.of(Pair.of(fullNode, isFullnodeEmpty), Pair.of(solidityNode, isSoliditynodeEmpty)));
        }
      } else {
        throw new IllegalArgumentException("The network symbol you entered cannot be recognized.");
      }
    }
    return Pair.of(client, currentNet);
  }

  public boolean getGasFreeInfo(String address) throws Exception {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: getGasFreeInfo " + failedHighlight() + ",  Please login first !!");
      return false;
    }
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
      System.out.println("The address you entered is invalid.");
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
          Pair<Boolean, Long> triggerContractPair = wallet.triggerContract(null, decodeFromBase58Check(tokenAddress),
              0, d, 0, 0, EMPTY, true, true);
          if (Boolean.FALSE.equals(triggerContractPair.getLeft())) {
            return false;
          }
          Long tokenBalance = triggerContractPair.getRight();
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
    if (ArrayUtils.isEmpty(message)) {
      return false;
    }
    // permitTransferMessageHash
    byte[] concat = concat(
        Numeric.hexStringToByteArray("0x1901"),
        domainSeparator,
        message
    );

    WalletFile wf = wallet.getWalletFile();
    byte[] passwd;
    if (WalletApi.isLockAccount() && isUnifiedExist() && Arrays.equals(decodeFromBase58Check(wf.getAddress()), wallet.getAddress())) {
      passwd = wallet.getUnifiedPassword();
    } else {
      System.out.println("Please input your password.");
      passwd = char2Byte(inputPassword(false));
    }

    Credentials credentials = wallet.getCredentials();
    if (credentials == null) {
      credentials = loadCredentials(passwd, wf);
    }

    String privateKey = Hex.toHexString(credentials.getPair().getPrivateKey());
    String ledgerPath = getLedgerPath(passwd, wf);
    boolean isLedgerFile = wf.getName().contains("Ledger");
    String signature = null;
    if (isLedgerFile) {
      Chain.Transaction transaction = Chain.Transaction.newBuilder().setRawData(Chain.Transaction.raw.newBuilder().setData(ByteString.copyFrom(keccak256(concat)))).build();
      boolean ledgerResult = LedgerSignUtil.requestLedgerSignLogic(transaction, ledgerPath, wf.getAddress(), true);
      if (ledgerResult) {
        signature = TransactionSignManager.getInstance().getGasfreeSignature();
      }
      if (Objects.isNull(signature)) {
        System.out.println("Listening ledger did not obtain signature.");
        TransactionSignManager.getInstance().setTransaction(null);
        TransactionSignManager.getInstance().setGasfreeSignature(null);
        return false;
      }
      TransactionSignManager.getInstance().setTransaction(null);
      TransactionSignManager.getInstance().setGasfreeSignature(null);
    } else {
      signature = signOffChain(keccak256(concat), privateKey);
    }
    gasFreeSubmitRequest.setSig(signature);
    boolean validated = validateSignOffChain(keccak256(concat), signature, address);
    if (validated) {
      String result = gasFreeSubmit(currentNet, gasFreeSubmitRequest);
      if (StringUtils.isNotEmpty(result)) {
        Object o = JSON.parse(result);
        System.out.println("GasFreeTransfer result: \n" + JSON.toJSONString(o, true));
        JSONObject root = (JSONObject) o;
        int respCode = root.getIntValue("code");
        boolean success = HTTP_OK == respCode;
        if (success) {
          TxHistoryManager txHistoryManager = new TxHistoryManager(encode58Check(wallet.getAddress()));
          JSONObject data = root.getJSONObject("data");
          String id = data != null ? data.getString("id") : DASH;
          Tx tx = new Tx();
          tx.setId(id);
          tx.setType("GasFreeTransfer");
          tx.setFrom(encode58Check(wallet.getAddress()));
          tx.setTo(receiver);
          tx.setAmount(String.valueOf(value));
          tx.setTimestamp(LocalDateTime.now());
          tx.setStatus("success");
          txHistoryManager.addTransaction(WalletApi.getCurrentNetwork(), tx);
        }
        return success;
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

  public boolean modifyWalletName(String newName) throws IOException {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: modifyWalletName " + failedHighlight() + ",  Please login first !!");
      return false;
    }
    return wallet.modifyWalletName(newName);
  }

  public void viewTransactionHistory() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: viewTransactionHistory " + failedHighlight() + ",  Please login first !!");
      return;
    }
    TxHistoryManager manager = new TxHistoryManager(encode58Check(wallet.getAddress()));
    TxHistoryViewer viewer = new TxHistoryViewer(manager);
    NetType netType = WalletApi.getCurrentNetwork();
    viewer.startInteractiveViewer(netType, WalletApi.getCustomNodes().getLeft().getLeft());
  }

  public void viewBackupRecords() {
    if (wallet == null || !wallet.isLoginState()) {
      System.out.println("Warning: viewBackupRecords " + failedHighlight() + ",  Please login first !!");
      return;
    }
    BackupRecordsViewer recordsViewer = new BackupRecordsViewer();
    recordsViewer.viewBackupRecords();
  }

  public void addressBook() {
    AddressBookView addressBookView = new AddressBookView();
    addressBookView.viewAddressBook();
  }
}
