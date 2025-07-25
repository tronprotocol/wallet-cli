package org.tron.ledger.wrapper;

import static org.tron.ledger.LedgerAddressUtil.getTronAddress;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_VENDOR_ID;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.apache.commons.lang3.StringUtils;
import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.tron.ledger.listener.LedgerEventListener;

public class HidServicesWrapper {
  private HidServices hidServices;
  private HidDevice hidDevice;

  private HidServicesWrapper() {
    if (hidServices==null) {
      hidServices = initHidServices();
    }
  }
  private static class Holder {
    private static final HidServicesWrapper INSTANCE = new HidServicesWrapper();
  }
  public static HidServicesWrapper getInstance() {
    return Holder.INSTANCE;
  }

  public HidServices getHidServices() {
    if (hidServices==null) {
      hidServices = initHidServices();
    }
    return hidServices;
  }


  public HidDevice getHidDevice(String address, String path) {
    hidDevice =  getLedgerHidDevice(getHidServices(), address, path);
    return hidDevice;
  }

  public void setHidDevice(HidDevice hidDevice) {
    this.hidDevice = hidDevice;
  }

  public  HidServices initHidServices() {
    HidServicesSpecification hidServicesSpecification = new HidServicesSpecification();
    // hidServicesSpecification need the same in the program
    hidServicesSpecification.setAutoStart(false);
    hidServicesSpecification.setAutoDataRead(true);
    hidServicesSpecification.setDataReadInterval(1000);
    HidServices hs = HidManager.getHidServices(hidServicesSpecification);
    hs.addHidServicesListener(LedgerEventListener.getInstance());
    hs.start();

    return hs;
  }

  public static HidDevice getLedgerHidDevice(HidServices hidServices, String address, String path) {
    List<HidDevice> hidDeviceList = new ArrayList<>();
    HidDevice fidoDevice = null;
    List<HidDevice> attachedLedgerHidDevices = hidServices.getAttachedHidDevices().stream()
        .filter(hidDevice -> hidDevice.getVendorId() == LEDGER_VENDOR_ID).collect(Collectors.toList());
    try {
      for (HidDevice hidDevice : attachedLedgerHidDevices) {
        if (hidDevice.open()) {
          hidDeviceList.add(hidDevice);
        }
      }
      if (hidDeviceList.size() > 1) {
        fidoDevice = hidDeviceList.stream()
            .filter(hidDevice -> StringUtils.equals(address, getTronAddress(path, hidDevice)))
            .findFirst()
            .orElse(null);
        System.out.println("fidoDevice is not null:" + (fidoDevice != null));
      } else if (hidDeviceList.size() == 1) {
        fidoDevice = hidDeviceList.get(0);
      }

      if (fidoDevice == null) {
        if (DebugConfig.isDebugEnabled()) {
          System.out.println(ANSI_YELLOW + "No FIDO2 devices attached." + ANSI_RESET);
        }
      } else {
        if (fidoDevice.isClosed()) {
          fidoDevice.open();
        }
      }
    } catch (Exception e) {
      System.out.println(ANSI_RED + e.getMessage() + ANSI_RESET);
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    } finally {
      attachedLedgerHidDevices.forEach(HidDevice::close);
    }

    return fidoDevice;
  }

}
