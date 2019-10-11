package org.tron.core.zen.address;

import com.google.protobuf.ByteString;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.api.GrpcAPI.IncomingViewingKeyMessage;
import org.tron.api.GrpcAPI.ViewingKeyMessage;
import org.tron.core.exception.ZksnarkException;
import org.tron.walletserver.WalletApi;

import java.util.Optional;

@AllArgsConstructor
public class FullViewingKey {

  @Getter
  @Setter
  private byte[] ak; // 256
  @Getter
  @Setter
  private byte[] nk; // 256
  @Getter
  @Setter
  private byte[] ovk; // 256,the outgoing viewing key

  public static FullViewingKey decode(byte[] data) {
    byte[] ak = new byte[32];
    byte[] nk = new byte[32];
    byte[] ovk = new byte[32];
    System.arraycopy(data, 0, ak, 0, 32);
    System.arraycopy(data, 32, nk, 0, 32);
    System.arraycopy(data, 64, ovk, 0, 32);

    return new FullViewingKey(ak, nk, ovk);
  }

  public IncomingViewingKey inViewingKey() throws ZksnarkException {
    ViewingKeyMessage vk = ViewingKeyMessage.newBuilder()
        .setAk(ByteString.copyFrom(ak))
        .setNk(ByteString.copyFrom(nk))
        .build();

    Optional<IncomingViewingKeyMessage> ivk = WalletApi.getIncomingViewingKey(vk);
    if (!ivk.isPresent()) {
      throw new ZksnarkException("getIncomingViewingKey failed !!!");
    } else {
      return new IncomingViewingKey(ivk.get().getIvk().toByteArray());
    }
  }

  public byte[] encode() {
    byte[] m_bytes = new byte[96];
    System.arraycopy(ak, 0, m_bytes, 0, 32);
    System.arraycopy(nk, 0, m_bytes, 32, 32);
    System.arraycopy(ovk, 0, m_bytes, 64, 32);

    return m_bytes;
  }
}
