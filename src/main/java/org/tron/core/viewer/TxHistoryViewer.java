package org.tron.core.viewer;

import static org.tron.common.utils.Utils.greenBoldHighlight;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Scanner;
import org.jetbrains.annotations.NotNull;
import org.tron.common.enums.NetType;
import org.tron.core.dao.Tx;
import org.tron.core.manager.TxHistoryManager;

public class TxHistoryViewer {
  private final TxHistoryManager historyManager;
  private final Scanner scanner;
  private static final DateTimeFormatter DATE_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  public TxHistoryViewer(TxHistoryManager historyManager) {
    this.historyManager = historyManager;
    this.scanner = new Scanner(System.in);
  }

  public void startInteractiveViewer(NetType netType) {
    printWelcome();

    while (true) {
      printMainMenu();
      String command = scanner.nextLine().trim().toLowerCase();

      switch (command) {
        case "1": showTransactionList(netType); break;
        case "2": showTransactionsByTimeRange(netType); break;
        case "3": printHelp(); break;
        case "4": return;
        default: System.out.println("Invalid command");
      }
    }
  }

  private void printWelcome() {
    System.out.println("====================================");
    System.out.println("   COMPLETE TRANSACTION VIEWER");
    System.out.println("====================================");
  }

  private void printMainMenu() {
    System.out.println("\nMAIN MENU:");
    System.out.println("1. View all transactions");
    System.out.println("2. Filter by time range");
    System.out.println("3. Help");
    System.out.println("4. Exit");
    System.out.print("Select option: ");
  }

  private void showTransactionList(NetType netType) {
    int currentPage = 1;
    int totalPages = historyManager.getUserTotalPages(netType);

    if (totalPages == 0) {
      System.out.println("\nNo transactions found");
      return;
    }

    while (true) {
      List<Tx> transactions = historyManager.getUserTransactions(netType, currentPage);
      printTransactionPage(transactions, currentPage, totalPages);

      System.out.print("\n[" + greenBoldHighlight("n") + "]Next [" + greenBoldHighlight("p") + "]Previous [" + greenBoldHighlight("q") + "]Back: ");
      String command = scanner.nextLine().trim().toLowerCase();

      if (command.equals("n") && currentPage < totalPages) {
        currentPage++;
      } else if (command.equals("p") && currentPage > 1) {
        currentPage--;
      } else if (command.equals("q")) {
        break;
      } else {
        System.out.println("Invalid operation");
      }
    }
  }

  private void showTransactionsByTimeRange(NetType netType) {
    try {
      System.out.println("\n=== TIME RANGE FILTER ===");
      System.out.println("Format: yyyy-MM-dd HH:mm:ss (e.g. 2023-10-01 14:30:33)");

      LocalDateTime start = getLocalDateTime("Start time: ");

      LocalDateTime end = getLocalDateTime("End time: ");

      int currentPage = 1;
      int totalPages = historyManager.getUserTotalPagesByTimeRange(netType, start, end);

      if (totalPages == 0) {
        System.out.println("\nNo transactions found in this time range");
        return;
      }

      while (true) {
        List<Tx> transactions =
            historyManager.getUserTransactionsByTimeRange(netType, start, end, currentPage);
        printTransactionPage(transactions, currentPage, totalPages);

        System.out.print("\n[" + greenBoldHighlight("n") + "]Next [" + greenBoldHighlight("p") + "]Previous [" + greenBoldHighlight("q") + "]Back: ");
        String command = scanner.nextLine().trim().toLowerCase();

        if (command.equals("n") && currentPage < totalPages) {
          currentPage++;
        } else if (command.equals("p") && currentPage > 1) {
          currentPage--;
        } else if (command.equals("q")) {
          break;
        } else {
          System.out.println("Invalid operation");
        }
      }
    } catch (Exception e) {
      System.out.println("\nError: " + e.getMessage());
    }
  }

  @NotNull
  private LocalDateTime getLocalDateTime(String s) {
    LocalDateTime start = null;
    while (start == null) {
      try {
        System.out.print(s);
        start = LocalDateTime.parse(scanner.nextLine(), DATE_FORMAT);
      } catch (DateTimeParseException e) {
        System.out.println("Error: Invalid time format, please try again");
      }
    }
    return start;
  }

  private void printTransactionPage(List<Tx> transactions, int currentPage, int totalPages) {
    // Print table header
    System.out.printf("\n=== TRANSACTIONS (Page %d of %d) ===\n", currentPage, totalPages);
    System.out.println("-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------");
    System.out.printf("%-78s %-45s %-48s %-48s %-33s %-21s %-30s " +
//            "%-100s" +
            "\n",
        greenBoldHighlight("ID"), greenBoldHighlight("TYPE"), greenBoldHighlight("OWNER ADDRESS"), greenBoldHighlight("ACTIVE/TO/CONTRACT ADDRESS"), greenBoldHighlight("AMOUNT"), greenBoldHighlight("STATUS"), greenBoldHighlight("TIME")
//        , greenBoldHighlight("NOTE")
    );
    System.out.println("-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------");

    // Print all transaction fields
    for (Tx tx : transactions) {
      System.out.printf("%-65s %-32s %-35s %-35s %-20s %-8s %-17s" +
//              " %-100s" +
              "\n",
          tx.getId(),
          tx.getType(),
          tx.getFrom(),
          tx.getTo(),
          tx.getAmount(),
          tx.getStatus(),
          tx.getTimestamp().format(DATE_FORMAT)
//          , tx.getNote() != null ? tx.getNote() : ""
      );
    }
  }

  private void printHelp() {
    System.out.println("\n=== HELP ===");
    System.out.println("1. View all transactions - Shows complete transaction history");
    System.out.println("2. Filter by time range - Filters transactions between two timestamps");
    System.out.println("3. Help - Shows this help message");
    System.out.println("4. Exit - Quits the application");
    System.out.println("\nWhile browsing pages:");
    System.out.println("n - Next page");
    System.out.println("p - Previous page");
    System.out.println("q - Back to main menu");
  }
}
