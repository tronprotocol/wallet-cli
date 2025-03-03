package org.tron.ledger.console;

import org.hid4java.HidDevice;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.tron.ledger.LedgerAddressUtil;
import org.tron.ledger.LedgerFileUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

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
      List<ImportAccount> accounts = new ArrayList<>();

      while (true) {
        if (currentPage == 0 && (pathAddressMap == null || pathAddressMap.isEmpty())) {
          pathAddressMap = getImportPathAddressMap(0, PAGE_SIZE).get();
          generatedPage = 0;
        }
        generateAccountsForPage(currentPage, pathAddressMap, accounts);
        displayPage(accounts, currentPage);

        if (currentPage + 1 < TOTAL_PAGES && currentPage + 1 > generatedPage) {
          CompletableFuture<Map<String, String>> addressFuture = getImportPathAddressMap(
              (currentPage + 1) * PAGE_SIZE, (currentPage + 2) * PAGE_SIZE);
          pathAddressMap.putAll(addressFuture.get());
          generatedPage = generatedPage + 1;
        }

        String choice = lineReader.readLine(
            "Options: [n]ext, [p]revious, [q]uit, [0-"+(PAGE_SIZE-1)+"] select: ")
            .trim();
        if (choice.matches("[0-"+(PAGE_SIZE-1)+"]")) {
          int index = Integer.parseInt(choice);
          if (index >=0 && index <=(PAGE_SIZE-1)) {
            int listIndex = currentPage * PAGE_SIZE + index;
            System.out.println("Selected Address: " + accounts.get(listIndex).getAddress());
            return accounts.get(listIndex);
          } else {
            System.out.println("Invalid selection.");
          }
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
      e.printStackTrace();
    }
    return null;
  }

  private static List<ImportAccount> generateAccountsForPage(int page, Map<String, String> pathAddressMap, List<ImportAccount> accounts) {
    int start = page * PAGE_SIZE;
    try {
      for (int i = start; i < start + PAGE_SIZE; i++) {
        String path = "m/44'/195'/" + i + "'/0/0";
        String address = pathAddressMap.get(path);
        boolean isGen = LedgerFileUtil.isPathInFile(path);
        ImportAccount importAccount = new ImportAccount(path, address, isGen);
        if (!accounts.contains(importAccount)){
          accounts.add(importAccount);
        }
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return accounts;
  }

  private static void displayPage(List<ImportAccount> accounts, int page) {
    System.out.println("\nPage " + (page + 1) + " of " + TOTAL_PAGES);
    int start = page * PAGE_SIZE;
    int end = Math.min(start + PAGE_SIZE, accounts.size());
    for (int i = start; i < end; i++) {
      String status = accounts.get(i).isGen() ? "Imported" : "Not Imported";
      System.out.println(i%PAGE_SIZE + ": " + accounts.get(i).getAddress()
          + " \t " + accounts.get(i).getPath()
          + " \t " + status);
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

      while (true) {
        account = lineReader.readLine("Enter x (account, e.g., 0): ");
        if (account.matches("\\d+")) {
          break;
        } else {
          System.out.println("Invalid input for x. Please enter a non-negative integer.");
        }
      }
      while (true) {
        addressIndex = lineReader.readLine("Enter y (address index, e.g., 0): ");
        if (addressIndex.matches("\\d+")) {
          break;
        } else {
          System.out.println("Invalid input for y. Please enter a non-negative integer.");
        }
      }

      String path = String.format("m/%s'/%s'/%s'/%s/%s", purpose, coinType, account, change, addressIndex);
      String address = LedgerAddressUtil.getImportAddress(path);
      boolean isGen = LedgerFileUtil.isPathInFile(path);
      return new ImportAccount(path, address, isGen);
    } catch (Exception e) {
      e.printStackTrace();
    }
    return null;
  }

  public static void main(String[] args) {
    //System.out.println(changeAccount());
    //enterMnemonicPath();
  }
}