package org.tron.common.crypto.pqc;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import org.junit.Test;
import org.tron.protos.Protocol.PQScheme;

public class MLDSA44Test {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[MLDSA44.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) i;
    }
    return seed;
  }

  @Test
  public void deterministicKeygenFromSeed() {
    MLDSA44 a = new MLDSA44(fixedSeed());
    MLDSA44 b = new MLDSA44(fixedSeed());
    assertArrayEquals(a.getPublicKey(), b.getPublicKey());
    assertArrayEquals(a.getPrivateKey(), b.getPrivateKey());
    assertEquals(MLDSA44.PUBLIC_KEY_LENGTH, a.getPublicKey().length);
    assertEquals(MLDSA44.PRIVATE_KEY_LENGTH, a.getPrivateKey().length);
  }

  @Test
  public void signVerifyRoundtrip() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    byte[] message = "wallet-cli ML-DSA-44 round-trip"
        .getBytes(StandardCharsets.UTF_8);
    byte[] signature = signer.sign(message);
    assertNotNull(signature);
    assertEquals(MLDSA44.SIGNATURE_LENGTH, signature.length);
    assertTrue(signer.verify(message, signature));
    assertTrue(MLDSA44.verify(signer.getPublicKey(), message, signature));
  }

  @Test
  public void verifyRejectsTamperedMessage() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    byte[] message = "original".getBytes(StandardCharsets.UTF_8);
    byte[] signature = signer.sign(message);
    byte[] tampered = "OrIgInAl".getBytes(StandardCharsets.UTF_8);
    assertFalse(MLDSA44.verify(signer.getPublicKey(), tampered, signature));
  }

  @Test
  public void derivePublicKeyFromPrivate() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    byte[] derivedPub = MLDSA44.derivePublicKey(signer.getPrivateKey());
    assertArrayEquals(signer.getPublicKey(), derivedPub);
  }

  @Test
  public void persistedPrivateKeyIsEncodedPrivate() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    assertArrayEquals(signer.getPrivateKey(), signer.getPersistedPrivateKey());
    assertEquals(MLDSA44.PRIVATE_KEY_LENGTH, signer.getPersistedPrivateKey().length);
  }

  @Test
  public void getSchemeReturnsMlDsa44() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    assertEquals(PQScheme.ML_DSA_44, signer.getScheme());
  }

  @Test
  public void addressIs21BytesWithTronPrefix() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    byte[] address = signer.getAddress();
    assertEquals(21, address.length);
    assertEquals((byte) 0x41, address[0]);
  }

  @Test
  public void invalidSeedLengthRejected() {
    try {
      new MLDSA44(new byte[MLDSA44.SEED_LENGTH - 1]);
      fail("expected IllegalArgumentException for short seed");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void mismatchedKeypairRejected() {
    MLDSA44 a = new MLDSA44(fixedSeed());
    byte[] otherSeed = new byte[MLDSA44.SEED_LENGTH];
    new SecureRandom(new byte[]{1, 2, 3}).nextBytes(otherSeed);
    MLDSA44 b = new MLDSA44(otherSeed);
    try {
      new MLDSA44(a.getPrivateKey(), b.getPublicKey());
      fail("expected IllegalArgumentException for mismatched keypair");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void validateSignatureRejectsWrongLength() {
    MLDSA44 signer = new MLDSA44(fixedSeed());
    try {
      signer.validateSignature(new byte[MLDSA44.SIGNATURE_LENGTH - 1]);
      fail("expected IllegalArgumentException for short signature");
    } catch (IllegalArgumentException expected) {
      // pass
    }
    try {
      signer.validateSignature(new byte[MLDSA44.SIGNATURE_LENGTH + 1]);
      fail("expected IllegalArgumentException for long signature");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }
}
