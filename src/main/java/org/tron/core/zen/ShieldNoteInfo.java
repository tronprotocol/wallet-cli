package org.tron.core.zen;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.common.utils.ByteArray;
import org.tron.core.zen.address.DiversifierT;

@AllArgsConstructor
public class ShieldNoteInfo {
  @Setter
  @Getter
  public long value = 0;
  @Setter
  @Getter
  public DiversifierT d;
  @Setter
  @Getter
  public byte[] pkD; // 256
  @Setter
  @Getter
  public byte[] r; // 256
  @Setter
  @Getter
  public String trxId;
  @Setter
  @Getter
  public int index;
  @Setter
  @Getter  //分开保存，这里参数没用到
  public boolean isSpend = false;

  public ShieldNoteInfo(){
  }

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
   * 获取格式化的，加密信息
   * TODO  暂时仅格式化下
   * @return
   */
  public String encode() {
    String encodeString = "";
    if ( isSpend ) {
      encodeString += "1;";
    } else {
      encodeString += "0;";
    }
    encodeString += ByteArray.toHexString(d.getData());
    encodeString += ";";
    encodeString += ByteArray.toHexString(pkD);
    encodeString += ";";
    encodeString += ByteArray.toHexString(r);
    encodeString += ";";
    encodeString += trxId;
    encodeString += ";";
    encodeString += String.valueOf(value);
    encodeString += ";";
    encodeString += String.valueOf(index);
    return encodeString;
  }

  /**
   * 从密文中获取一个Note信息
   * @param data
   * @return
   */
  public boolean decode(final String data) {
    String[] sourceStrArray = data.split(";");
    if (sourceStrArray.length != 7) {
      System.out.println("len is not right.");
      return false;
    }
    isSpend = Boolean.valueOf(sourceStrArray[0]);
    d = new DiversifierT(ByteArray.fromHexString(sourceStrArray[1]));
    pkD = ByteArray.fromHexString(sourceStrArray[2]);
    r = ByteArray.fromHexString(sourceStrArray[3]);
    trxId = sourceStrArray[4];
    value = Long.valueOf(sourceStrArray[5]);
    index = Integer.valueOf(sourceStrArray[6]);
    return true;
  }

}
