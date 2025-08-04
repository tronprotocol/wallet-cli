package org.tron.mnemonic;

import static org.apache.commons.lang3.StringUtils.isNumeric;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.nameWallet;
import static org.tron.common.utils.Utils.successfulHighlight;
import static org.tron.common.utils.Utils.yellowBoldHighlight;
import static org.tron.ledger.console.ConsoleColor.ANSI_BOLD;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

import com.typesafe.config.Config;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Scanner;
import lombok.Builder;
import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.StringUtils;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.jline.utils.AttributedStringBuilder;
import org.jline.utils.AttributedStyle;
import org.jline.utils.InfoCmp;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.sm2.SM2;
import org.tron.core.config.Configuration;
import org.tron.core.exception.CipherException;
import org.tron.keystore.WalletFile;
import org.tron.walletserver.WalletApi;

public class SubAccount {
  private final Terminal terminal;
  private final LineReader reader;
  private final List<WalletAddress> addresses;
  private final int pageSize = 10;
  private int currentPage = 0;
  private final int totalPages;
  private String mnemonic;
  private byte[] password;
  private static boolean isEckey = true;

  private static final String PATH_PREFIX = "m/44'/195'/";
  private static final String PATH_MIDDLE = "'/0/";
  @Getter
  @Setter
  private int type; // 0:subAccount, 1:importWalletByMnemonic

  @Data
  @Builder
  private static class WalletAddress {
    private final int pathIndex;
    private final String address;
    private final byte[] privateKey;
    private boolean generated;

    public String getDisplayString() {
      String path = MnemonicUtils.formatPathIndex2Path(pathIndex);
      return String.format("%-42s %-25s %s",
          address,
          path,
          generated ? "✓" : "×");
    }

    public String getDetailString() {
      String path = MnemonicUtils.formatPathIndex2Path(pathIndex);
      return String.format("Address: %s Path: %s Status: %s",
          address,
          path,
          generated ? "Generated" : "Not Generated");
    }
  }

  public SubAccount(byte[] password, String mnemonic, int type) throws Exception {
    Config config = Configuration.getByPath("config.conf");
    if (config.hasPath("crypto.engine")) {
      isEckey = config.getString("crypto.engine").equalsIgnoreCase("eckey");
    }
    this.mnemonic = mnemonic;
    this.password = password;
    this.type = type;
    this.terminal = TerminalBuilder.builder()
        .system(true)
        .dumb(true)
        .build();
    this.reader = LineReaderBuilder.builder()
        .terminal(terminal)
        .build();
    this.addresses = initializeAddresses();
    this.totalPages = (addresses.size() + pageSize - 1) / pageSize;
    generateAddresses(mnemonic);
  }

  private List<WalletAddress> initializeAddresses() {
    List<WalletAddress> result = new ArrayList<>();
    for (int i = 0; i <= 99; i++) {
      //String path = String.format("m/44'/195'/0'/0/%d", i);
      result.add(WalletAddress.builder()
          .pathIndex(i)
          .address("")
          .privateKey("".getBytes())
          .generated(false)
          .build());
    }
    return result;
  }

  private void generateAddresses(String mnemonic) {
    for (int i = 0; i <= 99; i++) {
      try {
        WalletAddress newAddress = generateWalletAddress(mnemonic, addresses.get(i).getPathIndex());
        if (newAddress == null) {
          break;
        }
        newAddress.setGenerated(MnemonicUtils.generatedAddress(newAddress.getAddress()));
        addresses.set(i, newAddress);
      } catch (Exception e) {
        System.out.println(e.getMessage());
      }
    }
  }

  private WalletAddress generateWalletAddress(String mnemonic, int pathIndex) {
    try {
      List<String> words = MnemonicUtils.stringToMnemonicWords(mnemonic);
      byte[] privateKey = MnemonicUtils.getPrivateKeyFromMnemonicByPath(words, pathIndex);
      String address = "";
      if (isEckey) {
        ECKey ecKey = ECKey.fromPrivate(privateKey);
        address = WalletApi.encode58Check(ecKey.getAddress());
      } else {
        SM2 sm2 = SM2.fromPrivate(privateKey);
        address = WalletApi.encode58Check(sm2.getAddress());
      }
      return WalletAddress.builder()
          .pathIndex(pathIndex)
          .address(address)
          .privateKey(privateKey)
          .generated(false)
          .build();
    } catch (Exception e) {
      System.out.println(e.getMessage());
      return null;
    }
  }

  private WalletAddress generateWalletAddressByCustomPath(String mnemonic, String pathFull) {
    try {
      List<String> words = MnemonicUtils.stringToMnemonicWords(mnemonic);
      byte[] privateKey = MnemonicUtils.getPrivateKeyFromMnemonicByCustomPath(words, pathFull);
      String address = "";
      if (isEckey) {
        ECKey ecKey = ECKey.fromPrivate(privateKey);
        address = WalletApi.encode58Check(ecKey.getAddress());
      } else {
        SM2 sm2 = SM2.fromPrivate(privateKey);
        address = WalletApi.encode58Check(sm2.getAddress());
      }

      return WalletAddress.builder()
          .pathIndex(-1)
          .address(address)
          .privateKey(privateKey)
          .generated(true)
          .build();
    } catch (Exception e) {
      System.out.println("Generate wallet address failed: " + e.getMessage());
      return null;
    }
  }

  private void printProgress(String message) {
    terminal.writer().print("\r" + message);
    terminal.writer().flush();
  }

  private void clearScreen() {
    terminal.puts(InfoCmp.Capability.clear_screen);
    terminal.flush();
  }

  private void displayCurrentPage() {
    clearScreen();
    AttributedStringBuilder asb = new AttributedStringBuilder();
    asb.append("\n\n=== Address List - Page ")
        .append(String.valueOf(currentPage + 1))
        .append(" of ")
        .append(String.valueOf(totalPages))
        .append(" ===\n\n");

    asb.append(String.format("%-4s %-42s %-25s %s%n",
        greenBoldHighlight("No."), greenBoldHighlight("Address"),
        greenBoldHighlight("Path"), greenBoldHighlight("Status")));
    asb.append(StringUtils.repeat("-", 80)).append("\n");

    int start = currentPage * pageSize;
    int end = Math.min(start + pageSize, addresses.size());

    for (int i = start; i < end; i++) {
      asb.append(String.format("%-4d %s%n",
          i + 1,
          addresses.get(i).getDisplayString()));
    }
    asb.append("Commands: [").append(greenBoldHighlight("P")).append("] Previous page ")
        .append("[").append(greenBoldHighlight("N")).append("] Next page ").append("[")
        .append(greenBoldHighlight((start + 1) + "-" + end)).append("] Select address index ")
        .append("[").append(greenBoldHighlight("Q")).append("] Quit\n");
    asb.append("Enter your choice: ");

    terminal.writer().print(asb.toAnsi());
    terminal.flush();
  }

  private boolean handleSelectAddress(int selectedIndex, WalletApi wallet) throws Exception {
    int start = currentPage * pageSize;
    int end = Math.min(start + pageSize, addresses.size());
    try {
      int index = selectedIndex - 1;
      if (index >= start && index < end) {
        WalletAddress selected = addresses.get(index);
        if (!selected.isGenerated()) {
          WalletFile walletFile = WalletApi.CreateWalletFile(password
              , selected.privateKey
              , MnemonicUtils.stringToMnemonicWords(mnemonic)
          );
          nameWallet(walletFile, false);
          String keystoreName = WalletApi.store2Keystore(walletFile);
          System.out.println(getStringByType(getType()) + successfulHighlight()
              + ", keystore file name is " + keystoreName);
          selected.setGenerated(true);
          boolean isUnifiedExist = wallet != null && wallet.isLoginState()
              && ArrayUtils.isNotEmpty(wallet.getUnifiedPassword());
          if (isUnifiedExist) {
            wallet.getWalletList().add(walletFile);
          }
          return true;
        } else {
          System.out.println(selected.getDetailString() + ", this address already exists.");
          return false;
        }
      } else {
        terminal.writer().println("("+ start + "-" + end +") is valid");
        terminal.writer().println("Invalid index input!");
        terminal.flush();
        return false;
      }
    } catch (Exception e) {
      terminal.writer().println("Generate selected address error");
      terminal.flush();
      return false;
    }
  }

  private void showError(String message) {
    terminal.writer().println("\n" + message);
    terminal.writer().println("Press Enter to continue...");
    terminal.flush();
    reader.readLine();
  }

  public void start(WalletApi wallet) throws Exception {
    while (true) {
      clearScreen();
      if (mnemonic == null || mnemonic.isEmpty()) {
        System.out.println("MaKe sure your account has mnemonic words first!");
        break;
      }
      Integer firstIndex = getFirstNonGeneratedPathIndex();
      if (firstIndex == null) {
        System.out.println("All sub accounts have been generated!");
        break;
      }
      String defaultFullPath = buildFullPath("0", firstIndex.toString());

      WalletAddress walletAddress = this.generateWalletAddressByCustomPath(
          mnemonic, defaultFullPath);
      if (walletAddress==null) {
        System.out.println("Generate wallet address error!");
        break;
      }

      terminal.writer().println("\n=== " + getStringByType(getType()) + " Generator ===");

      terminal.writer().println("-------------------------------");
      terminal.writer().println("Default Address: " + walletAddress.getAddress());
      terminal.writer().println("Default Path: " + defaultFullPath);
      terminal.writer().println("-------------------------------\n");

      terminal.writer().println("1. Generate Default Path");
      terminal.writer().println("2. Change Account");
      terminal.writer().println("3. Custom Path\n");
      terminal.writer().print("Enter your choice " + greenBoldHighlight("(1-3)") + ": ");
      terminal.flush();

      String choice = reader.readLine().trim();
      if (choice.equals("1")) {
        try {
          genDefaultPath(defaultFullPath, walletAddress, wallet);
        } catch (Exception e) {
          e.printStackTrace();
        }
        break;
      } else if (choice.equals("2")) {
        changeAccount(wallet);
        break;
      } else if (choice.equals("3")) {
        boolean ret = generateByCustomPath(wallet);
        if (!ret) {
          continue;
        } else {
          break;
        }
      } else {
        showError("Invalid choice!");
      }
    }
  }

  public void genDefaultPath(String path, WalletAddress walletAddress, WalletApi wallet) throws Exception {
    if (MnemonicUtils.generatedAddress(walletAddress.getAddress())) {
      terminal.writer().println("The path is already generated...");
      terminal.flush();
      return;
    }

    WalletFile walletFile = WalletApi.CreateWalletFile(password
        , walletAddress.privateKey
        , MnemonicUtils.stringToMnemonicWords(mnemonic)
    );
    nameWallet(walletFile, false);
    String keystoreName = WalletApi.store2Keystore(walletFile);
    System.out.println(getStringByType(getType()) + successfulHighlight() + ", keystore file name is " + keystoreName);

    try {
      int subAccountIndex = getSubAccountIndex(path);
      this.addresses.get(subAccountIndex).setGenerated(true);
    } catch (Exception e) {
      //e.printStackTrace();
    }
    boolean isUnifiedExist = wallet != null && wallet.isLoginState()
        && ArrayUtils.isNotEmpty(wallet.getUnifiedPassword());
    if (isUnifiedExist) {
      wallet.getWalletList().add(walletFile);
    }
  }

  public void changeAccount(WalletApi wallet) throws Exception {
    while (true) {
      displayCurrentPage();
      String command = reader.readLine().trim().toUpperCase();
      if (isNumeric(command)) {
        boolean ret = handleSelectAddress(Integer.parseInt(command), wallet);
        if (ret) {
          break;
        }
      } else {
        switch (command) {
          case "P":
            if (currentPage > 0) {
              currentPage--;
            } else {
              showError("Already at first page!");
            }
            break;
          case "N":
            if (currentPage < totalPages - 1) {
              currentPage++;
            } else {
              showError("Already at last page!");
            }
            break;
          case "Q":
            currentPage = 0;
            throw new IllegalArgumentException(getStringByType(getType()) + " change account has been " + yellowBoldHighlight("canceled") + ".");
          default:
            showError("Invalid command!");
            break;
        }
      }
    }
  }

  public boolean generateByCustomPath(WalletApi wallet) {
    try {
      boolean ret = printRiskAlert();
      if (!ret) {
        return false;
      }
      String pathFull = handlePathInput();
      if (pathFull == null || pathFull.isEmpty()) {
        return false;
      }
      generateSubAccountByCustomPath(pathFull, wallet);
    } catch (Exception e) {
      System.out.println(e.getMessage());
      return false;
    }
    return true;
  }

  public String getStringByType(int type) {
    return type == 0 ? "GenerateSubAccount" : "importWalletByMnemonic";
  }

  private void generateSubAccountByCustomPath(String path, WalletApi wallet) throws CipherException, IOException {
    WalletAddress walletAddress = this.generateWalletAddressByCustomPath(mnemonic, path);
    if (walletAddress == null) {
      System.out.println(getStringByType(getType()) + " by Custom Path " + failedHighlight() + "!");
      return;
    }
    if (MnemonicUtils.generatedAddress(walletAddress.getAddress())) {
      terminal.writer().println("The path is already generated...");
      terminal.flush();
      return;
    }

    AttributedStringBuilder result = new AttributedStringBuilder()
        .append("Generate Address: ", AttributedStyle.BOLD)
        .append(walletAddress.address)
        .append("\n");
    terminal.writer().println(result.toAnsi());
    terminal.flush();
    System.out.println("Input (" + greenBoldHighlight("y/Y") + ") to " + getStringByType(getType()) + " ?");
    String response = reader.readLine("").trim().toLowerCase();
    if (!response.equalsIgnoreCase("y")
        && !response.equalsIgnoreCase("Y")) {
      throw new IllegalArgumentException(getStringByType(getType()) + " by custom path has been " + yellowBoldHighlight("canceled") + ".");
    }
    WalletFile walletFile = WalletApi.CreateWalletFile(password
        , walletAddress.privateKey
        , MnemonicUtils.stringToMnemonicWords(mnemonic)
    );
    String keystoreName = WalletApi.store2Keystore(walletFile);
    System.out.println(getStringByType(getType()) + successfulHighlight() + ", keystore file name is " + keystoreName);

    try {
      int subAccountIndex = getSubAccountIndex(path);
      this.addresses.get(subAccountIndex).setGenerated(true);
    } catch (Exception e) {
      //e.printStackTrace();
    }
    boolean isUnifiedExist = wallet != null && wallet.isLoginState()
        && ArrayUtils.isNotEmpty(wallet.getUnifiedPassword());
    if (isUnifiedExist) {
      wallet.getWalletList().add(walletFile);
    }
  }

  private String handlePathInput() {
    try {
      printInstructions();
      String firstNumber = getValidInput("Enter " + blueBoldHighlight("X") + " number: ", 0);
      if (firstNumber == null) {
        return "";
      }
      String secondNumber = getValidInput("Enter " + blueBoldHighlight("Y") + " number: ", 1);
      if (secondNumber == null) {
        return "";
      }
//      String thirdNumber = getValidInput("Enter third number: ", 2);
//      if (thirdNumber == null) {
//        return "";
//      }
      String fullPath = buildFullPath(firstNumber, secondNumber);
      displayResult(fullPath, firstNumber, secondNumber);
      return fullPath;
    } catch (Exception e) {
      terminal.writer().println("\nAn error occurred: " + e.getMessage());
    }
    return "";
  }

  private boolean printRiskAlert() {
    System.out.println("\n" + ANSI_BOLD + ANSI_RED + "Risk Alert" + ANSI_RESET);
    System.out.println(ANSI_RED + "You are not advised to change the \"Path\" of a generated account address unless you are an advanced user." + ANSI_RESET);
    System.out.println(ANSI_RED + "Please do not use the \"Custom Path\" feature if you do not understand how account addresses are generated or the definition of \"Path\", " +
        "in case you lose access to the new account generated.\n" + ANSI_RESET);

    Scanner scanner = new Scanner(System.in);
    System.out.println("Enter " + greenBoldHighlight("y/Y") + " (Understand the Risks & Continue)");

    String input = scanner.nextLine().trim().toLowerCase();
    if ("y".equals(input)) {
      return true;
    } else {
      return false;
    }
  }

  private void printInstructions() {
    AttributedStringBuilder asb = new AttributedStringBuilder()
        .append("Use Custom Path to Generate\n\n", AttributedStyle.BOLD)
        .append("Path format: ")
        .append(PATH_PREFIX + "X" + PATH_MIDDLE + "Y", AttributedStyle.BOLD)
        .append("\nwhere X and Y are numbers you will enter\n");

    terminal.writer().println(asb.toAnsi());
    terminal.flush();
  }

  private String getValidInput(String prompt, int position) {
    int attempts = 0;
    final int MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      try {
        System.out.print(prompt);
        String input = reader.readLine("");
        if (!input.matches("^\\d+$")) {
          printError("Please enter a valid number");
          attempts++;
          continue;
        }
        return input;
      } catch (Exception e) {
        printError("Invalid input: " + e.getMessage());
        attempts++;
      }
    }
    printError("Maximum attempts reached. Exiting.");
    return null;
  }

  private void printError(String message) {
    terminal.writer().println(new AttributedStringBuilder()
        .append("Error: ", AttributedStyle.BOLD.foreground(AttributedStyle.RED))
        .append(message)
        .toAnsi());
    terminal.flush();
  }

  private String buildFullPath(String first, String second) {
    return PATH_PREFIX + first + PATH_MIDDLE + second;
  }

  private void displayResult(String path, String first, String second) throws Exception {
    clearScreen();
    AttributedStringBuilder result = new AttributedStringBuilder()
        .append("\nGenerate Path: ", AttributedStyle.BOLD)
        .append(path);
    terminal.writer().println(result.toAnsi());
    terminal.flush();
  }

  public int getSubAccountIndex(String path) {
    if (path == null || path.isEmpty()) {
      throw new IllegalArgumentException("Path cannot be null or empty");
    }
    String[] parts = path.split("/");
    if (parts.length < 5) {
      throw new IllegalArgumentException("Path does not have enough parts");
    }
    if (!"0'".equals(parts[3])) {
      throw new IllegalArgumentException("The fourth parameter is not 0");
    }
    String lastPart = parts[parts.length - 1];
    try {
      return Integer.parseInt(lastPart);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("Invalid format: last part is not a number");
    }
  }

  public Integer getFirstNonGeneratedPathIndex() {
    for (WalletAddress walletAddress : addresses) {
      if (!walletAddress.generated) {
        return walletAddress.pathIndex;
      }
    }
    return null; // Return null if all addresses are generated
  }

  public void clearSensitiveData() {
    // Clear mnemonic
    this.mnemonic = null;

    // Clear password
    if (this.password != null) {
        Arrays.fill(this.password, (byte) 0);
        this.password = null;
    }

    // Clear addresses
    if (this.addresses != null) {
        this.addresses.clear();
    }
  }
}