package org.tron.ledger;

import org.hid4java.HidDevice;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.HidServicesWrapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LedgerAddressUtil {

  public static String getImportAddress(HidDevice device, String path) {
    String importAddress = "";
    TronLedgerGetAddress tronLedgerGetAddress = TronLedgerGetAddress.getInstance();
    try {
      importAddress = tronLedgerGetAddress.getTronAddressByPath(device, path);
    } catch (Exception e) {
      e.printStackTrace();
    }

    if (org.apache.commons.lang3.StringUtils.isEmpty(importAddress)) {
      System.out.println("Get address from ledger failed !!");
      return "";
    }
    return importAddress;
  }

  public static Map<String, String> getMultiImportAddress(HidDevice device, List<String> paths) {
    Map<String, String> addressMap = new HashMap<>();
    TronLedgerGetAddress tronLedgerGetAddress = TronLedgerGetAddress.getInstance();
    try {
      //tronLedgerGetAddress.connect();
      for (String path : paths) {
        String importAddress = tronLedgerGetAddress.getTronAddressByPath(device, path);
        if (org.apache.commons.lang3.StringUtils.isNotEmpty(importAddress)) {
          addressMap.put(path, importAddress);
        } else {
          System.out.println("Get address from ledger failed for path: " + path);
        }
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return addressMap;
  }

}
