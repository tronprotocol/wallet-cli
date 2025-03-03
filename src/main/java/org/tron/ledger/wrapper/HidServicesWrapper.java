package org.tron.ledger.wrapper;

import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.tron.ledger.listener.LedgerEventListener;

import java.util.ArrayList;
import java.util.List;

import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;

public class HidServicesWrapper {
  // TODO, 对于get address和 trans sig 需要用2个不同的hidServices实例。
  private HidServices hidAddressServices;
  private HidServices hidServices;

  private HidServicesWrapper() {
    if (hidServices==null) {
      hidServices = initHidSerives();
    }
    if (hidAddressServices==null) {
      hidAddressServices = initHidAddressServices();
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
      hidServices = initHidSerives();
    }
    return hidServices;
  }
  public HidServices getHidAddressServices() {
    if (hidAddressServices==null) {
      hidAddressServices = initHidAddressServices();
    }
    return hidAddressServices;
  }

  public HidDevice getHidDevice() {
    return getLedgerHidDevice(getHidServices());
  }

  public HidDevice getHidAddressDevice() {
    return getLedgerHidDevice(getHidAddressServices());
  }

  public  HidServices initHidSerives() {
    HidServicesSpecification hidServicesSpecification = new HidServicesSpecification();
    // hidServicesSpecification need the same in the program
    hidServicesSpecification.setAutoStart(false);
    hidServicesSpecification.setAutoDataRead(true);
    hidServicesSpecification.setDataReadInterval(500);
    HidServices hidServices = HidManager.getHidServices(hidServicesSpecification);
    hidServices.addHidServicesListener(LedgerEventListener.getInstance());
    hidServices.start();

    return hidServices;
  }
  public  HidServices initHidAddressServices() {
    HidServicesSpecification hidServicesSpecification = new HidServicesSpecification();
    HidServices hidServices = HidManager.getHidServices(hidServicesSpecification);
    return hidServices;
  }

  public static HidDevice getLedgerHidDevice(HidServices hidServices) {
    List<HidDevice> hidDeviceList = new ArrayList<>();
    HidDevice fidoDevice = null;
    try {
      for (HidDevice hidDevice : hidServices.getAttachedHidDevices()) {
        if (hidDevice.getVendorId() == 0x2c97) {
          hidDeviceList.add(hidDevice);
        }
      }

      if (hidDeviceList.size() > 1) {
        System.out.println(ANSI_RED + "Only one ledger device is supported"+ ANSI_RESET);
        System.out.println(ANSI_RED + "Please check your ledger connection"+ ANSI_RESET);
        return null;
      } else if (hidDeviceList.size()==1) {
        fidoDevice = hidDeviceList.get(0);
      }

      if (fidoDevice == null) {
        System.out.println(ANSI_YELLOW + "No FIDO2 devices attached." + ANSI_RESET);
      } else {
        if (fidoDevice.isClosed()) {
          if (!fidoDevice.open()) {
            throw new IllegalStateException("Unable to open device");
          }
        }
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return fidoDevice;
  }

  public void close() {
    if (hidAddressServices!=null) {
      hidAddressServices.shutdown();
    }
    if (hidServices!=null) {
      hidServices.shutdown();
    }
  }

}
