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

  byte[] getPrivateKey();

  byte[] getPublicKey();

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
   * Default upper-bound check, sufficient for variable-length schemes (FN_DSA_512).
   * Fixed-length schemes override this with strict equality.
   */
  default void validateSignature(byte[] signature) {
    if (signature == null || signature.length == 0 || signature.length > getSignatureLength()) {
      throw new IllegalArgumentException(
          "invalid " + getScheme() + " signature length: "
              + (signature == null ? "null" : signature.length)
              + ", expected 1.." + getSignatureLength());
    }
  }
}
