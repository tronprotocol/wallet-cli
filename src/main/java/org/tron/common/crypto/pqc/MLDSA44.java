package org.tron.common.crypto.pqc;

import java.security.MessageDigest;
import java.security.SecureRandom;
import org.bouncycastle.crypto.AsymmetricCipherKeyPair;
import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyGenerationParameters;
import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyPairGenerator;
import org.bouncycastle.pqc.crypto.mldsa.MLDSAParameters;
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPrivateKeyParameters;
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPublicKeyParameters;
import org.bouncycastle.pqc.crypto.mldsa.MLDSASigner;
import org.bouncycastle.crypto.params.ParametersWithRandom;
import org.bouncycastle.crypto.prng.FixedSecureRandom;
import org.tron.protos.Protocol.PQScheme;

/**
 * FIPS 204 ML-DSA-44 (CRYSTALS-Dilithium-2) keypair-bound signer/verifier.
 * ML-DSA-44 signatures are fixed-length (2420 B). The expanded private key
 * encoding {@code rho ‖ K ‖ tr ‖ s1 ‖ s2 ‖ t0} (2560 B) lets BC recover the
 * public key directly, so there is no extended priv-with-pub form like Falcon.
 */
public final class MLDSA44 implements PQSignature {

  public static final int PRIVATE_KEY_LENGTH = 2560;
  public static final int PUBLIC_KEY_LENGTH = 1312;
  public static final int SIGNATURE_LENGTH = 2420;
  public static final int SEED_LENGTH = 32;

  private static final MLDSAParameters PARAMS = MLDSAParameters.ml_dsa_44;

  private final byte[] privateKey;
  private final byte[] publicKey;

  public MLDSA44() {
    AsymmetricCipherKeyPair kp = generateKeyPair(new SecureRandom());
    this.privateKey = ((MLDSAPrivateKeyParameters) kp.getPrivate()).getEncoded();
    this.publicKey = ((MLDSAPublicKeyParameters) kp.getPublic()).getEncoded();
  }

  public MLDSA44(byte[] seed) {
    if (seed == null || seed.length != SEED_LENGTH) {
      throw new IllegalArgumentException("ML-DSA seed length must be " + SEED_LENGTH);
    }
    AsymmetricCipherKeyPair kp = generateKeyPair(new FixedSecureRandom(seed));
    this.privateKey = ((MLDSAPrivateKeyParameters) kp.getPrivate()).getEncoded();
    this.publicKey = ((MLDSAPublicKeyParameters) kp.getPublic()).getEncoded();
  }

  public MLDSA44(byte[] privateKey, byte[] publicKey) {
    if (privateKey == null || privateKey.length != PRIVATE_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA private key length must be " + PRIVATE_KEY_LENGTH);
    }
    if (publicKey == null || publicKey.length != PUBLIC_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA public key length must be " + PUBLIC_KEY_LENGTH);
    }
    requireConsistent(privateKey, publicKey);
    this.privateKey = privateKey.clone();
    this.publicKey = publicKey.clone();
  }

  @Override
  public PQScheme getScheme() {
    return PQScheme.ML_DSA_44;
  }

  @Override
  public int getPrivateKeyLength() {
    return PRIVATE_KEY_LENGTH;
  }

  @Override
  public int getPublicKeyLength() {
    return PUBLIC_KEY_LENGTH;
  }

  @Override
  public int getSignatureLength() {
    return SIGNATURE_LENGTH;
  }

  @Override
  public byte[] getPrivateKey() {
    return privateKey.clone();
  }

  @Override
  public byte[] getPublicKey() {
    return publicKey.clone();
  }

  @Override
  public byte[] getAddress() {
    return PQSchemeRegistry.computeAddress(PQScheme.ML_DSA_44, publicKey);
  }

  @Override
  public byte[] sign(byte[] message) {
    return sign(privateKey, message);
  }

  @Override
  public boolean verify(byte[] message, byte[] signature) {
    return verify(publicKey, message, signature);
  }

  /**
   * Fixed-length validation: signatures shorter or longer than
   * {@link #SIGNATURE_LENGTH} are invalid by construction.
   */
  @Override
  public void validateSignature(byte[] signature) {
    if (signature == null || signature.length != SIGNATURE_LENGTH) {
      throw new IllegalArgumentException(
          "invalid " + getScheme() + " signature length: "
              + (signature == null ? "null" : signature.length)
              + ", expected " + SIGNATURE_LENGTH);
    }
  }

  public static boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
    if (publicKey == null || publicKey.length != PUBLIC_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA public key length must be " + PUBLIC_KEY_LENGTH);
    }
    if (signature == null || signature.length != SIGNATURE_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA signature length must be " + SIGNATURE_LENGTH);
    }
    if (message == null) {
      throw new IllegalArgumentException("message must not be null");
    }
    MLDSAPublicKeyParameters pk = new MLDSAPublicKeyParameters(PARAMS, publicKey);
    MLDSASigner verifier = new MLDSASigner();
    verifier.init(false, pk);
    verifier.update(message, 0, message.length);
    try {
      return verifier.verifySignature(signature);
    } catch (RuntimeException e) {
      return false;
    }
  }

  public static byte[] sign(byte[] privateKey, byte[] message) {
    if (privateKey == null || privateKey.length != PRIVATE_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA private key length must be " + PRIVATE_KEY_LENGTH);
    }
    if (message == null) {
      throw new IllegalArgumentException("message must not be null");
    }
    MLDSAPrivateKeyParameters sk = new MLDSAPrivateKeyParameters(PARAMS, privateKey);
    MLDSASigner signer = new MLDSASigner();
    signer.init(true, new ParametersWithRandom(sk, new SecureRandom()));
    signer.update(message, 0, message.length);
    try {
      return signer.generateSignature();
    } catch (Exception e) {
      throw new IllegalStateException("ML-DSA signing failed", e);
    }
  }

  /**
   * Recovers the public key from the expanded private key. BC's encoded
   * private key includes {@code rho} and the witness {@code t0}; {@code t1} is
   * re-derived inside {@link MLDSAPrivateKeyParameters}, so {@code pk = rho ‖ t1}
   * is recoverable without persisting it alongside.
   */
  public static byte[] derivePublicKey(byte[] privateKey) {
    if (privateKey == null || privateKey.length != PRIVATE_KEY_LENGTH) {
      throw new IllegalArgumentException(
          "ML-DSA private key length must be " + PRIVATE_KEY_LENGTH);
    }
    MLDSAPrivateKeyParameters sk = new MLDSAPrivateKeyParameters(PARAMS, privateKey);
    return sk.getPublicKey();
  }

  public static byte[] computeAddress(byte[] publicKey) {
    return PQSchemeRegistry.computeAddress(PQScheme.ML_DSA_44, publicKey);
  }

  private static AsymmetricCipherKeyPair generateKeyPair(SecureRandom random) {
    MLDSAKeyPairGenerator generator = new MLDSAKeyPairGenerator();
    generator.init(new MLDSAKeyGenerationParameters(random, PARAMS));
    return generator.generateKeyPair();
  }

  private static void requireConsistent(byte[] privateKey, byte[] publicKey) {
    byte[] derived;
    try {
      derived = derivePublicKey(privateKey);
    } catch (RuntimeException e) {
      throw new IllegalArgumentException("ML-DSA private key is malformed", e);
    }
    if (!MessageDigest.isEqual(derived, publicKey)) {
      throw new IllegalArgumentException("ML-DSA private/public key mismatch");
    }
  }
}
