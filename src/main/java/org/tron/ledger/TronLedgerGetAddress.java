package org.tron.ledger;

import lombok.Getter;
import org.hid4java.*;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import java.util.Arrays;

public class TronLedgerGetAddress {
  private static final int LEDGER_VENDOR_ID = 0x2c97;
  private final HidServices hidServices;
  @Getter
  private HidDevice device;
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