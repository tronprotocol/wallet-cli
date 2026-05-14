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

  /**
   * PQ credentials are not part of the ECKey/SM2 SignInterface dispatch.
   * The signing path branches on {@link WalletFile#getScheme()} before
   * reaching any caller that touches {@code getPair()}.
   */
  @Override
  public SignInterface getPair() {
    throw new UnsupportedOperationException(
        "Falcon (FN_DSA_512) credentials are not exposed via SignInterface; "
            + "use getFNDSA512() and the PQ signing path.");
  }
}
