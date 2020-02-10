package org.tron.demo;

import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocol.Transaction;

public class Debug {

  public static void debug(String privateKey, String hexTransaction)
      throws InvalidProtocolBufferException {
    byte[] privateBytes = ByteArray.fromHexString(privateKey);
    Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(hexTransaction));
    byte[] rawData = transaction.getRawData().toByteArray();
    byte[] hash = Sha256Sm3Hash.hash(rawData);
    ECKey ecKey = ECKey.fromPrivate(privateBytes);
    byte[] sign = ecKey.sign(hash).toByteArray();
    transaction.toBuilder().addSignature(ByteString.copyFrom(sign)).build();
  }

  public static void main(String[] args) {
    try {
      debug(
          "77bb18757dd1687574d9d54e32738856e84aefab3a7ae73541ca8ea1912283f9",
          "0a7c0a02b7562208d3df68fd554637b940b8f7e7b6d52c5a65080112610a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412300a15412c20a3c84473df81ee23f84369711bf02cb81b64121541a1220729f9b1734adc923ae44f1dc0a107db0f1b1801");
    } catch (Exception e) {
      System.out.println(e.getMessage());
    }
  }
}
