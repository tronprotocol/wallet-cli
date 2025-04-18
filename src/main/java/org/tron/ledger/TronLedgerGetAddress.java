package org.tron.ledger;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_VENDOR_ID;

import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerConstant;
import org.tron.ledger.wrapper.DebugConfig;

public class TronLedgerGetAddress {
  private final HidServices hidServices;
  @Getter
  private HidDevice device;

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
    if (!hidDeviceList.isEmpty()) {
      return hidDeviceList.get(0);
    }
    return null;
  }

  public void connect() {
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        device = dev;
        try {
          device.open();
        } catch (Exception e) {
          throw new RuntimeException(e.getMessage());
        }
        return;
      }
    }
    throw new RuntimeException(ANSI_RED + "Ledger device not found" + ANSI_RESET);
  }

  public void close() {
    if (device != null) {
      device.close();
    }
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
        return EMPTY;
      }

      int offset = 0;
      int publicKeyLength = result[offset++] & 0xFF;
      byte[] publicKey = new byte[publicKeyLength];
      System.arraycopy(result, offset, publicKey, 0, publicKeyLength);
      offset += publicKeyLength;

      int addressLength = result[offset++] & 0xFF;
      byte[] addressBytes = new byte[addressLength];
      System.arraycopy(result, offset, addressBytes, 0, addressLength);
      return new String(addressBytes);
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return EMPTY;
  }

}
