package org.tron.ledger.sdk;

import org.hid4java.HidDevice;
import org.tron.ledger.wrapper.DebugConfig;

public class ApduExchangeHandler {
  private static final int CHANNEL = 0x0101;
  private static final int PACKET_SIZE = 64;


  public static byte[] exchangeApdu(HidDevice device, byte[] apdu
      , int readTimeoutMillis, int totalWaitTimeoutMillis) {
    byte[] wrappedCommand = LedgerProtocol.wrapCommandAPDU(
        CHANNEL, apdu, PACKET_SIZE, false);

    int result = device.write(wrappedCommand, wrappedCommand.length, (byte) 0);
    if (result < 0) {
      throw new RuntimeException("Failed to write to device");
    }

    ByteArrayBuilder response = new ByteArrayBuilder();
    byte[] buffer = new byte[PACKET_SIZE];
    long startTime = System.currentTimeMillis();

    while (true) {
      result = device.read(buffer, readTimeoutMillis);
      if (result < 0) {
        throw new RuntimeException("Failed to read from device");
      }
      response.append(buffer, 0, result);
      byte[] unwrapped = LedgerProtocol.unwrapResponseAPDU(
          CHANNEL, response.toByteArray(), PACKET_SIZE, false);
      if (unwrapped != null) {
        return unwrapped;
      }
      // Check if the maximum wait time has been exceeded
      if (System.currentTimeMillis() - startTime > totalWaitTimeoutMillis) {
        //totalWaitTimeoutMillis/1000 seconds
        if (DebugConfig.isDebugEnabled()) {
          System.out.println(totalWaitTimeoutMillis);
          System.out.println(totalWaitTimeoutMillis/1000);
          System.err.println("Timeout: No response within " + totalWaitTimeoutMillis/1000 + " seconds");
        }
        return null;
      }
    }
  }



}
