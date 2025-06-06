package org.tron.ledger;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.yellowBoldHighlight;
import static org.tron.ledger.LedgerAddressUtil.getTronAddress;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.sdk.LedgerConstant.DEFAULT_PATH;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_VENDOR_ID;

import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.stream.Collectors;
import lombok.Getter;
import org.apache.commons.lang3.StringUtils;
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

  public HidDevice selectDevice() {
    List<HidDevice> list = hidServices.getAttachedHidDevices().stream()
        .filter(hidDevice -> hidDevice.getVendorId() == LEDGER_VENDOR_ID)
        .collect(Collectors.toList());
    List<HidDevice> hidDeviceList = new ArrayList<>();
    for (HidDevice hidDevice : list) {
      try {
        if (hidDevice.open() && (StringUtils.isNotEmpty(getTronAddress(DEFAULT_PATH, hidDevice)))) {
          hidDeviceList.add(hidDevice);
        }
      } catch (Exception e) {
        System.out.println(e.getMessage());
      } finally {
        hidDevice.close();
      }
    }
    if (hidDeviceList.isEmpty()) {
      return null;
    }
    int size = hidDeviceList.size();
    if (size > 1) {
      for (int i = 0; i < size; i++) {
        HidDevice hidDevice = hidDeviceList.get(i);
        System.out.println((i + 1) + ". " + hidDevice.getProduct());
      }
      System.out.println("Please choose between " + greenBoldHighlight(1) + " and " + greenBoldHighlight(size) + ", " + greenBoldHighlight("c/C") + " to canceled.");
      Scanner in = new Scanner(System.in);
      while (true) {
        String input = in.nextLine().trim();
        String num = input.split("\\s+")[0];
        if ("c".equalsIgnoreCase(num)) {
          throw new IllegalArgumentException("ImportWalletByLedger has been "+yellowBoldHighlight("canceled")+".");
        }
        int n;
        try {
          n = Integer.parseInt(num);
        } catch (NumberFormatException e) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose again between 1 and " + size);
          continue;
        }
        if (n < 1 || n > size) {
          System.out.println("Please choose again between 1 and " + size);
          continue;
        }
        return hidDeviceList.get(n - 1);
      }
    } else {
      return hidDeviceList.get(0);
    }
  }

  public HidDevice getMatchedDevice(String path, String ownerAddress) {
    List<HidDevice> hidDeviceList = hidServices.getAttachedHidDevices().stream()
        .filter(hidDevice -> hidDevice.getVendorId() == LEDGER_VENDOR_ID)
        .collect(Collectors.toList());
    if (hidDeviceList.isEmpty()) {
      return null;
    }
    int size = hidDeviceList.size();
    if (size > 1) {
      try {
        return hidDeviceList.stream()
            .filter(hidDevice -> hidDevice.open()
                && StringUtils.equals(ownerAddress, getTronAddress(path, hidDevice)))
            .findFirst()
            .orElse(null);
      } catch (Exception e) {
        System.out.println(e.getMessage());
        return null;
      } finally {
        hidDeviceList.forEach(HidDevice::close);
      }
    } else {
      return hidDeviceList.get(0);
    }
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

  public String getTronAddressByPath(String path, HidDevice hidDevice) {
    int readTimeoutMillis = 5000;
    int totalWaitTimeoutMillis = 5000;
    try {
      byte[] apdu = ApduMessageBuilder.buildTronAddressApduMessage(path);
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get Address Request: " + path);
      }
      hidDevice.open();
      byte[] result = ApduExchangeHandler.exchangeApdu(hidDevice, apdu, readTimeoutMillis, totalWaitTimeoutMillis);
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
    } finally {
      hidDevice.close();
    }
    return EMPTY;
  }

}
