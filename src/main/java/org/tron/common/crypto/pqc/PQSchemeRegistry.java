package org.tron.common.crypto.pqc;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import org.tron.common.crypto.Hash;
import org.tron.common.utils.DecodeUtil;
import org.tron.protos.Protocol.PQScheme;

/**
 * Static dispatch table for post-quantum signature schemes keyed by
 * {@link PQScheme}. Each entry binds a scheme to its public-key length,
 * signature length, seed length, fingerprint hash function, and stateless
 * sign/verify/keygen operations. Legacy ECDSA secp256k1 / SM2 schemes are NOT
 * registered — they flow through the existing {@code SignInterface} path.
 *
 * <p><b>Address binding (V2).</b> A PQ-derived TRON address is
 * {@code 0x41 ‖ deriveHash(scheme, public_key)[12..32]}, matching the ECDSA
 * flow's {@code 0x41 ‖ Keccak-256(public_key)[12..32]} so PQ and ECDSA
 * addresses share the same derivation shape. The hash function is scheme-
 * specific (see {@link #deriveHash}); {@code FN_DSA_512} uses Keccak-256.
 *
 * <p><b>Wire-format default.</b> {@code UNKNOWN_PQ_SCHEME = 0} is the proto3
 * default (reserved for the {@code UNKNOWN_} API-evolution slot) and is
 * rejected by {@link #contains(PQScheme)} / {@link #require(PQScheme)} —
 * callers must specify a concrete scheme.
 */
public final class PQSchemeRegistry {

  /** Stateless sign/verify/keygen dispatch bound to a single PQ scheme. */
  public interface SignatureOps {
    byte[] sign(byte[] privateKey, byte[] message);

    boolean verify(byte[] publicKey, byte[] message, byte[] signature);

    PQSignature fromSeed(byte[] seed);

    PQSignature fromKeypair(byte[] privateKey, byte[] publicKey);

    /**
     * Rebuilds a {@link PQSignature} from the byte form persisted by the
     * keystore (see {@link PQSignature#getPersistedPrivateKey()}). For schemes
     * whose encoded private key alone determines the public key this just
     * derives the public half. For FN-DSA-512 the input is the extended form
     * {@code f ‖ g ‖ F ‖ h}.
     */
    PQSignature fromPersistedPrivateKey(byte[] persistedPrivateKey);

    /** Returns the length in bytes of the form returned by {@link #fromPersistedPrivateKey}. */
    int persistedPrivateKeyLength();
  }

  /**
   * Fingerprint hash used to derive a 21-byte TRON address from a PQ public key.
   * V2 first launch uses Keccak-256 for FN_DSA_512 to match the ECDSA address
   * derivation; later schemes may bind to a different hash if the PQ scheme has
   * its own canonical fingerprint.
   */
  public interface FingerprintHash {
    /** Returns the full digest of {@code data} (no truncation). */
    byte[] digest(byte[] data);
  }

  private static final FingerprintHash KECCAK_256 = Hash::sha3;

  private static final class SchemeInfo {
    final int privateKeyLength;
    final int publicKeyLength;
    final int signatureLength;
    final int signatureMinLength;
    final int seedLength;
    final FingerprintHash hash;
    final SignatureOps ops;

    SchemeInfo(int privateKeyLength, int publicKeyLength, int signatureLength,
        int signatureMinLength, int seedLength, FingerprintHash hash, SignatureOps ops) {
      this.privateKeyLength = privateKeyLength;
      this.publicKeyLength = publicKeyLength;
      this.signatureLength = signatureLength;
      this.signatureMinLength = signatureMinLength;
      this.seedLength = seedLength;
      this.hash = hash;
      this.ops = ops;
    }
  }

  private static final Map<PQScheme, SchemeInfo> SCHEMES;

  static {
    EnumMap<PQScheme, SchemeInfo> m = new EnumMap<>(PQScheme.class);
    m.put(PQScheme.FN_DSA_512, new SchemeInfo(
        FNDSA512.PRIVATE_KEY_LENGTH, FNDSA512.PUBLIC_KEY_LENGTH,
        FNDSA512.SIGNATURE_LENGTH, FNDSA512.SIGNATURE_MIN_LENGTH,
        FNDSA512.SEED_LENGTH,
        KECCAK_256,
        new SignatureOps() {
          @Override
          public byte[] sign(byte[] privateKey, byte[] message) {
            return FNDSA512.sign(privateKey, message);
          }

          @Override
          public boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
            return FNDSA512.verify(publicKey, message, signature);
          }

          @Override
          public PQSignature fromSeed(byte[] seed) {
            return new FNDSA512(seed);
          }

          @Override
          public PQSignature fromKeypair(byte[] privateKey, byte[] publicKey) {
            return new FNDSA512(privateKey, publicKey);
          }

          @Override
          public PQSignature fromPersistedPrivateKey(byte[] persistedPrivateKey) {
            return FNDSA512.fromPrivateKeyWithPublicKey(persistedPrivateKey);
          }

          @Override
          public int persistedPrivateKeyLength() {
            return FNDSA512.PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH;
          }
        }));
    m.put(PQScheme.ML_DSA_44, new SchemeInfo(
        MLDSA44.PRIVATE_KEY_LENGTH, MLDSA44.PUBLIC_KEY_LENGTH,
        MLDSA44.SIGNATURE_LENGTH, MLDSA44.SIGNATURE_LENGTH,
        MLDSA44.SEED_LENGTH,
        KECCAK_256,
        new SignatureOps() {
          @Override
          public byte[] sign(byte[] privateKey, byte[] message) {
            return MLDSA44.sign(privateKey, message);
          }

          @Override
          public boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
            return MLDSA44.verify(publicKey, message, signature);
          }

          @Override
          public PQSignature fromSeed(byte[] seed) {
            return new MLDSA44(seed);
          }

          @Override
          public PQSignature fromKeypair(byte[] privateKey, byte[] publicKey) {
            return new MLDSA44(privateKey, publicKey);
          }

          @Override
          public PQSignature fromPersistedPrivateKey(byte[] persistedPrivateKey) {
            byte[] pk = MLDSA44.derivePublicKey(persistedPrivateKey);
            return new MLDSA44(persistedPrivateKey, pk);
          }

          @Override
          public int persistedPrivateKeyLength() {
            return MLDSA44.PRIVATE_KEY_LENGTH;
          }
        }));
    SCHEMES = Collections.unmodifiableMap(m);
  }

  private PQSchemeRegistry() {
  }

  public static boolean contains(PQScheme scheme) {
    return scheme != null && SCHEMES.containsKey(scheme);
  }

  public static int getPrivateKeyLength(PQScheme scheme) {
    return require(scheme).privateKeyLength;
  }

  public static int getPublicKeyLength(PQScheme scheme) {
    return require(scheme).publicKeyLength;
  }

  public static int getSignatureLength(PQScheme scheme) {
    return require(scheme).signatureLength;
  }

  public static int getSeedLength(PQScheme scheme) {
    return require(scheme).seedLength;
  }

  /**
   * Per-scheme signature-length predicate. Variable-length schemes
   * ({@code FN_DSA_512}) accept any length in
   * {@code [getSignatureMinLength, getSignatureLength]}; fixed-length schemes
   * collapse that range to a single value.
   */
  public static boolean isValidSignatureLength(PQScheme scheme, int length) {
    SchemeInfo info = require(scheme);
    return length >= info.signatureMinLength && length <= info.signatureLength;
  }

  public static byte[] sign(PQScheme scheme, byte[] privateKey, byte[] message) {
    return require(scheme).ops.sign(privateKey, message);
  }

  public static boolean verify(
      PQScheme scheme, byte[] publicKey, byte[] message, byte[] signature) {
    return require(scheme).ops.verify(publicKey, message, signature);
  }

  public static PQSignature fromSeed(PQScheme scheme, byte[] seed) {
    return require(scheme).ops.fromSeed(seed);
  }

  public static PQSignature fromPersistedPrivateKey(
      PQScheme scheme, byte[] persistedPrivateKey) {
    return require(scheme).ops.fromPersistedPrivateKey(persistedPrivateKey);
  }

  public static int getPersistedPrivateKeyLength(PQScheme scheme) {
    return require(scheme).ops.persistedPrivateKeyLength();
  }

  /**
   * Build a keypair-bound {@link PQSignature} from already-derived private and
   * public key bytes. Used by the witness-config path when the operator has
   * pre-computed the keypair off-line and wants to bypass on-node keygen.
   * Validates {@code privateKey} and {@code publicKey} lengths against the
   * scheme; cryptographic consistency between the two halves is the caller's
   * responsibility.
   */
  public static PQSignature fromKeypair(
      PQScheme scheme, byte[] privateKey, byte[] publicKey) {
    return require(scheme).ops.fromKeypair(privateKey, publicKey);
  }

  /**
   * Scheme-dispatched fingerprint hash of a PQ public key. Returns the full
   * digest; callers truncate to 20 bytes when deriving the address suffix.
   */
  public static byte[] deriveHash(PQScheme scheme, byte[] publicKey) {
    SchemeInfo info = require(scheme);
    if (publicKey == null || publicKey.length != info.publicKeyLength) {
      throw new IllegalArgumentException(
          "invalid public key length for " + scheme + ": "
              + (publicKey == null ? -1 : publicKey.length));
    }
    return info.hash.digest(publicKey);
  }

  /**
   * Derive the 21-byte TRON address from a PQ public key as
   * {@code 0x41 ‖ deriveHash(scheme, public_key)[12..32]} — the rightmost 20
   * bytes of the digest, matching the ECDSA address derivation slice.
   */
  public static byte[] computeAddress(PQScheme scheme, byte[] publicKey) {
    byte[] h = deriveHash(scheme, publicKey);
    if (h.length < 20) {
      throw new IllegalStateException(
          "deriveHash returned " + h.length + " bytes, need at least 20 for address derivation");
    }
    byte[] addr = new byte[21];
    addr[0] = DecodeUtil.addressPreFixByte;
    System.arraycopy(h, h.length - 20, addr, 1, 20);
    return addr;
  }

  private static SchemeInfo require(PQScheme scheme) {
    if (scheme == null) {
      throw new IllegalArgumentException("scheme must not be null");
    }
    SchemeInfo info = SCHEMES.get(scheme);
    if (info == null) {
      throw new IllegalArgumentException(
          "no PQSignature registered for scheme: " + scheme);
    }
    return info;
  }
}
