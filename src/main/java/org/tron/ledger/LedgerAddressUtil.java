package org.tron.ledger;

import org.tron.ledger.wrapper.DebugConfig;

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
      System.out.println("Get address from Ledger failed !!");
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

        long startTime = System.currentTimeMillis();
        String importAddress = tronLedgerGetAddress.getTronAddressByPath(path);
        long endTime = System.currentTimeMillis();
        if (DebugConfig.isDebugEnabled()) {
          long duration = endTime - startTime;
          System.out.println("get address by path: "+path+", cost time: " + duration + " ms");
        }

        if (org.apache.commons.lang3.StringUtils.isNotEmpty(importAddress)) {
          addressMap.put(path, importAddress);
        } else {
          System.out.println("Get address from Ledger failed for path: " + path);
          break;
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
