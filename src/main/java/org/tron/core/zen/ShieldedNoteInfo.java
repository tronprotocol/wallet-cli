package org.tron.core.zen;

import io.netty.util.internal.StringUtil;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CipherException;

@AllArgsConstructor
public class ShieldedNoteInfo {
  @Setter
  @Getter
  public long value = 0;
  @Setter
  @Getter
  public String paymentAddress;
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
  @Getter
  public long noteIndex;
  @Setter
  @Getter
  public  byte[] memo;

  public ShieldedNoteInfo(){
  }

  /**
   * format shielded note to a string
   * @return
   */
  public String encode(byte[] encryptKey) throws CipherException {
    String encodeString = noteIndex +";";
    encodeString += paymentAddress;
    encodeString += ";";
    encodeString += ByteArray.toHexString(r);
    encodeString += ";";
    encodeString += trxId;
    encodeString += ";";
    encodeString += String.valueOf(value);
    encodeString += ";";
    encodeString += String.valueOf(index);
    encodeString += ";";
    String stringMemo = ByteArray.toHexString(memo);
    if (StringUtil.isNullOrEmpty(stringMemo)) {
      encodeString += "null";
    } else {
      encodeString += stringMemo;
    }
    byte[] chipherText = ZenUtils.aesCtrEncrypt(encodeString.getBytes(), encryptKey);
    encodeString = Base58.encode(chipherText);
    return encodeString;
  }

  /**
   * parse string to get shielded note
   * @param data
   * @return
   */
  public boolean decode(String data, byte[] encryptKey) throws CipherException {
    byte[] chipherText = Base58.decode(data);
    byte[] text = ZenUtils.aesCtrDecrypt(chipherText, encryptKey);
    data = new String(text);

    String[] sourceStrArray = data.split(";");
    if (sourceStrArray.length != 7) {
      System.out.println("len is not right.");
      return false;
    }
    noteIndex = Long.valueOf(sourceStrArray[0]);
    paymentAddress = sourceStrArray[1];
    r = ByteArray.fromHexString(sourceStrArray[2]);
    trxId = sourceStrArray[3];
    value = Long.valueOf(sourceStrArray[4]);
    index = Integer.valueOf(sourceStrArray[5]);
    if (sourceStrArray[6].equals("null")) {
      memo = ByteArray.fromHexString("");
    } else {
      memo = ByteArray.fromHexString(sourceStrArray[6]);
    }
    return true;
  }
}
