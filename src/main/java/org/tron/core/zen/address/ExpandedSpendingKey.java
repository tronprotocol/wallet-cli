package org.tron.core.zen.address;

import com.google.protobuf.ByteString;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.tron.api.GrpcAPI.BytesMessage;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.ZksnarkException;
import org.tron.walletserver.WalletApi;

import java.util.Optional;

@Slf4j(topic = "shieldTransaction")
@AllArgsConstructor
public class ExpandedSpendingKey {

  @Setter
  @Getter
  byte[] ask; // the spend authorizing key,256
  @Setter
  @Getter
  byte[] nsk; // the proof authorizing key (ak, nsk),256
  // Let ovk be an outgoing viewing key that is intended to be able to decrypt this payment
  @Setter
  @Getter
  byte[] ovk; // the outgoing viewing key,256

  public ExpandedSpendingKey() {
  }

  public static byte[] getAkFromAsk(byte[] ask) throws ZksnarkException {
    BytesMessage ask1 = BytesMessage.newBuilder().setValue(ByteString.copyFrom(ask)).build();
    Optional<BytesMessage> ak = WalletApi.getAkFromAsk(ask1);
    if (!ak.isPresent()) {
      throw new ZksnarkException("getAkFromAsk failed !!!");
    } else {
      return ak.get().getValue().toByteArray();
    }
  }

  public static byte[] getNkFromNsk(byte[] nsk) throws ZksnarkException {

    BytesMessage nsk1 = BytesMessage.newBuilder().setValue(ByteString.copyFrom(nsk)).build();
    Optional<BytesMessage> nk = WalletApi.getNkFromNsk(nsk1);
    if (!nk.isPresent()) {
      throw new ZksnarkException("getNkFromNsk failed !!!");
    } else {
      return nk.get().getValue().toByteArray();
    }
  }

  public static ExpandedSpendingKey decode(byte[] m_bytes) {
    ExpandedSpendingKey key = new ExpandedSpendingKey();

    byte[] ask = ByteArray.subArray(m_bytes, 0, 32);
    byte[] nsk = ByteArray.subArray(m_bytes, 32, 64);
    byte[] ovk = ByteArray.subArray(m_bytes, 64, 96);
    key.setAsk(ask);
    key.setNsk(nsk);
    key.setOvk(ovk);
    return key;
  }

  public FullViewingKey fullViewingKey() throws ZksnarkException {
    byte[] ak = getAkFromAsk(ask); // 256
    byte[] nk = getNkFromNsk(nsk); // 256

    return new FullViewingKey(ak, nk, ovk);
  }

  public byte[] encode() {
    byte[] m_bytes = new byte[96];
    System.arraycopy(ask, 0, m_bytes, 0, 32);
    System.arraycopy(nsk, 0, m_bytes, 32, 32);
    System.arraycopy(ovk, 0, m_bytes, 64, 32);

    return m_bytes;
  }
}
