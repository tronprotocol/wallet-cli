package org.tron.ledger;

import lombok.Getter;
import org.hid4java.HidDevice;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;

import static org.tron.ledger.sdk.CommonUtil.bytesToHex;
import static org.tron.ledger.sdk.LedgerConstant.DEFAULT_PATH;

public class TronLedgerSignTrans {
  private static final int LEDGER_VENDOR_ID = 0x2c97;

  private final HidServices hidServices;
  @Getter
  private HidDevice device;

  private TronLedgerSignTrans() {
    HidServicesSpecification spec = new HidServicesSpecification();
    hidServices = HidManager.getHidServices(spec);
    hidServices.start();
  }

  private static class Holder {
    private static final TronLedgerSignTrans INSTANCE = new TronLedgerSignTrans();
  }

  public static TronLedgerSignTrans getInstance() {
    return TronLedgerSignTrans.Holder.INSTANCE;
  }

  public void connect() {
    for (HidDevice dev : hidServices.getAttachedHidDevices()) {
      if (dev.getVendorId() == LEDGER_VENDOR_ID) {
        device = dev;
        if (!device.open()) {
          throw new RuntimeException("Failed to open device");
        }
        System.out.println("Connected to Ledger device");
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

  public static byte[] signTronTransaction(String transactionRaw, String path) {
    TronLedgerSignTrans ledger = TronLedgerSignTrans.getInstance();
    try {
      ledger.connect();
      byte[] apdu = ApduMessageBuilder.buildTransactionSignApduMessage(path, transactionRaw);
      byte[] result = ApduExchangeHandler.exchangeApdu(ledger.getDevice(), apdu);
      return result;
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      e.printStackTrace();
    } finally {
      ledger.close();
    }
    return null;
  }

  public static void main(String[] args) {
    String transactionRaw = "5a68080112640a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412330a15410547286e6b520b6e77df7a6b1c4d2184d04866d3121541ccf2f3d3d97bb7dc6d89353bd2b5a956eda5c4ad1880c2d72f";
    String path = DEFAULT_PATH;
    byte[] result = signTronTransaction(transactionRaw, path);
    System.out.println("Response: " + bytesToHex(result));
  }
}
