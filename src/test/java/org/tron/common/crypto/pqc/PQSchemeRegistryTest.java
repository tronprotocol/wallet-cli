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
  public void resolveUnknownMapsToFnDsa512() {
    assertEquals(PQScheme.FN_DSA_512, PQSchemeRegistry.resolve(PQScheme.UNKNOWN_PQ_SCHEME));
    assertEquals(PQScheme.FN_DSA_512, PQSchemeRegistry.resolve(PQScheme.FN_DSA_512));
  }

  @Test
  public void containsAndLengthQueries() {
    assertTrue(PQSchemeRegistry.contains(PQScheme.FN_DSA_512));
    assertTrue(PQSchemeRegistry.contains(PQScheme.UNKNOWN_PQ_SCHEME));
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
    assertTrue(PQSchemeRegistry.isValidSignatureLength(PQScheme.FN_DSA_512, 1));
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
}
