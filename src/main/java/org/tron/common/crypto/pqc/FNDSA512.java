package org.tron.common.crypto.pqc;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import org.bouncycastle.crypto.AsymmetricCipherKeyPair;
import org.bouncycastle.crypto.params.ParametersWithRandom;
import org.bouncycastle.crypto.prng.FixedSecureRandom;
import org.bouncycastle.pqc.crypto.falcon.FalconKeyGenerationParameters;
import org.bouncycastle.pqc.crypto.falcon.FalconKeyPairGenerator;
import org.bouncycastle.pqc.crypto.falcon.FalconParameters;
import org.bouncycastle.pqc.crypto.falcon.FalconPrivateKeyParameters;
import org.bouncycastle.pqc.crypto.falcon.FalconPublicKeyParameters;
import org.bouncycastle.pqc.crypto.falcon.FalconSigner;
import org.tron.protos.Protocol.PQScheme;

/**
 * FIPS 206 (draft) FN-DSA / Falcon-512 keypair-bound signer/verifier. Instance
 * methods sign/verify with the bound keypair, static {@link #sign(byte[], byte[])}
 * / {@link #verify} provide stateless entry points used by
 * {@link PQSchemeRegistry}.
 *
 * <p>Falcon signatures are <strong>variable-length</strong>: every accepted
 * signature must fall within {@code [}{@link #SIGNATURE_MIN_LENGTH}{@code ,}
 * {@link #SIGNATURE_MAX_LENGTH}{@code ]}. {@link #SIGNATURE_MAX_LENGTH} (667) is
 * the TRON/EIP-8052 upper bound after re-inserting Falcon's stripped header byte
 * into a 666-byte headerless slot; {@link #SIGNATURE_MIN_LENGTH} (617) is the
 * smallest syntactically well-formed compressed encoding (header byte + 40-byte
 * nonce + 512 minimal {@code compressed_s2} coefficients).
 * BouncyCastle does not implement Falcon's spec-mandated rejection sampling
 * (its internal buffer permits up to 689 B); {@link #sign(byte[], byte[])} adds
 * that loop so produced signatures always respect the canonical cap.
 */
public final class FNDSA512 implements PQSignature {

  /**
   * Falcon-512 encoded private key from BC: f || g || F, where f and g are each
   * {@link #F_G_ENCODED_LENGTH} bytes (6 bits per coefficient × N=512 / 8) and F is
   * {@link #BIG_F_ENCODED_LENGTH} bytes (8 bits per coefficient × N=512 / 8).
   */
  public static final int F_G_ENCODED_LENGTH = 384;
  public static final int BIG_F_ENCODED_LENGTH = 512;
  public static final int PRIVATE_KEY_LENGTH =
      F_G_ENCODED_LENGTH + F_G_ENCODED_LENGTH + BIG_F_ENCODED_LENGTH;
  /**
   * Falcon-512 public key from BC: 14 * N / 8 = 896 bytes (the modq-encoded h polynomial).
   * The 1-byte serialization header is stripped from {@code getH()}.
   */
  public static final int PUBLIC_KEY_LENGTH = 896;
  /**
   * Extended private key encoding {@code f ‖ g ‖ F ‖ h}: the standard BC private key
   * (1280 B) with the 896-byte public key {@code h} appended. Lets the holder recover
   * the address without re-running keygen, since BC currently has no public API for
   * deriving {@code h} from {@code (f, g)} alone (see bcgit/bc-java#2297).
   */
  public static final int PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH =
      PRIVATE_KEY_LENGTH + PUBLIC_KEY_LENGTH;
  /**
   * TRON/EIP-8052 maximum Falcon-512 signature length after re-inserting the
   * stripped header byte into a 666-byte headerless signature slot.
   */
  public static final int SIGNATURE_MAX_LENGTH = 667;
  /**
   * Backward-compatible alias for callers that treat the signature length value
   * as the variable-length upper bound.
   */
  public static final int SIGNATURE_LENGTH = SIGNATURE_MAX_LENGTH;
  /**
   * Smallest syntactically well-formed Falcon-512 compressed encoding: 1-byte header
   * + 40-byte nonce + 576-byte {@code compressed_s2}. The compressed form encodes
   * N=512 coefficients and each coefficient takes at least 9 bits.
   */
  public static final int SIGNATURE_MIN_LENGTH = 617;
  /**
   * Canonical Falcon-512 header byte ({@code 0x30 + logn}, logn=9): identifies the
   * compressed encoding. BC's {@code FalconSigner} only ever produces this byte and
   * rejects any other first byte; {@link #verify} enforces it explicitly so the
   * "compressed-only" rule is pinned in our own code rather than relying on BC
   * internals. The padded ({@code 0x49}) and constant-time ({@code 0x59}) encodings
   * are deliberately not accepted — admitting them would make the same (key, message)
   * verifiable under multiple distinct byte strings (signature malleability).
   */
  public static final byte SIGNATURE_HEADER = 0x39;
  /**
   * Maximum signing retries before {@link #sign(byte[], byte[])} gives up.
   * Empirically BC produces signatures above {@link #SIGNATURE_MAX_LENGTH} with
   * probability ≪ 1/5000, so 16 attempts is comfortably above the
   * spec-targeted rejection rate (~2^-40) — failure probability after 16
   * retries on honest input is astronomically small.
   */
  private static final int SIGN_RETRY_BUDGET = 16;
  /** Falcon keygen seeds an internal SHAKE256 from 48 bytes of randomness. */
  public static final int SEED_LENGTH = 48;

  private static final FalconParameters PARAMS = FalconParameters.falcon_512;
  private static final SecureRandom SIGNING_RNG = new SecureRandom();

  private final byte[] privateKey;
  private final byte[] publicKey;

  public FNDSA512() {
    AsymmetricCipherKeyPair kp = generateKeyPair(new SecureRandom());
    this.privateKey = ((FalconPrivateKeyParameters) kp.getPrivate()).getEncoded();
    this.publicKey = ((FalconPublicKeyParameters) kp.getPublic()).getH();
  }

  public FNDSA512(byte[] seed) {
    if (seed == null || seed.length != SEED_LENGTH) {
      throw new IllegalArgumentException("FN-DSA seed length must be " + SEED_LENGTH);
    }
    AsymmetricCipherKeyPair kp = generateKeyPair(new FixedSecureRandom(seed));
    this.privateKey = ((FalconPrivateKeyParameters) kp.getPrivate()).getEncoded();
    this.publicKey = ((FalconPublicKeyParameters) kp.getPublic()).getH();
  }

  public FNDSA512(byte[] privateKey, byte[] publicKey) {
    if (privateKey == null || privateKey.length != PRIVATE_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "FN-DSA private key length must be " + PRIVATE_KEY_LENGTH);
    }
    if (publicKey == null || publicKey.length != PUBLIC_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "FN-DSA public key length must be " + PUBLIC_KEY_LENGTH);
    }
    requireConsistent(privateKey, publicKey);
    this.privateKey = privateKey.clone();
    this.publicKey = publicKey.clone();
  }

  /**
   * Builds an instance from the extended private key encoding {@code f ‖ g ‖ F ‖ h}
   * ({@link #PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH} bytes), as produced by
   * {@link #getPrivateKeyWithPublicKey()}. Provided as a static factory rather
   * than an additional {@code FNDSA512(byte[])} constructor because Java cannot
   * overload {@link #FNDSA512(byte[]) the seed constructor} on length alone.
   */
  public static FNDSA512 fromPrivateKeyWithPublicKey(byte[] extendedPrivateKey) {
    if (extendedPrivateKey == null
        || extendedPrivateKey.length != PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "FN-DSA extended private key length must be "
              + PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH);
    }
    byte[] sk = new byte[PRIVATE_KEY_LENGTH];
    byte[] pk = new byte[PUBLIC_KEY_LENGTH];
    System.arraycopy(extendedPrivateKey, 0, sk, 0, PRIVATE_KEY_LENGTH);
    System.arraycopy(extendedPrivateKey, PRIVATE_KEY_LENGTH, pk, 0, PUBLIC_KEY_LENGTH);
    return new FNDSA512(sk, pk);
  }

  @Override
  public PQScheme getScheme() {
    return PQScheme.FN_DSA_512;
  }

  @Override
  public int getPrivateKeyLength() {
    return PRIVATE_KEY_LENGTH;
  }

  @Override
  public int getPublicKeyLength() {
    return PUBLIC_KEY_LENGTH;
  }

  /** Returns the canonical signature length upper bound (signatures are variable-length). */
  @Override
  public int getSignatureLength() {
    return SIGNATURE_MAX_LENGTH;
  }

  /**
   * FN-DSA signatures are variable-length; the lower bound is the smallest
   * syntactically well-formed compressed encoding.
   */
  @Override
  public int getSignatureMinLength() {
    return SIGNATURE_MIN_LENGTH;
  }

  @Override
  public byte[] getPrivateKey() {
    return privateKey.clone();
  }

  /**
   * FN-DSA accepts the bare {@link #PRIVATE_KEY_LENGTH} form as well as the
   * extended {@link #PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH} form used for local
   * witness config. Override of {@link PQSignature#validatePrivateKey}.
   */
  @Override
  public void validatePrivateKey(byte[] privateKey) {
    validatePrivateKeyBytes(privateKey);
  }

  /**
   * Returns the private key with the 896-byte public key {@code h} appended:
   * {@code f ‖ g ‖ F ‖ h} (total {@link #PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH} bytes).
   * Use this format on disk / in config when the consumer needs to recover the
   * address from the private key alone — neither BC's encoded private key nor
   * the 48-byte keygen seed (without re-running keygen) suffice today.
   */
  public byte[] getPrivateKeyWithPublicKey() {
    byte[] out = new byte[PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH];
    System.arraycopy(privateKey, 0, out, 0, PRIVATE_KEY_LENGTH);
    System.arraycopy(publicKey, 0, out, PRIVATE_KEY_LENGTH, PUBLIC_KEY_LENGTH);
    return out;
  }

  /**
   * FN-DSA persists the extended {@code f ‖ g ‖ F ‖ h} form so the keystore can
   * recover {@code h} without re-running keygen.
   */
  @Override
  public byte[] getPersistedPrivateKey() {
    return getPrivateKeyWithPublicKey();
  }

  @Override
  public byte[] getPublicKey() {
    return publicKey.clone();
  }

  @Override
  public byte[] getAddress() {
    return PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, publicKey);
  }

  @Override
  public byte[] sign(byte[] message) {
    return sign(privateKey, message);
  }

  @Override
  public boolean verify(byte[] message, byte[] signature) {
    return verify(publicKey, message, signature);
  }

  public static boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
    if (publicKey == null || publicKey.length != PUBLIC_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "FN-DSA public key length must be " + PUBLIC_KEY_LENGTH);
    }
    if (signature == null
        || signature.length < SIGNATURE_MIN_LENGTH
        || signature.length > SIGNATURE_MAX_LENGTH) {
      throw new IllegalArgumentException(
          "FN-DSA signature length must be "
              + SIGNATURE_MIN_LENGTH + ".." + SIGNATURE_MAX_LENGTH);
    }
    if (message == null) {
      throw new IllegalArgumentException("message must not be null");
    }
    // Reject non-canonical encodings (padded 0x49 / constant-time 0x59) so only the
    // compressed form is verifiable — see SIGNATURE_HEADER. Ordered after the argument
    // checks above: malformed arguments throw, a non-canonical-but-well-formed
    // signature is simply an invalid signature (return false).
    if (signature[0] != SIGNATURE_HEADER) {
      return false;
    }
    FalconPublicKeyParameters pk = new FalconPublicKeyParameters(PARAMS, publicKey);
    FalconSigner verifier = new FalconSigner();
    verifier.init(false, pk);
    try {
      return verifier.verifySignature(message, signature);
    } catch (RuntimeException e) {
      return false;
    }
  }

  /**
   * Signs {@code message} using either the bare private key
   * ({@link #PRIVATE_KEY_LENGTH} bytes, {@code f ‖ g ‖ F}) or the extended form
   * ({@link #PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH} bytes, {@code f ‖ g ‖ F ‖ h}).
   * The trailing {@code h} segment is ignored — only {@code (f, g, F)} feed BC's signer.
   *
   * <p>Signing is randomized: the same {@code (privateKey, message)} yields different
   * signature bytes on every call. Only keygen is deterministic from the 48-byte seed.
   * Downstream code must not cache or dedup by signature-bytes hash; key on the derived
   * address instead (see the PQ multisig dedup in {@code PrecompiledContracts}).
   *
   * <p>Per Falcon Round-3 / FIPS-206 draft the signature MUST be ≤
   * {@link #SIGNATURE_MAX_LENGTH} bytes; if it exceeds, the signer must resample
   * with a fresh nonce. BouncyCastle does <strong>not</strong> implement this
   * rejection step — its internal buffer permits up to 689 B and would return
   * those longer signatures. This wrapper enforces the spec cap by discarding
   * over-length BC outputs (and BC's own {@code IllegalStateException} from
   * {@code comp_encode} overflow) and retrying up to {@link #SIGN_RETRY_BUDGET}
   * times. Each retry draws fresh randomness from {@code SIGNING_RNG}, so on
   * honest input the budget is astronomically unlikely to be exhausted.
   */
  public static byte[] sign(byte[] privateKey, byte[] message) {
    validatePrivateKeyBytes(privateKey);
    if (message == null) {
      throw new IllegalArgumentException("message must not be null");
    }
    byte[] f = new byte[F_G_ENCODED_LENGTH];
    byte[] g = new byte[F_G_ENCODED_LENGTH];
    byte[] bigF = new byte[BIG_F_ENCODED_LENGTH];
    System.arraycopy(privateKey, 0, f, 0, f.length);
    System.arraycopy(privateKey, f.length, g, 0, g.length);
    System.arraycopy(privateKey, f.length + g.length, bigF, 0, bigF.length);
    FalconPrivateKeyParameters sk = new FalconPrivateKeyParameters(PARAMS, f, g, bigF, new byte[0]);
    FalconSigner signer = new FalconSigner();
    signer.init(true, new ParametersWithRandom(sk, SIGNING_RNG));
    Exception lastFailure = null;
    for (int attempt = 0; attempt < SIGN_RETRY_BUDGET; attempt++) {
      try {
        byte[] sig = signer.generateSignature(message);
        if (sig.length <= SIGNATURE_MAX_LENGTH) {
          return sig;
        }
        // BC produced a spec-overlong signature; retry with fresh randomness.
      } catch (IllegalStateException e) {
        // BC's comp_encode overflowed its internal buffer — equivalent to
        // a spec-overlong signature; retry.
        lastFailure = e;
      } catch (Exception e) {
        throw new IllegalStateException("FN-DSA signing failed", e);
      }
    }
    throw new IllegalStateException(
        "FN-DSA signing failed: could not produce a signature ≤ "
            + SIGNATURE_MAX_LENGTH + " bytes after " + SIGN_RETRY_BUDGET + " attempts",
        lastFailure);
  }

  /**
   * Recovers the public key when the input is in the extended form
   * {@code f ‖ g ‖ F ‖ h} ({@link #PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH} bytes).
   * Throws {@link UnsupportedOperationException} for the bare {@code f ‖ g ‖ F}
   * form: BouncyCastle currently has no public API to compute {@code h = g · f⁻¹}
   * mod q, so callers must persist {@code h} alongside the private key (use
   * {@link #getPrivateKeyWithPublicKey()}) or re-run keygen from a stored seed.
   * See bcgit/bc-java#2297.
   */
  public static byte[] derivePublicKey(byte[] privateKey) {
    if (privateKey == null) {
      throw new IllegalArgumentException("privateKey must not be null");
    }
    if (privateKey.length == PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH) {
      byte[] pk = new byte[PUBLIC_KEY_LENGTH];
      System.arraycopy(privateKey, PRIVATE_KEY_LENGTH, pk, 0, PUBLIC_KEY_LENGTH);
      return pk;
    }
    throw new UnsupportedOperationException(
        "FN-DSA public key cannot be derived from the bare encoded private key; "
            + "supply the extended form (f ‖ g ‖ F ‖ h) or both halves to the "
            + "(privateKey, publicKey) constructor");
  }

  public static byte[] computeAddress(byte[] publicKey) {
    return PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, publicKey);
  }

  private static AsymmetricCipherKeyPair generateKeyPair(SecureRandom random) {
    FalconKeyPairGenerator generator = new FalconKeyPairGenerator();
    generator.init(new FalconKeyGenerationParameters(random, PARAMS));
    return generator.generateKeyPair();
  }

  /**
   * Domain-separated probe used by {@link #requireConsistent}; not a security
   * boundary (Falcon hashes the message internally), the constant just makes the
   * keypair self-check searchable in logs/stack traces.
   */
  private static final byte[] CONSISTENCY_PROBE =
      "tron:FN-DSA-512:keypair-consistency-probe".getBytes(StandardCharsets.UTF_8);

  /**
   * Probe that the supplied (sk, pk) actually form a keypair. Falcon has no
   * public API to derive {@code h} from {@code (f, g)} alone (bcgit/bc-java#2297),
   * so we sign and verify a fixed probe message. Runs once per witness load and
   * costs a few ms on Falcon-512 — acceptable for a startup-time misconfiguration
   * check, and avoids advertising an address that signatures will never satisfy.
   */
  private static void requireConsistent(byte[] privateKey, byte[] publicKey) {
    byte[] sig;
    try {
      sig = sign(privateKey, CONSISTENCY_PROBE);
    } catch (RuntimeException e) {
      throw new IllegalArgumentException("FN-DSA private/public key mismatch", e);
    }
    if (!verify(publicKey, CONSISTENCY_PROBE, sig)) {
      throw new IllegalArgumentException("FN-DSA private/public key mismatch");
    }
  }

  private static void validatePrivateKeyBytes(byte[] privateKey) {
    if (privateKey == null
        || (privateKey.length != PRIVATE_KEY_LENGTH
            && privateKey.length != PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH)) {
      throw new IllegalArgumentException(
          "FN-DSA private key length must be " + PRIVATE_KEY_LENGTH
              + " or " + PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH);
    }
  }
}
