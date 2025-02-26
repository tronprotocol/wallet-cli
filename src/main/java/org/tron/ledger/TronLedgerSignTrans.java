package org.tron.ledger;

import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;

public class TronLedgerSignTrans {
  private static final int LEDGER_VENDOR_ID = 0x2c97;
  private static final int CHANNEL = 0x0101;
  private static final int PACKET_SIZE = 64;
  private static final int TIMEOUT_MILLIS = 1000;

  private final HidServices hidServices;
  private HidDevice device;

  public TronLedgerSignTrans() {
    HidServicesSpecification spec = new HidServicesSpecification();
    hidServices = HidManager.getHidServices(spec);
    hidServices.start();
  }

  public void connect() {
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        device = dev;
        if (!device.open()) {
          throw new RuntimeException("Failed to open device");
        }
        System.out.println("Connected to Ledger device");
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

  private byte[] exchangeApdu(byte[] apdu) {
    byte[] wrappedCommand = LedgerProtocol.wrapCommandAPDU(
        CHANNEL, apdu, PACKET_SIZE, false);

    int result = device.write(wrappedCommand, wrappedCommand.length, (byte) 0);
    if (result < 0) {
      throw new RuntimeException("Failed to write to device");
    }

    ByteArrayBuilder response = new ByteArrayBuilder();
    byte[] buffer = new byte[PACKET_SIZE];

    while (true) {
      result = device.read(buffer, TIMEOUT_MILLIS);
      if (result < 0) {
        throw new RuntimeException("Failed to read from device");
      }
      response.append(buffer, 0, result);
      byte[] unwrapped = LedgerProtocol.unwrapResponseAPDU(
          CHANNEL, response.toByteArray(),
          PACKET_SIZE, false);
      if (unwrapped != null) {
        return unwrapped;
      }
    }
  }

  public static byte[] doSign(String transactionRaw, String path) {
    TronLedgerSignTrans ledger = new TronLedgerSignTrans();
    try {
      ledger.connect();
      String donglePath = BIP32PathParser.parseBip32Path(path);
      int pathByteLength = donglePath.length() / 2;
      int transactionByteLength = transactionRaw.length() / 2;
      String totalLength = String.format("%02x", pathByteLength + 1 + transactionByteLength);
      String pathSegments = String.format("%02x", donglePath.length() / 8);

      String apduMessage = "e0041000" + totalLength + pathSegments + donglePath + transactionRaw;
      byte[] result = ledger.exchangeApdu(
          CommonUtil.hexStringToByteArray(apduMessage)
      );
      return result;
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      e.printStackTrace();
    } finally {
      ledger.close();
    }
    return null;
  }
}
