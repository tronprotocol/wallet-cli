package org.tron.ledger.wrapper;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class LedgerSignResult {
  public static final String SIGN_RESULT_SIGNING = "signing";
  public static final String SIGN_RESULT_SUCCESS = "confirmed";
  public static final String SIGN_RESULT_CANCEL = "cancel";

  private static final ReadWriteLock lock = new ReentrantReadWriteLock();
  private static final String DIRECTORY = "Ledger";
  private static final String FILE_PREFIX = "transactions_";

  public static Path getFilePath(String devicePath) {
    return Paths.get(".", DIRECTORY, FILE_PREFIX + devicePath + ".txt");
  }

  // Check if the file exists
  public static boolean fileExists(String devicePath) {
    return Files.exists(getFilePath(devicePath));
  }

  // Create the file if it does not exist
  public static void createFileIfNotExists(String devicePath) {
    lock.writeLock().lock();
    try {
      Path path = getFilePath(devicePath);
      if (!Files.exists(path)) {
        Files.createDirectories(path.getParent()); // Ensure the directory exists
        Files.createFile(path);
        if (DebugConfig.isDebugEnabled()) {
          System.out.println("File created: " + path.toString());
        }
      }
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        System.err.println("Error creating file: " + e.getMessage());
      }
    } finally {
      lock.writeLock().unlock();
    }
  }

  // Read all lines from the file
  public static List<String> readAllLines(String devicePath) {
    lock.readLock().lock();
    try {
      if (!fileExists(devicePath)) {
        return Collections.emptyList();
      }
      return Files.readAllLines(getFilePath(devicePath));
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        System.err.println("Error reading file: " + e.getMessage());
      }
      return Collections.emptyList();
    } finally {
      lock.readLock().unlock();
    }
  }

  // Write all lines to the file
  public static void writeAllLines(String devicePath, List<String> lines) {
    lock.writeLock().lock();
    try (BufferedWriter writer = Files.newBufferedWriter(getFilePath(devicePath))) {
      for (String line : lines) {
        writer.write(line);
        writer.newLine();
      }
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        System.err.println("Error writing to file: " + e.getMessage());
      }
    } finally {
      lock.writeLock().unlock();
    }
  }

  // Append a single line if txid does not exist
  public static void appendLineIfNotExists(String devicePath, String txid, String state) {
    lock.writeLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      boolean exists = lines.stream().anyMatch(line -> line.startsWith(txid + ":"));
      if (!exists) {
        try (BufferedWriter writer = Files.newBufferedWriter(
            getFilePath(devicePath), StandardOpenOption.APPEND, StandardOpenOption.CREATE)) {
          writer.write(txid + ":" + state);
          writer.newLine();
        }
      }
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        System.err.println("Error appending to file: " + e.getMessage());
      }
    } finally {
      lock.writeLock().unlock();
    }
  }

  // Update the state for a specific txid
  public static void updateState(String devicePath, String txid, String newState) {
    lock.writeLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      List<String> updatedLines = new ArrayList<>();
      boolean updated = false;
      for (String line : lines) {
        if (line.startsWith(txid + ":")) {
          updatedLines.add(txid + ":" + newState);
          updated = true;
        } else {
          updatedLines.add(line);
        }
      }
      if (updated) {
        writeAllLines(devicePath, updatedLines);
      }
    } finally {
      lock.writeLock().unlock();
    }
  }

  // Get the state for a specific txid
  public static Optional<String> getStateByTxid(String devicePath, String txid) {
    lock.readLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      for (String line : lines) {
        if (line.startsWith(txid + ":")) {
          String[] parts = line.split(":");
          if (parts.length == 2) {
            return Optional.of(parts[1]);
          }
        }
      }
    } finally {
      lock.readLock().unlock();
    }
    return Optional.empty();
  }

  // Get the last line's txid and state
  public static Optional<String> getLastTransaction(String devicePath) {
    lock.readLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      if (!lines.isEmpty()) {
        return Optional.of(lines.get(lines.size() - 1));
      }
    } finally {
      lock.readLock().unlock();
    }
    return Optional.empty();
  }

  public static Optional<String> getLastTransactionState(String devicePath) {
    lock.readLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      if (!lines.isEmpty() && lines.size() >=1) {
        String lastLine = lines.get(lines.size() - 1);
        String[] parts = lastLine.split(":");
        if (parts.length == 2) {
          return Optional.of(parts[1]); // Return the state part
        }
      }
    } finally {
      lock.readLock().unlock();
    }
    return Optional.empty();
  }

  // Update all states from SIGN_RESULT_SIGNING to SIGN_RESULT_FAIL
  public static void updateAllSigningToReject(String devicePath) {
    lock.writeLock().lock();
    try {
      List<String> lines = readAllLines(devicePath);
      List<String> updatedLines = new ArrayList<>();
      for (String line : lines) {
        if (line.endsWith(":" + SIGN_RESULT_SIGNING)) {
          String[] parts = line.split(":");
          updatedLines.add(parts[0] + ":" + SIGN_RESULT_CANCEL);
        } else {
          updatedLines.add(line);
        }
      }
      writeAllLines(devicePath, updatedLines);
    } finally {
      lock.writeLock().unlock();
    }
  }
}
