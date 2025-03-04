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
  public static final String SIGN_RESULT_FAIL = "rejected";

  private static final String FILE_PATH = "./ledger/transactions_";
  private static final ReadWriteLock lock = new ReentrantReadWriteLock();


  public static Path getFilePath(String devicePath) {
    return Paths.get(FILE_PATH +  devicePath + ".txt");
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
        System.out.println("File created: " + path.toString());
      }
    } catch (IOException e) {
      System.err.println("Error creating file: " + e.getMessage());
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
      System.err.println("Error reading file: " + e.getMessage());
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
      System.err.println("Error writing to file: " + e.getMessage());
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
      System.err.println("Error appending to file: " + e.getMessage());
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
      if (!lines.isEmpty() && lines.size() >=2) {
        String lastLine = lines.get(lines.size() - 2);
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
          updatedLines.add(parts[0] + ":" + SIGN_RESULT_FAIL);
        } else {
          updatedLines.add(line);
        }
      }
      writeAllLines(devicePath, updatedLines);
    } finally {
      lock.writeLock().unlock();
    }
  }

  public static void main(String[] args) {
    /*
    // Create the file if it does not exist
    String devicPath = "12345";

    createFileIfNotExists(devicPath);

    // Check if file exists
    System.out.println("File exists: " + fileExists(devicPath));

    // Append a new transaction if it doesn't exist
    appendLineIfNotExists(devicPath,"tx123", SIGN_RESULT_SIGNING);

    // Read and print all lines
    List<String> lines = readAllLines(devicPath);
    lines.forEach(System.out::println);

    // Update the state of an existing transaction
    updateState(devicPath,"tx123", SIGN_RESULT_SUCCESS);

    // Read and print all lines
    lines = readAllLines(devicPath);
    lines.forEach(System.out::println);

    // Update all signing states to fail
    updateAllSigningToReject(devicPath);

    // Read and print all lines after update
    lines = readAllLines(devicPath);
    lines.forEach(System.out::println);

    // Get and print the last transaction
    Optional<String> lastTransactionState = getLastTransactionState(devicPath);
    lastTransactionState.ifPresent(state -> System.out.println("Last transaction state: " + state));

    // Get and print the state for a specific txid
    Optional<String> state = getStateByTxid(devicPath,"tx123");
    state.ifPresent(s -> System.out.println("State for tx123: " + s));

     */

  }
}
