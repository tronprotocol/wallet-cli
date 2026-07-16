package org.tron.ledger;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.apache.commons.lang3.StringUtils.isEmpty;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.ledger.LedgerConst.READ_TIMEOUT_MILLIS;
import static org.tron.ledger.LedgerConst.TOTAL_WAIT_TIMEOUT_MILLIS;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;

import org.hid4java.HidDevice;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerConstant;
import org.tron.ledger.wrapper.DebugConfig;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class LedgerAddressUtil {

  public static String getImportAddress(String path, HidDevice device) {
    String importAddress = "";
    TronLedgerGetAddress tronLedgerGetAddress = TronLedgerGetAddress.getInstance();
    try {
      importAddress = tronLedgerGetAddress.getTronAddressByPath(path, device);
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    } finally {
      tronLedgerGetAddress.close();
    }

    if (isEmpty(importAddress)) {
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get address from Ledger " + failedHighlight() + " !!");
      }
      return EMPTY;
    }
    return importAddress;
  }

  public static Map<String, String> getMultiImportAddress(List<String> paths, HidDevice hidDevice) {
    Map<String, String> addressMap = new HashMap<>();
    for (String path : paths) {
      try {
        long startTime = System.currentTimeMillis();
        String importAddress = TronLedgerGetAddress.getInstance().getTronAddressByPath(path, hidDevice);
        long endTime = System.currentTimeMillis();
        if (DebugConfig.isDebugEnabled()) {
          long duration = endTime - startTime;
          System.out.println("get address by path: " + path + ", cost time: " + duration + " ms");
        }

        if (org.apache.commons.lang3.StringUtils.isNotEmpty(importAddress)) {
          addressMap.put(path, importAddress);
        } else {
          if (DebugConfig.isDebugEnabled()) {
            System.out.println("Get address from Ledger " + failedHighlight() + " for path: " + path);
          }
          break;
        }
      } catch (Exception e) {
        if (DebugConfig.isDebugEnabled()) {
          e.printStackTrace();
        }
        break;
      }
    }
    return addressMap;
  }

  /**
   * Sends the "get address" APDU and returns the raw response bytes without parsing.
   * Returns {@code null} on transport failure. Callers can inspect error status words
   * (e.g. {@code 0x6511} = Tron app not open) before falling through to address parsing.
   */
  public static byte[] getRawAddressResponse(String path, HidDevice hidDevice) {
    try {
      byte[] apdu = ApduMessageBuilder.buildTronAddressApduMessage(path);
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get Address Request: " + path);
      }
      byte[] result = ApduExchangeHandler.exchangeApdu(hidDevice, apdu, READ_TIMEOUT_MILLIS, TOTAL_WAIT_TIMEOUT_MILLIS);
      if (DebugConfig.isDebugEnabled()) {
        System.out.println("Get Address Response: " + CommonUtil.bytesToHex(result));
      }
      return result;
    } catch (Exception e) {
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return null;
    }
  }

  /** Parses a Tron Base58 address from a raw "get address" APDU response. Returns {@code ""} on any parse failure. */
  public static String parseTronAddress(byte[] result) {
    if (result == null || result.length < 2) {
      return EMPTY;
    }
    if (LedgerConstant.LEDGER_LOCK.equalsIgnoreCase(CommonUtil.bytesToHex(result))) {
      System.out.println(ANSI_RED + "Ledger is locked, please unlock it first" + ANSI_RESET);
      return EMPTY;
    }
    try {
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
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
      return EMPTY;
    }
  }

  public static String getTronAddress(String path, HidDevice hidDevice) {
    try {
      byte[] result = getRawAddressResponse(path, hidDevice);
      return parseTronAddress(result);
    } catch (Exception e) {
      System.err.println("Error: " + e.getMessage());
      if (DebugConfig.isDebugEnabled()) {
        e.printStackTrace();
      }
    }
    return EMPTY;
  }

}
