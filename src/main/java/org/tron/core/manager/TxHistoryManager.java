package org.tron.core.manager;

import com.typesafe.config.Config;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.apache.commons.lang3.StringUtils;
import org.tron.common.enums.NetType;
import org.tron.core.config.Configuration;
import org.tron.core.dao.Tx;

public class TxHistoryManager {
  private static final String BASE_DIR = "wallet_data";
  private static final String HISTORY_FILE = "wallet_transactions.log";
  private static final DateTimeFormatter TIMESTAMP_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final int PAGE_SIZE = 10;
  private static int maxRecords;
  private static final int BUFFER_SIZE = 100;
  public static final String DASH = "-";

  private final String currentUserAddress;

  static {
    try {
      Config config = Configuration.getByPath("config.conf");
      if (config != null && config.hasPath("maxRecords")) {
        int value = config.getInt("maxRecords");
        if (value <= 0) {
          System.out.println("Invalid maxRecords value " + value + ", must be positive. Using default.");
        }
        maxRecords = value;
      }
    } catch (Exception e) {
      System.out.println("Failed to load maxRecords from config, using default value");
      maxRecords = 1000;
    }
  }

  public TxHistoryManager(String currentUserAddress) {
    this.currentUserAddress = Objects.requireNonNull(currentUserAddress);
    ensureBaseDirectoryExists();
  }

  private Path getNetworkFilePath(NetType network) {
    return Paths.get(BASE_DIR, network.name(), HISTORY_FILE);
  }

  private void ensureNetworkDirectoryExists(NetType network) {
    try {
      Files.createDirectories(Paths.get(BASE_DIR, network.name()));
    } catch (IOException e) {
      System.err.println("Failed to create network directory: " + e.getMessage());
    }
  }

  public void addTransaction(NetType network, Tx tx) {
    Path filePath = getNetworkFilePath(network);
    ensureNetworkDirectoryExists(network);
    try {
      List<String> records = readNonEmptyRecords(filePath);
      records.add(txToLine(tx));

      if (records.size() > maxRecords + BUFFER_SIZE) {
        records = records.subList(records.size() - maxRecords, records.size());

        Files.write(
            filePath,
            records,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE
        );
      } else {
        appendTransaction(filePath, tx);
      }
    } catch (IOException e) {
      System.err.println("Failed to save transaction: " + e.getMessage());
    }
  }

  private void appendTransaction(Path filePath, Tx tx) throws IOException {
    Files.write(
        filePath,
        Collections.singleton(txToLine(tx)),
        StandardOpenOption.CREATE,
        StandardOpenOption.APPEND
    );
  }

  private List<String> readNonEmptyRecords(Path filePath) throws IOException {
    if (!Files.exists(filePath)) {
      return new ArrayList<>();
    }
    return Files.readAllLines(filePath)
        .stream()
        .filter(line -> !line.trim().isEmpty())
        .collect(Collectors.toList());
  }

  public List<Tx> getUserTransactions(NetType network, int page) {
    Path filePath = getNetworkFilePath(network);
    if (!Files.exists(filePath)) {
      return Collections.emptyList();
    }
    try (Stream<String> lines = Files.lines(filePath)) {
      return lines
          .filter(line -> !line.trim().isEmpty())
          .map(this::lineToTx)
          .filter(Optional::isPresent)
          .map(Optional::get)
          .filter(tx -> tx.isRelatedTo(currentUserAddress))
          .sorted(Comparator.comparing(Tx::getTimestamp).reversed())
          .skip((page - 1L) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .collect(Collectors.toList());
    } catch (IOException e) {
      System.err.println("Failed to load transactions: " + e.getMessage());
      return Collections.emptyList();
    }
  }

  public List<Tx> getUserTransactionsByTimeRange(NetType network, LocalDateTime start, LocalDateTime end, int page) {
    Path filePath = getNetworkFilePath(network);
    if (!Files.exists(filePath)) {
      return Collections.emptyList();
    }
    try (Stream<String> lines = Files.lines(filePath)) {
      return lines
          .filter(line -> !line.trim().isEmpty())
          .map(this::lineToTx)
          .filter(Optional::isPresent)
          .map(Optional::get)
          .filter(tx -> tx.isRelatedTo(currentUserAddress))
          .filter(tx -> !tx.getTimestamp().isBefore(start))
          .filter(tx -> !tx.getTimestamp().isAfter(end))
          .sorted(Comparator.comparing(Tx::getTimestamp).reversed())
          .skip((page - 1L) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .collect(Collectors.toList());
    } catch (IOException e) {
      System.err.println("Failed to load transactions: " + e.getMessage());
      return Collections.emptyList();
    }
  }

  private void ensureBaseDirectoryExists() {
    try {
      Files.createDirectories(Paths.get(BASE_DIR));
    } catch (IOException e) {
      System.err.println("Failed to create base directory: " + e.getMessage());
    }
  }

  public int getUserTotalPages(NetType network) {
    Path filePath = getNetworkFilePath(network);
    if (!Files.exists(filePath)) {
      return 0;
    }
    try (Stream<String> lines = Files.lines(filePath)) {
      long count = lines
          .filter(line -> !line.trim().isEmpty())
          .map(this::lineToTx)
          .filter(Optional::isPresent)
          .map(Optional::get)
          .filter(tx -> tx.isRelatedTo(currentUserAddress))
          .count();

      return (int) Math.ceil((double) count / PAGE_SIZE);
    } catch (IOException e) {
      System.err.println("Failed to count transactions: " + e.getMessage());
      return 0;
    }
  }

  public int getUserTotalPagesByTimeRange(NetType network, LocalDateTime start, LocalDateTime end) {
    Path filePath = getNetworkFilePath(network);
    if (!Files.exists(filePath)) {
      return 0;
    }
    try (Stream<String> lines = Files.lines(filePath)) {
      long count = lines
          .filter(line -> !line.trim().isEmpty())
          .map(this::lineToTx)
          .filter(Optional::isPresent)
          .map(Optional::get)
          .filter(tx -> tx.isRelatedTo(currentUserAddress))
          .filter(tx -> !tx.getTimestamp().isBefore(start))
          .filter(tx -> !tx.getTimestamp().isAfter(end))
          .count();

      return (int) Math.ceil((double) count / PAGE_SIZE);
    } catch (IOException e) {
      System.err.println("Failed to count transactions: " + e.getMessage());
      return 0;
    }
  }

  private String txToLine(Tx tx) {
    return String.join(",",
        tx.getId(),
        tx.getType(),
        tx.getFrom(),
        StringUtils.isEmpty(tx.getTo()) ? DASH : tx.getTo(),
        StringUtils.isEmpty(tx.getAmount()) ? DASH : tx.getAmount(),
        tx.getTimestamp().format(TIMESTAMP_FORMAT),
        tx.getStatus(),
        StringUtils.isEmpty(tx.getNote()) ? DASH : tx.getNote()
    );
  }

  private Optional<Tx> lineToTx(String line) {
    try {
      String[] parts = line.split(",");
      if (parts.length != 8) return Optional.empty();

      return Optional.of(new Tx(
          parts[0],                      // id
          parts[1],                      // type
          parts[2],                      // from
          parts[3],                      // to
          parts[4],     // amount
          LocalDateTime.parse(parts[5], TIMESTAMP_FORMAT), // timestamp
          parts[6],                       // status
          parts[7]                       // note
      ));
    } catch (Exception e) {
      System.err.println("Failed to parse transaction line: " + line);
      return Optional.empty();
    }
  }
}
