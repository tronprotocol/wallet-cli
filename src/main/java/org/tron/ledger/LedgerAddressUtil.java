package org.tron.ledger;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LedgerAddressUtil {

  public static String getImportAddress(String path) {
    String importAddress = "";
    TronLedgerGetAddress tronLedgerGetAddress = TronLedgerGetAddress.getInstance();
    try {
      tronLedgerGetAddress.connect();
      importAddress = tronLedgerGetAddress.getTronAddressByPath(path);
    } catch (Exception e) {
      e.printStackTrace();
    } finally {
      tronLedgerGetAddress.close();
    }

    if (org.apache.commons.lang3.StringUtils.isEmpty(importAddress)) {
      System.out.println("Get address from ledger failed !!");
      return "";
    }
    return importAddress;
  }

  public static Map<String, String> getMultiImportAddress(List<String> paths) {
    Map<String, String> addressMap = new HashMap<>();
    TronLedgerGetAddress tronLedgerGetAddress = TronLedgerGetAddress.getInstance();
    try {
      tronLedgerGetAddress.connect();
      for (String path : paths) {
        String importAddress = tronLedgerGetAddress.getTronAddressByPath(path);
        if (org.apache.commons.lang3.StringUtils.isNotEmpty(importAddress)) {
          addressMap.put(path, importAddress);
        } else {
          System.out.println("Get address from ledger failed for path: " + path);
        }
      }
    } catch (Exception e) {
      e.printStackTrace();
    } finally {
      tronLedgerGetAddress.close();
    }
    return addressMap;
  }

}
