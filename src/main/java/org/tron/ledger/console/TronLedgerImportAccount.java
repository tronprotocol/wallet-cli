package org.tron.ledger.console;

import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.tron.ledger.LedgerAddressUtil;
import org.tron.ledger.LedgerFileUtil;
import org.tron.ledger.sdk.LedgerConstant;
import org.tron.ledger.wrapper.DebugConfig;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import static org.apache.commons.lang3.StringUtils.isNumeric;

public class TronLedgerImportAccount {
  private static final int PAGE_SIZE = 4;
  private static final int TOTAL_PAGES = 25;
  private static Map<String, String> pathAddressMap;

  public static CompletableFuture<Map<String, String>> getImportPathAddressMap(int start, int end) {
    CompletableFuture<Map<String, String>> addressFuture = CompletableFuture.supplyAsync(() -> {
      List<String> allPaths = new ArrayList<>();
      for (int i = start; i < end; i++) {
        allPaths.add("m/44'/195'/" + i + "'/0/0");
      }
      return LedgerAddressUtil.getMultiImportAddress(allPaths);
    });
    return addressFuture;
  }

  public static ImportAccount changeAccount() {
    try {
      Terminal terminal = TerminalBuilder.builder().system(true).build();
      LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();
      int currentPage = 0;
      int generatedPage = 0;
      //List<ImportAccount> accounts = new ArrayList<>();
      Map<Integer, ImportAccount> accounts = new LinkedHashMap<>();

      while (true) {
        if (currentPage == 0 && (pathAddressMap == null || pathAddressMap.isEmpty())) {
          pathAddressMap = getImportPathAddressMap(0, PAGE_SIZE).get();
        }
        generateAccountsForPage(currentPage, pathAddressMap, accounts);
        displayPage(accounts, currentPage);

        if (currentPage + 1 < TOTAL_PAGES && currentPage + 1 > generatedPage) {
          CompletableFuture<Map<String, String>> addressFuture = getImportPathAddressMap(
              (currentPage + 1) * PAGE_SIZE, (currentPage + 2) * PAGE_SIZE);
          pathAddressMap.putAll(addressFuture.get());
          generatedPage = generatedPage + 1;
        }

        int choiceStartIndex = currentPage * PAGE_SIZE + 1;
        int choiceEndIndex = (currentPage + 1) * PAGE_SIZE;

        String choice = lineReader.readLine(
            "Options: [P] Previous page [N] Next page  [Q] Quit, [" + choiceStartIndex + "-" + choiceEndIndex + "] Select Index: ")
            .trim();
        if (isNumberInRange(choice, choiceStartIndex, choiceEndIndex)) {
          int index = Integer.parseInt(choice);
          int listIndex = index - 1;
          System.out.println("Selected Address: " + accounts.get(listIndex).getAddress());
          return accounts.get(listIndex);
        } else {
          switch (choice) {
            case "n":
              if (currentPage < TOTAL_PAGES - 1) {
                currentPage++;
              } else {
                System.out.println("You are on the last page.");
              }
              break;
            case "p":
              if (currentPage > 0) {
                currentPage--;
              } else {
                System.out.println("You are on the first page.");
              }
              break;
            case "q":
              System.out.println("Exiting...");
              return null;
            default:
              System.out.println("Invalid option. Please select [n], [p], [q], or [0-9].");
              break;
          }
        }
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return null;
  }

  private static Map<Integer, ImportAccount> generateAccountsForPage(int page, Map<String, String> pathAddressMap, Map<Integer, ImportAccount> accounts) {
    int start = page * PAGE_SIZE;
    try {
      for (int i = start; i < start + PAGE_SIZE; i++) {
        String path = "m/44'/195'/" + i + "'/0/0";
        String address = pathAddressMap.get(path);
        if (address != null && !address.isEmpty()) {
          boolean isGen = LedgerFileUtil.isPathInFile(path);
          ImportAccount importAccount = new ImportAccount(path, address, isGen);
          accounts.put(i, importAccount);
        }
      }
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return accounts;
  }

  private static void displayPage(Map<Integer, ImportAccount> accounts, int page) {
    System.out.println("\nPage " + (page + 1) + " of " + TOTAL_PAGES);
    System.out.printf(String.format("%-4s %-42s %-25s %s\n",
        "No.", "Address", "Path", "Status"));
    int displayIndex = page * PAGE_SIZE + 1;
    int accountsIndex = page * PAGE_SIZE;

    int end = accountsIndex + PAGE_SIZE;
    for (int i = accountsIndex; i < end; i++, displayIndex++, accountsIndex++) {
      if (accounts.get(accountsIndex) == null) {
        break;
      }

      String displayStr = String.format("%-42s %-25s %s",
          accounts.get(accountsIndex).getAddress(),
          accounts.get(accountsIndex).getPath(),
          accounts.get(accountsIndex).isGen() ? "✓" : "×");
      String oneRow = String.format("%-4d %s\n",
          displayIndex, displayStr);
      System.out.printf(oneRow);
    }
  }

  public static ImportAccount enterMnemonicPath() {
    try {
      Terminal terminal = TerminalBuilder.builder().system(true).build();
      LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();
      String purpose = "44";
      String coinType = "195";

      System.out.println("Enter the mnemonic path:");
      System.out.println("Fixed path: m/" + purpose + "'/" + coinType + "'/x'/0/y");

      String account = "";
      String change = "0";
      String addressIndex = "";

      final int MAX_ATTEMPTS = 3;
      int attempts = 0;
      while (true) {
        account = lineReader.readLine("Enter x (account, e.g., 0): ");
        if (account.matches("\\d+")) {
          break;
        } else {
          System.out.println("Invalid input for x. Please enter a non-negative integer.");
          attempts++;
          if (attempts == MAX_ATTEMPTS) {
            System.out.println("Maximum attempts reached. Exiting.");
            return null;
          }
        }
      }
      attempts = 0;
      while (true) {
        addressIndex = lineReader.readLine("Enter y (address index, e.g., 0): ");
        if (addressIndex.matches("\\d+")) {
          break;
        } else {
          System.out.println("Invalid input for y. Please enter a non-negative integer.");
          attempts++;
          if (attempts == MAX_ATTEMPTS) {
            System.out.println("Maximum attempts reached. Exiting.");
            return null;
          }
        }
      }

      String path = String.format("m/%s'/%s'/%s'/%s/%s", purpose, coinType, account, change, addressIndex);
      String address = LedgerAddressUtil.getImportAddress(path);
      if (address == null || address.isEmpty()) {
        return null;
      }

      boolean isGen = LedgerFileUtil.isPathInFile(path);
      return new ImportAccount(path, address, isGen);
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return null;
  }

  public static String findFirstMissingPath(String filePath) {
    Path path = Paths.get(".", "Ledger", filePath);
    Set<Integer> existingIndices = new HashSet<>();

    try {
      if (!Files.exists(path)) {
        return LedgerConstant.DEFAULT_PATH;
      }

      List<String> lines = Files.readAllLines(path);
      for (String line : lines) {
        String[] parts = line.split("/");
        if (parts.length > 4) {
          try {
            int index = Integer.parseInt(parts[3].replace("'", ""));
            existingIndices.add(index);
          } catch (NumberFormatException e) {
            System.err.println("Invalid format in line: " + line);
          }
        }
      }

      // Find the first missing index in the range 0-99
      for (int i = 0; i < 100; i++) {
        if (!existingIndices.contains(i)) {
          return String.format("m/44'/195'/%d'/0/0", i);
        }
      }
    } catch (IOException e) {
      System.err.println("Error reading file: " + e.getMessage());
    }

    return null; // Return null if all indices are present
  }

  public static boolean isNumberInRange(String choice, int a, int b) {
    if (choice == null || choice.isEmpty()) {
      return false;
    }

    try {
      int number = Integer.parseInt(choice);
      return number >= a && number <= b;
    } catch (NumberFormatException e) {
      return false;
    }
  }

  public static void main(String[] args) {
    Map<Integer, ImportAccount> accounts = new LinkedHashMap<>();
    accounts.put(0, new ImportAccount("m/44'/0'/0'/0/0", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw81y", true));
    accounts.put(1, new ImportAccount("m/44'/0'/0'/0/1", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw82y", false));
    accounts.put(2, new ImportAccount("m/44'/0'/0'/0/2", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw83y", true));
    accounts.put(3, new ImportAccount("m/44'/0'/0'/0/3", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw84y", false));
    accounts.put(4, new ImportAccount("m/44'/0'/0'/0/4", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw85y", true));
    accounts.put(5, new ImportAccount("m/44'/0'/0'/0/5", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw86y", false));
    accounts.put(6, new ImportAccount("m/44'/0'/0'/0/6", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw87y", true));
    accounts.put(7, new ImportAccount("m/44'/0'/0'/0/7", "TAT7dA8F9HXGqmhvMCjxCKAD29YxDRw88y", false));
    // Display the first page
    displayPage(accounts, 0);
    displayPage(accounts, 1);
  }
}