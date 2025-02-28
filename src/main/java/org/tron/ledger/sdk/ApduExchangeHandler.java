package org.tron.ledger.sdk;

import org.hid4java.HidDevice;

public class ApduExchangeHandler {
  private static final int CHANNEL = 0x0101;
  private static final int PACKET_SIZE = 64;
  private static final int TIMEOUT_MILLIS = 1000;
  private static final int MAX_WAIT_TIME_MILLIS = 1000; // 1 seconds

  public static byte[] exchangeApdu(HidDevice device, byte[] apdu) {
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
      // Check if the maximum wait time has been exceeded
      if (System.currentTimeMillis() - startTime > MAX_WAIT_TIME_MILLIS) {
        //1秒钟内没有返回失败，则认为发送成功
        System.err.println("Timeout: No response within 1 seconds");
        return null;
      }
    }
  }



}
