package org.tron.ledger;

import lombok.Getter;
import org.hid4java.*;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.wrapper.DebugConfig;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

public class TronLedgerGetAddress {
  private static final int LEDGER_VENDOR_ID = 0x2c97;
  private final HidServices hidServices;
  @Getter
  private HidDevice device;
  private static TronLedgerGetAddress instance;

  private TronLedgerGetAddress() {
    HidServicesSpecification spec = new HidServicesSpecification();
    // hidServicesSpecification need the same in the program
    spec.setAutoStart(false);
    spec.setAutoDataRead(true);
    spec.setDataReadInterval(500);
    hidServices = HidManager.getHidServices(spec);
    hidServices.start();
  }

  private static class Holder {
    private static final TronLedgerGetAddress INSTANCE = new TronLedgerGetAddress();
  }

  public static TronLedgerGetAddress getInstance() {
    return Holder.INSTANCE;
  }

  public HidDevice getConnectedDevice() {
    List<HidDevice> hidDeviceList = new ArrayList<>();
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        hidDeviceList.add(dev);
      }
    }

    if (hidDeviceList.size() ==1) {
      return hidDeviceList.get(0);
    } else if (hidDeviceList.size() > 1) {
      System.out.println(ANSI_RED + "Only one ledger device is supported"+ ANSI_RESET);
      System.out.println(ANSI_RED + "Please check your ledger connection"+ ANSI_RESET);
      return null;
    }
    return null;
  }

  public HidDevice getConnectedDeviceWithException() {
    List<HidDevice> hidDeviceList = new ArrayList<>();
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        hidDeviceList.add(dev);
      }
    }

    if (hidDeviceList.size() ==1) {
      return hidDeviceList.get(0);
    } else if (hidDeviceList.size() > 1) {
      System.out.println(ANSI_RED + "Only one ledger device is supported"+ ANSI_RESET);
      System.out.println(ANSI_RED + "Please check your ledger connection"+ ANSI_RESET);
      throw new RuntimeException("Only one ledger device is supported");
    }
    throw new RuntimeException("No device is found");
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
    int readTimeoutMillis = 5000;
    int totalWaitTimeoutMillis = 5000;
    try {
      byte[] apdu = ApduMessageBuilder.buildTronAddressApduMessage(path);
      byte[] result = ApduExchangeHandler.exchangeApdu(device, apdu, readTimeoutMillis, totalWaitTimeoutMillis);

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
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return "";
  }

}
