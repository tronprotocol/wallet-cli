package org.tron.ledger;

import lombok.Getter;
import org.hid4java.*;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerConstant;
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
    spec.setDataReadInterval(1000);
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
      System.out.println(ANSI_RED + "Only one Ledger device is supported"+ ANSI_RESET);
      System.out.println(ANSI_RED + "Please check your Ledger connection"+ ANSI_RESET);
      System.out.println(ANSI_RED + "Please disconnect any unnecessary Ledger devices from your computer's USB ports."+ ANSI_RESET);
      return null;
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
    //hidServices.shutdown();
  }

  public String getTronAddressByPath(String path) {
    int readTimeoutMillis = 5000;
    int totalWaitTimeoutMillis = 5000;
    try {
      byte[] apdu = ApduMessageBuilder.buildTronAddressApduMessage(path);
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get Address Request: " + path);
      }
      byte[] result = ApduExchangeHandler.exchangeApdu(device, apdu, readTimeoutMillis, totalWaitTimeoutMillis);
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get Address Response: " + CommonUtil.bytesToHex(result));
      }
      if (LedgerConstant.LEDGER_LOCK.equalsIgnoreCase(CommonUtil.bytesToHex(result))) {
        System.out.println(ANSI_RED + "Ledger is locked, please unlock it first"+ ANSI_RESET);
        return "";
      }

      int offset = 0;
      int publicKeyLength = result[offset++] & 0xFF;
      byte[] publicKey = new byte[publicKeyLength];
      System.arraycopy(result, offset, publicKey, 0, publicKeyLength);
      offset += publicKeyLength;

      int addressLength = result[offset++] & 0xFF;
      byte[] addressBytes = new byte[addressLength];
      System.arraycopy(result, offset, addressBytes, 0, addressLength);
      String address = new String(addressBytes);
      return address;
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return "";
  }

  public static void main(String[] args) {
    /*
    HidDevice hidDevice = null;

    while (true) {
      try {
        hidDevice = TronLedgerGetAddress.getInstance().getConnectedDevice();
        if (hidDevice != null) {
          System.out.println(hidDevice.toString());
        }
      } catch (Exception e) {
        System.out.println("No device found, please connect your Ledger device");
      }
      try {
        Thread.sleep(1000); // Sleep for 1 second
      } catch (InterruptedException e) {
        System.out.println("Interrupted, stopping.");
        break;
      }
    }
     */

  }

}
