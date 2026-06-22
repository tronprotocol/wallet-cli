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

public class FNDSA512Test {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[FNDSA512.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) i;
    }
    return seed;
  }

  @Test
  public void deterministicKeygenFromSeed() {
    FNDSA512 a = new FNDSA512(fixedSeed());
    FNDSA512 b = new FNDSA512(fixedSeed());
    assertArrayEquals(a.getPublicKey(), b.getPublicKey());
    assertArrayEquals(a.getPrivateKey(), b.getPrivateKey());
    assertEquals(FNDSA512.PUBLIC_KEY_LENGTH, a.getPublicKey().length);
    assertEquals(FNDSA512.PRIVATE_KEY_LENGTH, a.getPrivateKey().length);
  }

  @Test
  public void signVerifyRoundtrip() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] message = "wallet-cli FN-DSA-512 round-trip"
        .getBytes(StandardCharsets.UTF_8);
    byte[] signature = signer.sign(message);
    assertNotNull(signature);
    assertTrue(signature.length >= FNDSA512.SIGNATURE_MIN_LENGTH
        && signature.length <= FNDSA512.SIGNATURE_LENGTH);
    assertTrue(signer.verify(message, signature));
    assertTrue(FNDSA512.verify(signer.getPublicKey(), message, signature));
  }

  @Test
  public void verifyRejectsTamperedMessage() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] message = "original".getBytes(StandardCharsets.UTF_8);
    byte[] signature = signer.sign(message);
    byte[] tampered = "OrIgInAl".getBytes(StandardCharsets.UTF_8);
    assertFalse(FNDSA512.verify(signer.getPublicKey(), tampered, signature));
  }

  @Test
  public void extendedPrivateKeyRoundtrip() {
    FNDSA512 original = new FNDSA512(fixedSeed());
    byte[] extended = original.getPrivateKeyWithPublicKey();
    assertEquals(FNDSA512.PRIVATE_KEY_WITH_PUBLIC_KEY_LENGTH, extended.length);

    FNDSA512 rebuilt = FNDSA512.fromPrivateKeyWithPublicKey(extended);
    assertArrayEquals(original.getPublicKey(), rebuilt.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), rebuilt.getPrivateKey());

    byte[] msg = "extended-roundtrip".getBytes(StandardCharsets.UTF_8);
    byte[] sig = rebuilt.sign(msg);
    assertTrue(original.verify(msg, sig));
  }

  @Test
  public void derivePublicKeyFromExtendedPrivate() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] extended = signer.getPrivateKeyWithPublicKey();
    byte[] derivedPub = FNDSA512.derivePublicKey(extended);
    assertArrayEquals(signer.getPublicKey(), derivedPub);
  }

  @Test
  public void derivePublicKeyFromBarePrivateThrows() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    try {
      FNDSA512.derivePublicKey(signer.getPrivateKey());
      fail("expected UnsupportedOperationException for bare private key");
    } catch (UnsupportedOperationException expected) {
      // pass
    }
  }

  @Test
  public void getSchemeReturnsFnDsa512() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    assertEquals(PQScheme.FN_DSA_512, signer.getScheme());
  }

  @Test
  public void addressIs21BytesWithTronPrefix() {
    FNDSA512 signer = new FNDSA512(fixedSeed());
    byte[] address = signer.getAddress();
    assertEquals(21, address.length);
    assertEquals((byte) 0x41, address[0]);
  }

  @Test
  public void invalidSeedLengthRejected() {
    try {
      new FNDSA512(new byte[FNDSA512.SEED_LENGTH - 1]);
      fail("expected IllegalArgumentException for short seed");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void mismatchedKeypairRejected() {
    FNDSA512 a = new FNDSA512(fixedSeed());
    // Different seed → different keypair
    byte[] otherSeed = new byte[FNDSA512.SEED_LENGTH];
    new SecureRandom(new byte[]{1, 2, 3}).nextBytes(otherSeed);
    FNDSA512 b = new FNDSA512(otherSeed);
    try {
      new FNDSA512(a.getPrivateKey(), b.getPublicKey());
      fail("expected IllegalArgumentException for mismatched keypair");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void fromExtendedRejectsWrongLength() {
    try {
      FNDSA512.fromPrivateKeyWithPublicKey(new byte[10]);
      fail("expected IllegalArgumentException for wrong-length extended key");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }
}
