package org.tron.core.zen.address;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.tron.common.zksnark.JLibrustzcash;
import org.tron.common.zksnark.JLibsodium;
import org.tron.common.zksnark.JLibsodiumParam;
import org.tron.core.exception.ZksnarkException;

@AllArgsConstructor
public class SpendingKey {

  @Setter
  @Getter
  public byte[] value;

  public ExpandedSpendingKey expandedSpendingKey() throws ZksnarkException {
    return new ExpandedSpendingKey(
        PRF.prfAsk(this.value), PRF.prfNsk(this.value), PRF.prfOvk(this.value));
  }

  public FullViewingKey fullViewingKey() throws ZksnarkException {
    return expandedSpendingKey().fullViewingKey();
  }

  private static class PRF {
    public static final byte[] ZTRON_EXPANDSEED_PERSONALIZATION = {'Z', 't', 'r', 'o', 'n', '_',
        'E', 'x', 'p', 'a', 'n', 'd', 'S', 'e', 'e', 'd'};

    public static byte[] prfAsk(byte[] sk) throws ZksnarkException {
      byte[] ask = new byte[32];
      byte t = 0x00;
      byte[] tmp = prfExpand(sk, t);
      JLibrustzcash.librustzcashToScalar(tmp, ask);
      return ask;
    }

    public static byte[] prfNsk(byte[] sk) throws ZksnarkException {
      byte[] nsk = new byte[32];
      byte t = 0x01;
      byte[] tmp = prfExpand(sk, t);
      JLibrustzcash.librustzcashToScalar(tmp, nsk);
      return nsk;
    }

    public static byte[] prfOvk(byte[] sk) throws ZksnarkException {
      byte[] ovk = new byte[32];
      byte t = 0x02;
      byte[] tmp = prfExpand(sk, t);
      System.arraycopy(tmp, 0, ovk, 0, 32);
      return ovk;
    }

    private static byte[] prfExpand(byte[] sk, byte t) throws ZksnarkException {
      byte[] res = new byte[64];
      byte[] blob = new byte[33];
      System.arraycopy(sk, 0, blob, 0, 32);
      blob[32] = t;
      long state = JLibsodium.initState();
      try {
        JLibsodium.cryptoGenerichashBlake2bInitSaltPersonal(new JLibsodiumParam.Blake2bInitSaltPersonalParams(
            state, null, 0, 64, null, ZTRON_EXPANDSEED_PERSONALIZATION));
        JLibsodium.cryptoGenerichashBlake2bUpdate(new JLibsodiumParam.Blake2bUpdateParams(state, blob, 33));
        JLibsodium.cryptoGenerichashBlake2bFinal(new JLibsodiumParam.Blake2bFinalParams(state, res, 64));
      } finally {
        JLibsodium.freeState(state);
      }
      return res;
    }
  }
}

