package org.tron.ledger;

import lombok.Getter;
import lombok.Setter;
import org.hid4java.*;
import java.util.Arrays;

public class TronLedgerGetAddress {
  private static final int LEDGER_VENDOR_ID = 0x2c97;
  private final HidServices hidServices;
  @Getter
  private HidDevice device;
  @Setter
  private boolean debug = false;
  private static TronLedgerGetAddress instance;

  private TronLedgerGetAddress() {
    HidServicesSpecification spec = new HidServicesSpecification();
    hidServices = HidManager.getHidServices(spec);
    hidServices.start();
  }

  public static synchronized TronLedgerGetAddress getInstance() {
    if (instance == null) {
      instance = new TronLedgerGetAddress();
    }
    return instance;
  }

  public HidDevice getConnectedDevice() {
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        System.out.println("Ledger device: " + dev.getProduct() + " found\n");
        return dev;
      }
    }
    return null;
  }

  public void connect() {
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        device = dev;
        if (!device.open()) {
          throw new RuntimeException("Failed to open device");
        }
        if (debug) {
          System.out.println("Connected to Ledger device");
        }

        return;
      }
    }
    throw new RuntimeException("Ledger device not found");
  }

  public void close() {
    if (device != null) {
      device.close();
    }
    hidServices.shutdown();
  }

  public String getTronAddressByPath(String path) {
    try {
      String donglePathHex = BIP32PathParser.parseBip32Path(path);

      // APDU message
      // CLA: 0xE0
      // INS: 0x02 (GET_PUBLIC_KEY)
      // P1: 0x00 (NO USER CONFIRMATION)
      // P2: 0x00 (NO CHAIN CODE)
      StringBuilder apduMessage = new StringBuilder();
      apduMessage.append("e0020000");

      int bytesLength = donglePathHex.length() / 2;
      String lengthHex = String.format("%02x", bytesLength + 1);
      int segments = donglePathHex.length() / 4 / 2;
      String segmentsHex = String.format("%02x", segments);

      apduMessage.append(lengthHex);
      apduMessage.append(segmentsHex);
      apduMessage.append(donglePathHex);
      if (debug) {
        System.out.println("apduMessage:" + apduMessage);
      }

      byte[] apdu = hexStringToByteArray(apduMessage.toString());
      if (debug) {
        System.out.println("Request Public Key");
      }

      byte[] result = exchangeApdu(apdu);
      if (debug) {
        System.out.println("result: " + bytesToHex(result));
      }

      int size = result[0] & 0xFF;
      if (size == 65) {
        byte[] pubKey = Arrays.copyOfRange(result, 1, 1 + size);
        if (debug) {
          System.out.println("Public Key: " + bytesToHex(pubKey));
        }
      } else {
        System.out.println("Error... Public Key Size: " + size);
        return "";
      }

      int addressSize = result[size + 1] & 0xFF;
      if (addressSize == 34) {
        byte[] addressBytes = Arrays.copyOfRange(result, 67, 67 + addressSize);
        return new String(addressBytes);
      } else {
        System.out.println("Error... Address Size: " + addressSize);
      }
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      e.printStackTrace();
    }
    return "";
  }

  private byte[] exchangeApdu(byte[] apdu) {
    byte[] wrappedCommand = LedgerProtocol.wrapCommandAPDU(0x0101, apdu, 64, false);
    if (debug) {
      System.out.println("wrappedCommand: " + bytesToHex(wrappedCommand));
    }

    int result = device.write(wrappedCommand, wrappedCommand.length, (byte) 0);
    if (result < 0) {
      throw new RuntimeException("Failed to write to device");
    }

    ByteArrayBuilder response = new ByteArrayBuilder();
    byte[] buffer = new byte[64];

    while (true) {
      result = device.read(buffer, 1000);
      if (result < 0) {
        throw new RuntimeException("Failed to read from device");
      }
      response.append(buffer, 0, result);

      byte[] unwrapped = LedgerProtocol.unwrapResponseAPDU(0x0101, response.toByteArray(), 64, false);
      if (unwrapped != null) {
        return unwrapped;
      }
    }
  }

  private static byte[] hexStringToByteArray(String s) {
    int len = s.length();
    byte[] data = new byte[len / 2];
    for (int i = 0; i < len; i += 2) {
      data[i / 2] = (byte) ((Character.digit(s.charAt(i), 16) << 4)
          + Character.digit(s.charAt(i + 1), 16));
    }
    return data;
  }

  private static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) {
      sb.append(String.format("%02x", b & 0xFF));
    }
    return sb.toString();
  }
}