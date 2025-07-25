package org.tron.ledger;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.ledger.LedgerAddressUtil.getTronAddress;
import static org.tron.ledger.sdk.LedgerConstant.DEFAULT_PATH;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.hid4java.HidDevice;
import org.tron.ledger.wrapper.DebugConfig;

public class LedgerFileUtil {
  public static final String LEDGER_DIR_NAME = "Ledger";

  public static String getFileName(HidDevice hidDevice) {
//    HidDevice device = TronLedgerGetAddress.getInstance().getConnectedDevice();
    return getFileNameByDevice(hidDevice);
  }

  public static void writePathsToFile(List<String> paths, HidDevice device) {
    String fileName = getFileName(device);

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

  public static boolean isPathInFile(String path, HidDevice hidDevice) {
    String fileName = getFileName(hidDevice);
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

//  public static String getFileNameByDevice(HidDevice device) {
//    String vendorId = String.valueOf(device.getVendorId());
//    String productId = String.valueOf(device.getProductId());
//    String serialNumber = sanitizeStringForFileName(device.getSerialNumber());
//    String releaseNumber = String.valueOf(device.getReleaseNumber());
//
//    return String.format("%s_%s_%s_%s.txt", vendorId, productId, serialNumber, releaseNumber);
//  }

  public static String getFileNameByDevice(HidDevice device) {
    try {
      if (device.open()) {
        String defaultAddress = getTronAddress(DEFAULT_PATH, device);
        return String.format("%s.txt", defaultAddress);
      }
    } catch (Exception e) {
      System.out.println(e.getMessage());
    } finally {
      device.close();
    }
    return EMPTY;
  }


  public static void removePathFromFile(String path, HidDevice matchedDevice) {
    String fileName = getFileName(matchedDevice);
    File file = new File(LEDGER_DIR_NAME, fileName);

    if (file.exists()) {
      try {
        List<String> existingPaths = new ArrayList<>(Files.readAllLines(file.toPath()));
        if (existingPaths.remove(path)) {
          try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            for (String existingPath : existingPaths) {
              writer.write(existingPath);
              writer.newLine();
            }
          }
        }
      } catch (IOException e) {
        if (DebugConfig.isDebugEnabled()) {
          e.printStackTrace();
        }
      }
    }
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
