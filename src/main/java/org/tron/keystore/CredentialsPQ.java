package org.tron.keystore;

import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.pqc.PQSignature;
import org.tron.walletserver.WalletApi;

/**
 * Credentials wrapper for post-quantum signature keys (FN-DSA-512, ML-DSA-44,
 * ...). Kept off the {@link SignInterface} ECKey/SM2 union deliberately — PQ
 * signing is dispatched per-wallet via {@link WalletFile#getScheme()}.
 */
public class CredentialsPQ implements Credentials {

  private final PQSignature signer;
  private final String address;

  private CredentialsPQ(PQSignature signer, String address) {
    this.signer = signer;
    this.address = address;
  }

  public PQSignature getPQSignature() {
    return signer;
  }

  @Override
  public String getAddress() {
    return address;
  }

  public static CredentialsPQ create(PQSignature signer) {
    String address = WalletApi.encode58Check(signer.getAddress());
    return new CredentialsPQ(signer, address);
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    CredentialsPQ that = (CredentialsPQ) o;
    if (signer != null ? !signer.equals(that.signer) : that.signer != null) {
      return false;
    }
    return address != null ? address.equals(that.address) : that.address == null;
  }

  @Override
  public int hashCode() {
    int result = signer != null ? signer.hashCode() : 0;
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
        return signer.getPersistedPrivateKey();
      }

      @Override
      public byte[] getPubKey() {
        return signer.getPublicKey();
      }

      @Override
      public byte[] getAddress() {
        return signer.getAddress();
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
        return signer.getPersistedPrivateKey();
      }

      @Override
      public org.tron.common.crypto.SignatureInterface sign(byte[] hash) {
        throw new UnsupportedOperationException("Not supported for PQ credentials");
      }
    };
  }
}
