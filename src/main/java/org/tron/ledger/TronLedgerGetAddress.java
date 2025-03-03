package org.tron.ledger;

import org.hid4java.HidDevice;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import java.util.Arrays;

public class TronLedgerGetAddress {
  private TronLedgerGetAddress() {
  }

  private static class Holder {
    private static final TronLedgerGetAddress INSTANCE = new TronLedgerGetAddress();
  }

  public static TronLedgerGetAddress getInstance() {
    return Holder.INSTANCE;
  }

  public String getTronAddressByPath(HidDevice device, String path) {
    try {
      byte[] apdu = ApduMessageBuilder.buildTronAddressApduMessage(path);
      byte[] result = ApduExchangeHandler.exchangeApdu(device, apdu);

      int size = result[0] & 0xFF;
      if (size == 65) {
        byte[] pubKey = Arrays.copyOfRange(result, 1, 1 + size);
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

}