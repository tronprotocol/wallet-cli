package org.tron.core.viewer;

import static org.tron.common.utils.Utils.greenBoldHighlight;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Scanner;
import java.util.stream.Collectors;
import org.tron.core.dao.BackupRecord;
import org.tron.core.manager.BackupRecordManager;

public class BackupRecordsViewer {
  private final BackupRecordManager backupRecordManager;
  private final DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  public BackupRecordsViewer() {
    this.backupRecordManager = new BackupRecordManager();
  }

  public void viewBackupRecords() {
    Scanner scanner = new Scanner(System.in);

    System.out.println("\n=== View Backup Records ===");
    System.out.println("1. View all records");
    System.out.println("2. Filter by time range");
    System.out.print("Choose an option (1-2): ");

    int option = scanner.nextInt();
    scanner.nextLine();

    List<BackupRecord> recordsToDisplay;
    int totalPages;
    if (option == 1) {
      recordsToDisplay = backupRecordManager.loadAllRecords().stream()
          .sorted(Comparator.comparing(BackupRecord::getTimestamp).reversed())
          .collect(Collectors.toList());
      totalPages = backupRecordManager.getRecordsTotalPages();
    } else if (option == 2) {
      System.out.print("Enter start time (yyyy-MM-dd HH:mm:ss): ");
      LocalDateTime start = LocalDateTime.parse(scanner.nextLine(), dateTimeFormatter);

      System.out.print("Enter end time (yyyy-MM-dd HH:mm:ss): ");
      LocalDateTime end = LocalDateTime.parse(scanner.nextLine(), dateTimeFormatter);

      recordsToDisplay = backupRecordManager.getRecordsByTimeRange(start, end);
      totalPages = backupRecordManager.getRecordsTotalPagesByTimeRange(start, end);
    } else {
      System.out.println("Invalid option!");
      return;
    }

    if (recordsToDisplay.isEmpty()) {
      System.out.println("No records found.");
      return;
    }

    int currentPage = 1;

    while (true) {
      List<BackupRecord> pageRecords = backupRecordManager.getPaginatedRecords(
          recordsToDisplay, currentPage);

      System.out.println("\n=== Page " + currentPage + " of " + totalPages + " ===");
      printRecords(pageRecords);

      System.out.print("\n[" + greenBoldHighlight("n") + "]Next [" + greenBoldHighlight("p") + "]Previous [" + greenBoldHighlight("q") + "]Back: ");
      System.out.print("Enter command: ");
      String command = scanner.next().toLowerCase();

      if (command.equals("n") && currentPage < totalPages) {
        currentPage++;
      } else if (command.equals("p") && currentPage > 1) {
        currentPage--;
      } else if (command.equals("q")) {
        break;
      }
    }
  }

  private void printRecords(List<BackupRecord> records) {
    System.out.printf("%-33s %-52s %-47s %-25s%n",
        greenBoldHighlight("COMMAND"), greenBoldHighlight("FILE NAME"), greenBoldHighlight("ADDRESS"), greenBoldHighlight("TIMESTAMP"));
    System.out.println("-------------------------------------------------------------------------------------------------------------------");

    for (BackupRecord br : records) {
      System.out.printf("%-20s %-15s %-20s %-25s%n",
          br.getCommand(),
          br.getWalletName(),
          br.getOwnerAddress(),
          br.getTimestamp().format(dateTimeFormatter));
    }
  }
}
