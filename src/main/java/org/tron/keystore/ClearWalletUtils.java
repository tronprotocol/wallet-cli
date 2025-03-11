package org.tron.keystore;

import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class ClearWalletUtils {

  public static boolean confirmAndDeleteWallet(String address, Collection<String> filePaths) {
    final String CONFIRMATION_WORD = "DELETE";
    final int MAX_ATTEMPTS = 3;
    try {
      Terminal terminal = TerminalBuilder.builder().system(true).build();
      LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();

      System.out.println("\n\u001B[31mWarning: Dangerous operation!\u001B[0m");
      System.out.println("This operation will permanently delete the Wallet&Mnemonic files of the Address: " + address);
      System.out.println("\u001B[31mWarning: The private key and mnemonic words will be permanently lost and cannot be recovered!\u001B[0m");

      int attempts = 0;
      while (attempts < MAX_ATTEMPTS) {
        String confirm = lineReader.readLine("Continue? (Y/Yes to proceed): ").trim();
        if (isConfirmed(confirm)) {
          break;
        }
        if (++attempts == MAX_ATTEMPTS) {
          System.out.println("Maximum retry attempts reached, operation canceled.");
          return false;
        }
        System.out.println("Invalid input, please enter Y or Yes to confirm.");
      }

      System.out.println("\nFinal confirmation:");
      System.out.println("Please enter: '" + CONFIRMATION_WORD + "' To confirm the delete operation:");

      attempts = 0;
      while (attempts < MAX_ATTEMPTS) {
        String confirm = lineReader.readLine("Confirm: (" + CONFIRMATION_WORD + "): ").trim();
        if (CONFIRMATION_WORD.equals(confirm)) {
          break;
        }
        if (++attempts == MAX_ATTEMPTS) {
          System.out.println("Maximum retry attempts reached, operation canceled.");
          return false;
        }
        System.out.println("Input does not match, Please enter: 'DELETE' To confirm the delete operation.");
      }

      return deleteFiles(filePaths);
    } catch (Exception e) {
      System.err.println("Operation failed:" + e.getMessage());
      return false;
    }
  }

  private static boolean isConfirmed(String input) {
    return input.equalsIgnoreCase("Y") || input.equalsIgnoreCase("YES");
  }

  private static final String BACKUP_SUFFIX = ".bak";

  public static boolean deleteFiles(Collection<String> filePaths) {
    if (filePaths == null || filePaths.isEmpty()) {
      System.err.println("No files specified for deletion");
      return false;
    }

    List<PathPair> pathPairs = new ArrayList<>();
    for (String path : filePaths) {
      pathPairs.add(new PathPair(path));
    }

    try {
      if (!validateFiles(pathPairs)) {
        return false;
      }

      if (!createBackups(pathPairs)) {
        cleanupBackups(pathPairs);
        return false;
      }

      if (!deleteOriginals(pathPairs)) {
        rollback(pathPairs);
        return false;
      }

      cleanupBackups(pathPairs);
      printSuccess(pathPairs);
      return true;
    } catch (Exception e) {
      System.err.println("An error occurred during operation: " + e.getMessage());
      try {
        rollback(pathPairs);
      } catch (Exception rollbackEx) {
        System.err.println("Rollback failed: " + rollbackEx.getMessage());
        printBackupLocations(pathPairs);
      }
      return false;
    }
  }

  private static class PathPair {
    final Path original;
    final Path backup;
    private boolean backupCreated = false;
    private boolean originalDeleted = false;

    PathPair(String originalPath) {
      this.original = Paths.get(originalPath);
      this.backup = Paths.get(originalPath + BACKUP_SUFFIX);
    }
  }

  private static boolean validateFiles(List<PathPair> pairs) {
    boolean allValid = true;
    for (PathPair pair : pairs) {
      if (!Files.exists(pair.original)) {
        System.err.println("File not found: " + pair.original);
        allValid = false;
      }
    }
    return allValid;
  }

  private static boolean createBackups(List<PathPair> pairs) {
    for (PathPair pair : pairs) {
      try {
        Files.copy(pair.original, pair.backup);
        pair.backupCreated = true;
      } catch (Exception e) {
        System.err.println("Failed to create backup: " + pair.original);
        System.err.println("Error message: " + e.getMessage());
        return false;
      }
    }
    return true;
  }

  private static boolean deleteOriginals(List<PathPair> pairs) {
    boolean allDeleted = true;
    for (PathPair pair : pairs) {
      try {
        Files.deleteIfExists(pair.original);
        pair.originalDeleted = true;
      } catch (Exception e) {
        System.err.println("Failed to delete the file: " + pair.original);
        System.err.println("Error message: " + e.getMessage());
        allDeleted = false;
        break;
      }
    }
    return allDeleted;
  }

  private static void cleanupBackups(List<PathPair> pairs) {
    for (PathPair pair : pairs) {
      if (pair.backupCreated) {
        try {
          Files.deleteIfExists(pair.backup);
        } catch (Exception e) {
          System.err.println("Warning: Unable to delete backup file: " + pair.backup);
          System.err.println("Error message: " + e.getMessage());
        }
      }
    }
  }

  private static void rollback(List<PathPair> pairs) throws Exception {
    for (PathPair pair : pairs) {
      if (pair.backupCreated && pair.originalDeleted) {
        if (Files.exists(pair.backup)) {
          Files.move(pair.backup, pair.original);
        }
      }
    }
  }

  private static void printSuccess(List<PathPair> pairs) {
    System.out.println("\nFile deleted successfully:");
    pairs.forEach(pair -> System.out.println("- " + pair.original));
  }

  private static void printBackupLocations(List<PathPair> pairs) {
    System.err.println("\nRecovery failed, backup file is located at:");
    pairs.forEach(pair -> {
      if (pair.backupCreated) {
        System.err.println("- " + pair.backup);
      }
    });
    System.err.println("\nYou can manually restore these files if needed:");
    System.err.println("\nTo restore manually, copy the backup file to the original location.");
  }


}
