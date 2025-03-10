package org.tron.ledger.sdk;

public class BIP32PathParser {
  private static final int HARDENED_OFFSET = 0x80000000;

  public static String convertBip32PathToHex(String path) {
    if (path.startsWith("m/") || path.startsWith("/")) {
      path = path.substring(path.indexOf("/") + 1);
    }

    String[] segments = path.split("/");
    byte[] result = new byte[segments.length * 4];

    for (int i = 0; i < segments.length; i++) {
      String segment = segments[i];
      boolean hardened = segment.endsWith("'");
      int value = Integer.parseInt(
          hardened ? segment.substring(0, segment.length() - 1) : segment
      );
      if (hardened) {
        value |= HARDENED_OFFSET;
      }
      int offset = i * 4;
      result[offset] = (byte) ((value >> 24) & 0xFF);
      result[offset + 1] = (byte) ((value >> 16) & 0xFF);
      result[offset + 2] = (byte) ((value >> 8) & 0xFF);
      result[offset + 3] = (byte) (value & 0xFF);
    }

    return CommonUtil.bytesToHex(result);
  }

}
