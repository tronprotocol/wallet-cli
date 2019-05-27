package org.tron.core.zen;

import java.util.Arrays;
import java.util.Optional;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.omg.Messaging.SYNC_WITH_TRANSPORT;
import org.tron.common.utils.ByteArray;
import org.tron.core.zen.address.Constant;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.IncomingViewingKey;
import org.tron.core.zen.address.PaymentAddress;
import org.tron.core.zen.address.SpendingKey;

@AllArgsConstructor
public class ShieldAddressInfo {

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

  public ShieldAddressInfo(){
  }

  /**
   * 保存每个匿名地址时，做参数校验
   * @return
   */
  public boolean validateCheck() {
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
  }

  /**
   * TODO 获取匿名地址，后续这里需要调整
   * @return
   */
  public String getAddress() {
    if (d != null && d.getData().length > 0 && pkD!= null && pkD.length >0 ) {
      byte[] byteAddress = new byte[d.getData().length + pkD.length ];
      System.arraycopy(d.getData(), 0, byteAddress, 0, d.getData().length);
      System.arraycopy(pkD, 0, byteAddress, d.getData().length, pkD.length);

      return ByteArray.toHexString(byteAddress);
    } else {
      return "";
    }
  }

  /**
   * 通过参数获取匿名地址
   * @param d
   * @param pkD
   * @return
   */
  public static String getShieldAddress(DiversifierT d, byte[] pkD ) {
    if (d != null && d.getData().length > 0 && pkD!= null && pkD.length >0 ) {
      byte[] byteAddress = new byte[d.getData().length + pkD.length ];
      System.arraycopy(d.getData(), 0, byteAddress, 0, d.getData().length);
      System.arraycopy(pkD, 0, byteAddress, d.getData().length, pkD.length);

      return ByteArray.toHexString(byteAddress);
    } else {
      return "";
    }
  }


  /**
   * TODO 获取匿名地址，后续这里需要调整
   * @return
   */
  public static PaymentAddress parseFromShieldAddress(final String shieldAddress) {
    PaymentAddress paymentAddress = null;
    try {
      byte[] byteShield = ByteArray.fromHexString(shieldAddress);
      int lenPkd = byteShield.length - Constant.ZC_DIVERSIFIER_SIZE;
      byte[] d =  new byte[Constant.ZC_DIVERSIFIER_SIZE];
      byte[] pkd = new byte[lenPkd];

      System.arraycopy(byteShield, 0, d, 0, Constant.ZC_DIVERSIFIER_SIZE);
      System.arraycopy(byteShield, Constant.ZC_DIVERSIFIER_SIZE, pkd, 0, lenPkd);

      paymentAddress = new PaymentAddress(new DiversifierT(d), pkd);
    } catch (Exception e) {
      System.out.println("parseFromShieldAddress " + shieldAddress + " failure.");
    }

    return paymentAddress;
  }

  /**
   * 获取格式化的，加密信息
   * TODO  暂时仅格式化下
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
   * 从密文中获取一个有效的地址信息
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
