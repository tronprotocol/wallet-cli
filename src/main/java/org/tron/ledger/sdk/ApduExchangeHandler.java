package org.tron.ledger.sdk;

import org.hid4java.HidDevice;

public class ApduExchangeHandler {
  private static final int CHANNEL = 0x0101;
  private static final int PACKET_SIZE = 64;
  private static final int TIMEOUT_MILLIS = 1000;

  public static byte[] exchangeApdu(HidDevice device, byte[] apdu) {
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
          CHANNEL, response.toByteArray(), PACKET_SIZE, false);
      if (unwrapped != null) {
        return unwrapped;
      }
    }
  }

}
