package org.tron.ledger;

import org.hid4java.HidDevice;
import org.tron.ledger.wrapper.DebugConfig;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class LedgerFileUtil {
  public static final String LEDGER_DIR_NAME = "Ledger";

  public static String getFileName() {
    HidDevice device = TronLedgerGetAddress.getInstance().getConnectedDevice();
    return getFileNameByDevice(device);
  }

  public static void writePathsToFile(List<String> paths) {
    String fileName = getFileName();

    File directory = new File(LEDGER_DIR_NAME);
    if (!directory.exists()) {
      directory.mkdir();
    }
    File file = new File(directory, fileName);
    Set<String> existingPaths = new HashSet<>();

    if (file.exists()) {
      try {
        existingPaths.addAll(Files.readAllLines(file.toPath()));
      } catch (IOException e) {
        if (DebugConfig.isDebugEnabled()) {
          e.printStackTrace();
        }
      }
    }

    try (BufferedWriter writer = new BufferedWriter(new FileWriter(file, true))) {
      for (String path : paths) {
        if (!existingPaths.contains(path)) {
          writer.write(path);
          writer.newLine();
        }
      }
    } catch (IOException e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
  }

  public static boolean isPathInFile(String path) {
    String fileName = getFileName();
    File file = new File(LEDGER_DIR_NAME, fileName);

    if (file.exists()) {
      try {
        List<String> existingPaths = Files.readAllLines(file.toPath());
        return existingPaths.contains(path);
      } catch (IOException e) {
        if (DebugConfig.isDebugEnabled()) {
          e.printStackTrace();
        }
      }
    }
    return false;
  }

  public static String getFileNameByDevice(HidDevice device) {
    String vendorId = String.valueOf(device.getVendorId());
    String productId = String.valueOf(device.getProductId());
    String serialNumber = sanitizeForFileName(device.getSerialNumber());
    String releaseNumber = String.valueOf(device.getReleaseNumber());

    return String.format("%s_%s_%s_%s.txt", vendorId, productId, serialNumber, releaseNumber);
  }

  private static String sanitizeForFileName(String input) {
    if (input == null) {
      return "unknown";
    }
    return input.replaceAll("[^a-zA-Z0-9]", "_");
  }

  public static void main(String[] args) {
    /*
    try{
      List<String> paths = Arrays.asList(
          "m/44'/195'/0'/0/0",
          "m/44'/195'/1'/0/0",
          "m/44'/195'/2'/0/0"); // Example paths
      LedgerFileUtil.writePathsToFile(null, paths);

      // Check if a specific path exists
      String pathToCheck = "m/44'/195'/0'/0/0";
      boolean exists = LedgerFileUtil.isPathInFile(null, pathToCheck);
      System.out.println("Path " + pathToCheck + " exists: " + exists);
    }catch (Exception e){
      e.printStackTrace();
    }
     */
  }
}
