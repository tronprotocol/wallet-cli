package org.tron.ledger.sdk;

import static org.tron.ledger.sdk.CommonUtil.hexStringToByteArray;

public class ApduMessageBuilder {

  public static byte[] buildTronAddressApduMessage(String path) {
    String donglePathHex = BIP32PathParser.convertBip32PathToHex(path);
    StringBuilder apduMessage = new StringBuilder();
    apduMessage.append("e0020000");
    int bytesLength = donglePathHex.length() / 2;
    String lengthHex = String.format("%02x", bytesLength + 1);
    int segments = donglePathHex.length() / 4 / 2;
    String segmentsHex = String.format("%02x", segments);
    apduMessage.append(lengthHex);
    apduMessage.append(segmentsHex);
    apduMessage.append(donglePathHex);
    return hexStringToByteArray(apduMessage.toString());
  }

  public static byte[] buildTransactionSignApduMessage(String path, String transactionRaw) {
    String donglePath = BIP32PathParser.convertBip32PathToHex(path);
    int pathByteLength = donglePath.length() / 2;
    int transactionByteLength = transactionRaw.length() / 2;
    String totalLength = String.format("%02x", pathByteLength + 1 + transactionByteLength);
    String pathSegments = String.format("%02x", donglePath.length() / 8);
    String apduMessage = "e0041000" + totalLength + pathSegments + donglePath + transactionRaw;
    return hexStringToByteArray(apduMessage);
  }
}
