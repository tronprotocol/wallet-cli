package org.tron.ledger;

import org.hid4java.HidDevice;

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

  public static void writePathsToFile(HidDevice device, List<String> paths) {
    String directoryName = "ledger";
    String fileName = String.format("%s_%s_%s_%s.txt",
        device.getVendorId(),
        device.getProductId(),
        device.getSerialNumber(),
        device.getReleaseNumber());

    File directory = new File(directoryName);
    if (!directory.exists()) {
      directory.mkdir();
    }
    File file = new File(directory, fileName);
    Set<String> existingPaths = new HashSet<>();

    if (file.exists()) {
      try {
        existingPaths.addAll(Files.readAllLines(file.toPath()));
      } catch (IOException e) {
        e.printStackTrace();
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
      e.printStackTrace();
    }
  }

  public static boolean isPathInFile(HidDevice device, String path) {
    String directoryName = "ledger";
    String fileName = String.format("%s_%s_%s_%s.txt",
        device.getVendorId(),
        device.getProductId(),
        device.getSerialNumber(),
        device.getReleaseNumber());

    File file = new File(directoryName, fileName);

    if (file.exists()) {
      try {
        List<String> existingPaths = Files.readAllLines(file.toPath());
        return existingPaths.contains(path);
      } catch (IOException e) {
        e.printStackTrace();
      }
    }
    return false;
  }

  public static void main(String[] args) {
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
  }
}
