package org.tron.core.manager;

import com.typesafe.config.Config;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import org.tron.core.config.Configuration;
import org.tron.core.dao.BackupRecord;

public class BackupRecordManager {
  private static final String DATA_DIR = "wallet_data";
  private static final String STORAGE_FILE = DATA_DIR + File.separator + "wallet_backup_records.log";
  private static final DateTimeFormatter TIMESTAMP_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final int PAGE_SIZE = 10;
  private static int maxRecords;
  private static final int BUFFER_THRESHOLD = 100;

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
      System.out.println("Failed to load maxRecords from config, using default value.");
      maxRecords = 1000;
    }
  }

  public BackupRecordManager() {
    initializeStorageFile();
  }

  private void initializeStorageFile() {
    try {
      Path dataDir = Paths.get(DATA_DIR);
      if (!Files.exists(dataDir)) {
        Files.createDirectories(dataDir);
      }
      Path path = Paths.get(STORAGE_FILE);
      if (!Files.exists(path)) {
        Files.createFile(path);
      }
    } catch (IOException e) {
      System.err.println("Failed to initialize backup records file: " + e.getMessage());
    }
  }

  public void saveRecord(BackupRecord br) {
    try {
      List<BackupRecord> records = loadAllRecords();
      records.add(br);

      if (records.size() > maxRecords + BUFFER_THRESHOLD) {
        records = records.subList(records.size() - maxRecords, records.size());
        rewriteFile(records);
      } else {
        appendRecord(br);
      }
    } catch (IOException e) {
      System.err.println("Failed to save backup record: " + e.getMessage());
    }
  }

  private void appendRecord(BackupRecord br) throws IOException {
    try (BufferedWriter writer = new BufferedWriter(new FileWriter(STORAGE_FILE, true))) {
      writer.write(recordToCsvLine(br));
      writer.newLine();
    }
  }

  private void rewriteFile(List<BackupRecord> records) throws IOException {
    try (BufferedWriter writer = new BufferedWriter(new FileWriter(STORAGE_FILE))) {
      for (BackupRecord br : records) {
        writer.write(recordToCsvLine(br));
        writer.newLine();
      }
    }
  }

  public List<BackupRecord> loadAllRecords() {
    List<BackupRecord> records = new ArrayList<>();
    Path path = Paths.get(STORAGE_FILE);

    if (!Files.exists(path)) {
      return records;
    }

    try (BufferedReader reader = Files.newBufferedReader(path)) {
      String line;
      while ((line = reader.readLine()) != null) {
        if (!line.trim().isEmpty()) {
          BackupRecord br = parseCsvLine(line);
          if (br != null) {
            records.add(br);
          }
        }
      }
    } catch (IOException e) {
      System.err.println("Failed to load backup records: " + e.getMessage());
    }
    return records;
  }

  public List<BackupRecord> getRecordsByTimeRange(LocalDateTime start, LocalDateTime end) {
    return loadAllRecords().stream()
        .filter(br -> !br.getTimestamp().isBefore(start))
        .filter(br -> !br.getTimestamp().isAfter(end))
        .sorted(Comparator.comparing(BackupRecord::getTimestamp).reversed())
        .collect(Collectors.toList());
  }

  public int calculateTotalPages(List<BackupRecord> records) {
    if (records == null || records.isEmpty()) {
      return 0;
    }
    return (int) Math.ceil((double) records.size() / PAGE_SIZE);
  }

  public int getRecordsTotalPages() {
    List<BackupRecord> backupRecords = loadAllRecords();
    return calculateTotalPages(backupRecords);
  }

  public int getRecordsTotalPagesByTimeRange(LocalDateTime start, LocalDateTime end) {
    List<BackupRecord> list = getRecordsByTimeRange(start, end);
    return calculateTotalPages(list);
  }

  public List<BackupRecord> getPaginatedRecords(List<BackupRecord> records, int page) {
    int fromIndex = (page - 1) * PAGE_SIZE;
    if (fromIndex >= records.size()) {
      return new ArrayList<>();
    }

    int toIndex = Math.min(fromIndex + PAGE_SIZE, records.size());
    return records.subList(fromIndex, toIndex);
  }

  private String recordToCsvLine(BackupRecord br) {
    return String.join(",",
        escapeCsvField(br.getCommand()),
        escapeCsvField(br.getWalletName()),
        escapeCsvField(br.getOwnerAddress()),
        br.getTimestamp().format(TIMESTAMP_FORMAT));
  }

  private BackupRecord parseCsvLine(String line) {
    try {
      String[] parts = line.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", -1);

      if (parts.length != 4) {
        throw new IllegalArgumentException("Invalid CSV line format");
      }

      return new BackupRecord(
          unescapeCsvField(parts[0]),
          unescapeCsvField(parts[1]),
          unescapeCsvField(parts[2]),
          LocalDateTime.parse(parts[3], TIMESTAMP_FORMAT));
    } catch (Exception e) {
      System.err.println("Failed to parse CSV line: " + line + ", error: " + e.getMessage());
      return null;
    }
  }

  private String escapeCsvField(String field) {
    if (field.contains(",") || field.contains("\"") || field.contains("\n")) {
      return "\"" + field.replace("\"", "\"\"") + "\"";
    }
    return field;
  }

  private String unescapeCsvField(String field) {
    if (field.startsWith("\"") && field.endsWith("\"")) {
      return field.substring(1, field.length() - 1).replace("\"\"", "\"");
    }
    return field;
  }
}
