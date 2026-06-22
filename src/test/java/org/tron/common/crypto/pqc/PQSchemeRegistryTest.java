package org.tron.common.crypto.pqc;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.tron.protos.Protocol.PQScheme;

public class PQSchemeRegistryTest {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[FNDSA512.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 1);
    }
    return seed;
  }

  @Test
  public void containsAndLengthQueries() {
    assertTrue(PQSchemeRegistry.contains(PQScheme.FN_DSA_512));
    assertFalse(PQSchemeRegistry.contains(PQScheme.UNKNOWN_PQ_SCHEME));
    assertFalse(PQSchemeRegistry.contains(null));
    assertEquals(FNDSA512.PRIVATE_KEY_LENGTH,
        PQSchemeRegistry.getPrivateKeyLength(PQScheme.FN_DSA_512));
    assertEquals(FNDSA512.PUBLIC_KEY_LENGTH,
        PQSchemeRegistry.getPublicKeyLength(PQScheme.FN_DSA_512));
    assertEquals(FNDSA512.SIGNATURE_LENGTH,
        PQSchemeRegistry.getSignatureLength(PQScheme.FN_DSA_512));
    assertEquals(FNDSA512.SEED_LENGTH,
        PQSchemeRegistry.getSeedLength(PQScheme.FN_DSA_512));
  }

  @Test
  public void signVerifyDispatch() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] msg = "registry-dispatch".getBytes(StandardCharsets.UTF_8);
    byte[] sig = PQSchemeRegistry.sign(PQScheme.FN_DSA_512, signer.getPrivateKey(), msg);
    assertTrue(PQSchemeRegistry.verify(PQScheme.FN_DSA_512, signer.getPublicKey(), msg, sig));
  }

  @Test
  public void signatureLengthValidator() {
    assertFalse(PQSchemeRegistry.isValidSignatureLength(PQScheme.FN_DSA_512, 0));
    assertFalse(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.FN_DSA_512, FNDSA512.SIGNATURE_MIN_LENGTH - 1));
    assertTrue(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.FN_DSA_512, FNDSA512.SIGNATURE_MIN_LENGTH));
    assertTrue(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.FN_DSA_512, FNDSA512.SIGNATURE_LENGTH));
    assertFalse(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.FN_DSA_512, FNDSA512.SIGNATURE_LENGTH + 1));
  }

  @Test
  public void computeAddressMatchesEcdsaShape() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] addr = PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, signer.getPublicKey());
    assertEquals(21, addr.length);
    assertEquals((byte) 0x41, addr[0]);
    // FNDSA512.getAddress delegates to this method — must match.
    assertArrayEquals(signer.getAddress(), addr);
  }

  @Test
  public void deriveHashLengthIs32() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] digest = PQSchemeRegistry.deriveHash(PQScheme.FN_DSA_512, signer.getPublicKey());
    assertEquals(32, digest.length);
  }

  @Test
  public void deriveHashRejectsWrongPubLength() {
    try {
      PQSchemeRegistry.deriveHash(PQScheme.FN_DSA_512, new byte[10]);
      fail("expected IllegalArgumentException for short public key");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void fromSeedAndFromKeypair() {
    PQSignature fromSeed = PQSchemeRegistry.fromSeed(PQScheme.FN_DSA_512, fixedSeed());
    PQSignature fromKeypair = PQSchemeRegistry.fromKeypair(
        PQScheme.FN_DSA_512, fromSeed.getPrivateKey(), fromSeed.getPublicKey());
    assertArrayEquals(fromSeed.getPublicKey(), fromKeypair.getPublicKey());
  }

  @Test
  public void mlDsa44Registered() {
    assertTrue(PQSchemeRegistry.contains(PQScheme.ML_DSA_44));
    assertEquals(MLDSA44.PRIVATE_KEY_LENGTH,
        PQSchemeRegistry.getPrivateKeyLength(PQScheme.ML_DSA_44));
    assertEquals(MLDSA44.PUBLIC_KEY_LENGTH,
        PQSchemeRegistry.getPublicKeyLength(PQScheme.ML_DSA_44));
    assertEquals(MLDSA44.SIGNATURE_LENGTH,
        PQSchemeRegistry.getSignatureLength(PQScheme.ML_DSA_44));
    assertEquals(MLDSA44.SEED_LENGTH,
        PQSchemeRegistry.getSeedLength(PQScheme.ML_DSA_44));
    assertEquals(MLDSA44.PRIVATE_KEY_LENGTH,
        PQSchemeRegistry.getPersistedPrivateKeyLength(PQScheme.ML_DSA_44));
  }

  @Test
  public void mlDsa44SignVerifyDispatch() {
    byte[] seed = new byte[MLDSA44.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 3);
    }
    MLDSA44 signer = new MLDSA44(seed);
    byte[] msg = "ml-dsa-44 registry dispatch".getBytes(StandardCharsets.UTF_8);
    byte[] sig = PQSchemeRegistry.sign(PQScheme.ML_DSA_44, signer.getPrivateKey(), msg);
    assertTrue(PQSchemeRegistry.verify(PQScheme.ML_DSA_44, signer.getPublicKey(), msg, sig));
  }

  @Test
  public void mlDsa44SignatureLengthIsFixed() {
    assertFalse(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.ML_DSA_44, MLDSA44.SIGNATURE_LENGTH - 1));
    assertTrue(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.ML_DSA_44, MLDSA44.SIGNATURE_LENGTH));
    assertFalse(PQSchemeRegistry.isValidSignatureLength(
        PQScheme.ML_DSA_44, MLDSA44.SIGNATURE_LENGTH + 1));
  }

  @Test
  public void mlDsa44ComputeAddressShape() {
    byte[] seed = new byte[MLDSA44.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 5);
    }
    MLDSA44 signer = new MLDSA44(seed);
    byte[] addr = PQSchemeRegistry.computeAddress(PQScheme.ML_DSA_44, signer.getPublicKey());
    assertEquals(21, addr.length);
    assertEquals((byte) 0x41, addr[0]);
    assertArrayEquals(signer.getAddress(), addr);
  }

  @Test
  public void mlDsa44FromPersistedPrivateKey() {
    byte[] seed = new byte[MLDSA44.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 9);
    }
    MLDSA44 original = new MLDSA44(seed);
    PQSignature rebuilt = PQSchemeRegistry.fromPersistedPrivateKey(
        PQScheme.ML_DSA_44, original.getPersistedPrivateKey());
    assertArrayEquals(original.getPublicKey(), rebuilt.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), rebuilt.getPrivateKey());
  }
}
