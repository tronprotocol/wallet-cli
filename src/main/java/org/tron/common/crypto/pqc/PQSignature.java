package org.tron.common.crypto.pqc;

import org.tron.protos.Protocol.PQScheme;

/**
 * Post-quantum signature scheme facade bound to a keypair. Instance methods
 * (sign/verify/getAddress/getPublicKey/getPrivateKey) operate on the held
 * keypair. Stateless dispatch by {@link PQScheme} is provided by
 * {@link PQSchemeRegistry}.
 */
public interface PQSignature {

  PQScheme getScheme();

  int getPrivateKeyLength();

  int getPublicKeyLength();

  int getSignatureLength();

  /**
   * Minimum syntactically well-formed signature length. Defaults to
   * {@link #getSignatureLength()} for fixed-length schemes; variable-length
   * schemes (e.g. FN-DSA-512) override.
   */
  default int getSignatureMinLength() {
    return getSignatureLength();
  }

  byte[] getPrivateKey();

  byte[] getPublicKey();

  /**
   * Returns the byte form persisted by the keystore. For schemes whose encoded
   * private key alone suffices to recover the public key (e.g. ML-DSA-44) this
   * is just {@link #getPrivateKey()}. For schemes that need the public key
   * appended to recover the keypair without re-running keygen (e.g. FN-DSA-512
   * — see {@code bcgit/bc-java#2297}) this returns the extended encoding
   * {@code privateKey ‖ publicKey}.
   */
  default byte[] getPersistedPrivateKey() {
    return getPrivateKey();
  }

  /**
   * 21-byte TRON address derived from the held public key as
   * {@code 0x41 ‖ deriveHash(scheme, public_key)[12..32]} (see
   * {@link PQSchemeRegistry#computeAddress}).
   */
  byte[] getAddress();

  /** Sign {@code message} with the held private key; returns the raw signature. */
  byte[] sign(byte[] message);

  /**
   * Verify {@code signature} over {@code message} against the held public key.
   *
   * @return true iff the signature is cryptographically valid for the bound keypair
   */
  boolean verify(byte[] message, byte[] signature);

  default void validatePrivateKey(byte[] privateKey) {
    if (privateKey == null || privateKey.length != getPrivateKeyLength()) {
      throw new IllegalArgumentException(
          "invalid " + getScheme() + " private key length: "
              + (privateKey == null ? "null" : privateKey.length)
              + ", expected " + getPrivateKeyLength());
    }
  }

  default void validatePublicKey(byte[] publicKey) {
    if (publicKey == null || publicKey.length != getPublicKeyLength()) {
      throw new IllegalArgumentException(
          "invalid " + getScheme() + " public key length: "
              + (publicKey == null ? "null" : publicKey.length)
              + ", expected " + getPublicKeyLength());
    }
  }

  /**
   * Default range check, sufficient for variable-length schemes (FN_DSA_512).
   * Fixed-length schemes override {@link #getSignatureMinLength()} to equal
   * {@link #getSignatureLength()}, which collapses this to a strict equality.
   */
  default void validateSignature(byte[] signature) {
    int min = getSignatureMinLength();
    int max = getSignatureLength();
    if (signature == null || signature.length < min || signature.length > max) {
      throw new IllegalArgumentException(
          "invalid " + getScheme() + " signature length: "
              + (signature == null ? "null" : signature.length)
              + ", expected " + min + ".." + max);
    }
  }
}
