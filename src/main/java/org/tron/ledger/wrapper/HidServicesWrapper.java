package org.tron.ledger.wrapper;

import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.tron.ledger.listener.LedgerEventListener;

import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;

public class HidServicesWrapper {
  private HidServices hidServices;

  private HidServicesWrapper() {
    if (hidServices==null) {
      hidServices = initHidSerives();
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

  public HidDevice getHidDevice() {
    return getLedgerHidDevice(getHidServices());
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

  public static HidDevice getLedgerHidDevice(HidServices hidServices) {
    HidDevice fidoDevice = null;
    try {
      for (HidDevice hidDevice : hidServices.getAttachedHidDevices()) {
        if ( hidDevice.getVendorId() == 0x2c97) {
          fidoDevice = hidDevice;
          break;
        }
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

}
