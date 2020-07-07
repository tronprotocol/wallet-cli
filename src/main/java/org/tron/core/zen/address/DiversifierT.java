package org.tron.core.zen.address;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.api.GrpcAPI.DiversifierMessage;
import org.tron.walletserver.WalletApi;

import java.util.Optional;

@AllArgsConstructor
public class DiversifierT {
  public static final int ZC_DIVERSIFIER_SIZE = 11;

  @Setter
  @Getter
  private byte[] data = new byte[ZC_DIVERSIFIER_SIZE];

  public DiversifierT() {
  }

  public DiversifierT random() {
    Optional<DiversifierMessage> diversifierMessage;
    while ( true ) {
      diversifierMessage = WalletApi.getDiversifier();
      if (diversifierMessage.isPresent()) {
        break;
      }
    }
    this.data = diversifierMessage.get().getD().toByteArray();
    return this;
  }
}
