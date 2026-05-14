package org.tron.keystore;

import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.pqc.FNDSA512;
import org.tron.walletserver.WalletApi;

/**
 * Credentials wrapper for Falcon-512 (FN-DSA-512) post-quantum keys. Kept off
 * the {@link SignInterface} ECKey/SM2 union deliberately — PQ signing is
 * dispatched per-wallet via {@link WalletFile#getScheme()}.
 */
public class CredentialsFalcon implements Credentials {

  private final FNDSA512 fnDsa512;
  private final String address;

  private CredentialsFalcon(FNDSA512 fnDsa512, String address) {
    this.fnDsa512 = fnDsa512;
    this.address = address;
  }

  public FNDSA512 getFNDSA512() {
    return fnDsa512;
  }

  @Override
  public String getAddress() {
    return address;
  }

  public static CredentialsFalcon create(FNDSA512 fnDsa512) {
    String address = WalletApi.encode58Check(fnDsa512.getAddress());
    return new CredentialsFalcon(fnDsa512, address);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    CredentialsFalcon that = (CredentialsFalcon) o;
    if (fnDsa512 != null ? !fnDsa512.equals(that.fnDsa512) : that.fnDsa512 != null) {
      return false;
    }
    return address != null ? address.equals(that.address) : that.address == null;
  }

  @Override
  public int hashCode() {
    int result = fnDsa512 != null ? fnDsa512.hashCode() : 0;
    result = 31 * result + (address != null ? address.hashCode() : 0);
    return result;
  }

  @Override
  public SignInterface getPair() {
    return new SignInterface() {
      @Override
      public byte[] hash(byte[] message) {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }

      @Override
      public byte[] getPrivateKey() {
        return fnDsa512.getPrivateKeyWithPublicKey();
      }

      @Override
      public byte[] getPubKey() {
        return fnDsa512.getPublicKey();
      }

      @Override
      public byte[] getAddress() {
        return fnDsa512.getAddress();
      }

      @Override
      public String signHash(byte[] hash) {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }

      @Override
      public byte[] signToAddress(byte[] messageHash, String signatureBase64) throws java.security.SignatureException {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }

      @Override
      public byte[] getNodeId() {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }

      @Override
      public byte[] Base64toBytes(String signature) {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }

      @Override
      public byte[] getPrivKeyBytes() {
        return fnDsa512.getPrivateKeyWithPublicKey();
      }

      @Override
      public org.tron.common.crypto.SignatureInterface sign(byte[] hash) {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }
    };
  }
}
