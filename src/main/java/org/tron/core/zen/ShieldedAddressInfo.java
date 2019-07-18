package org.tron.core.zen;

import java.util.Arrays;
import java.util.Optional;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.ZksnarkException;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.IncomingViewingKey;
import org.tron.core.zen.address.KeyIo;
import org.tron.core.zen.address.PaymentAddress;
import org.tron.core.zen.address.SpendingKey;

@AllArgsConstructor
public class ShieldedAddressInfo {

  @Setter
  @Getter
  public byte[] sk;
  @Setter
  @Getter
  public byte[] ivk; // 256
  @Setter
  @Getter
  public byte[] ovk; // 256
  @Setter
  @Getter
  DiversifierT d;
  @Setter
  @Getter
  byte[] pkD; // 256

  public ShieldedAddressInfo(){
  }

  public FullViewingKey getFullViewingKey() throws ZksnarkException {
    SpendingKey spendingKey = new SpendingKey(sk);
    return spendingKey.fullViewingKey();
  }

  /**
   * check parameters
   * @return
   */
  public boolean validateCheck() {
    try {
      SpendingKey spendingKey = new SpendingKey(sk);
      FullViewingKey fullViewingKey = spendingKey.fullViewingKey();
      if (!Arrays.equals(fullViewingKey.getOvk(), ovk)) {
        System.out.println("ovk check failure!");
        return false;
      }
      IncomingViewingKey incomingViewingKey = fullViewingKey.inViewingKey();
      if (!Arrays.equals(incomingViewingKey.getValue(), ivk)) {
        System.out.println("ivk check failure!");
        return false;
      }
      Optional<PaymentAddress> optionalPaymentAddress = incomingViewingKey.address(d);
      if (!optionalPaymentAddress.isPresent()
          || !Arrays.equals(optionalPaymentAddress.get().getPkD(), pkD)) {
        System.out.println("pkd check failure!");
        return false;
      }
      return true;
    } catch (Exception e) {
      e.printStackTrace();
    }
    return false;
  }

  public String getAddress() {
    return getShieldedAddress(d, pkD);
  }

  public static String getShieldedAddress(DiversifierT d, byte[] pkD ) {
    try {
      PaymentAddress paymentAddress = new PaymentAddress(d, pkD);
      return KeyIo.encodePaymentAddress(paymentAddress);
    } catch (Exception e ) {
      e.printStackTrace();
    }
    return "";
  }

  /**
   * format shielded address info to a string
   * @return
   */
  public String encode() {
    String encodeString = ByteArray.toHexString(sk) + ";";
    encodeString += ByteArray.toHexString(ivk);
    encodeString += ";";
    encodeString += ByteArray.toHexString(ovk);
    encodeString += ";";
    encodeString += ByteArray.toHexString(d.getData());
    encodeString += ";";
    encodeString += ByteArray.toHexString(pkD);
    return encodeString;
  }

  /**
   * parse string to get a shielded address info
   * @param data
   * @return
   */
  public boolean decode(final String data) {
    String[] sourceStrArray = data.split(";");
    if (sourceStrArray.length != 5) {
      System.out.println("len is not right.");
      return false;
    }
    sk = ByteArray.fromHexString(sourceStrArray[0]);
    ivk = ByteArray.fromHexString(sourceStrArray[1]);
    ovk = ByteArray.fromHexString(sourceStrArray[2]);
    d = new DiversifierT(ByteArray.fromHexString(sourceStrArray[3]));
    pkD = ByteArray.fromHexString(sourceStrArray[4]);

    if (validateCheck()) {
      return true;
    } else {
      return false;
    }
  }
}
