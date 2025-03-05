package org.tron.ledger.sdk;

import org.hid4java.*;

public class LedgerTronApp {
    /*
  public static void main(String[] args) {

    try {
      HidServicesSpecification hidServicesSpecification = new HidServicesSpecification();
      HidServices hidServices = HidManager.getHidServices(hidServicesSpecification);

      hidServices.start();
      HidDevice ledgerDevice = null;
      for (HidDevice device : hidServices.getAttachedHidDevices()) {
        if (isLedgerDevice(device)) {
          ledgerDevice = device;
          break;
        }
      }

      if (ledgerDevice == null) {
        System.err.println("Ledger device not found.");
        return;
      }

      ledgerDevice.open();

      byte[] apduCommand = buildOpenAppApdu("Tron");

      byte[] result = ApduExchangeHandler.exchangeApdu(ledgerDevice, apduCommand, 1000, 1000);
      if (result ==null ) {
        System.out.println("send open tron app ok");
      }else {
        System.out.println("send open tron app error");
      }

      ledgerDevice.close();
    } catch (Exception e) {
      e.printStackTrace();
    }

  }

  private static boolean isLedgerDevice(HidDevice device) {
    return device.getVendorId() == 0x2c97; // Ledger Vendor ID
  }

  private static byte[] buildOpenAppApdu(String appName) {
    // Build APDU command to open the specified app
    byte[] appNameBytes = appName.getBytes();
    byte[] apdu = new byte[5 + appNameBytes.length];
    apdu[0] = (byte) 0xe0; // CLA
    apdu[1] = (byte) 0xd8; // INS
    apdu[2] = (byte) 0x00; // P1
    apdu[3] = (byte) 0x00; // P2
    apdu[4] = (byte) appNameBytes.length; // LC
    System.arraycopy(appNameBytes, 0, apdu, 5, appNameBytes.length);
    return apdu;
  }
     */
}