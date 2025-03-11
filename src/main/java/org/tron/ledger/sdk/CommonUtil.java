package org.tron.ledger.sdk;

import org.hid4java.HidDevice;

public class CommonUtil {
  public static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) {
      sb.append(String.format("%02x", b & 0xFF));
    }
    return sb.toString();
  }

  public static byte[] hexStringToByteArray(String s) {
    int len = s.length();
    byte[] data = new byte[len / 2];
    for (int i = 0; i < len; i += 2) {
      data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
          + Character.digit(s.charAt(i + 1), 16));
    }
    return data;
  }

  public static String getUIDByDevice(HidDevice device) {
    String vendorId = String.valueOf(device.getVendorId());
    String productId = String.valueOf(device.getProductId());
    String serialNumber = sanitizeStringForFileName(device.getSerialNumber());
    String releaseNumber = String.valueOf(device.getReleaseNumber());

    return String.format("%s_%s_%s_%s.txt", vendorId, productId, serialNumber, releaseNumber);
  }

  public static String sanitizeStringForFileName(String input) {
    if (input == null) {
      return "unknown";
    }
    return input.replaceAll("[^a-zA-Z0-9]", "_");
  }
}
