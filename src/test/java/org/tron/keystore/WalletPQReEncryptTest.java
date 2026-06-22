package org.tron.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.tron.common.crypto.pqc.FNDSA512;
import org.tron.core.exception.CipherException;
import org.tron.protos.Protocol.PQScheme;

public class WalletPQReEncryptTest {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[FNDSA512.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 11);
    }
    return seed;
  }

  @Test
  public void reEncryptPreservesSchemeAndBothSegments() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 signer = new FNDSA512(seed);
    byte[] oldPwd = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    byte[] newPwd = "rotatedPassword99B".getBytes(StandardCharsets.UTF_8);

    WalletFile original = Wallet.createStandardPQ(
        oldPwd, PQScheme.FN_DSA_512,
        signer.getPersistedPrivateKey(), seed, signer.getPublicKey());
    String originalId = original.getId();
    String originalAddress = original.getAddress();
    original.setName("pq-wallet-rotate");

    WalletFile rotated = Wallet.reEncryptPQ(oldPwd, newPwd, original);

    assertEquals("FN_DSA_512", rotated.getScheme());
    assertEquals(originalId, rotated.getId());
    assertEquals(originalAddress, rotated.getAddress());
    assertEquals("pq-wallet-rotate", rotated.getName());
    assertNotNull(rotated.getCrypto().getCiphertext());
    assertNotNull(rotated.getCrypto().getSeedciphertext());
    assertNotEquals(original.getCrypto().getCiphertext(),
        rotated.getCrypto().getCiphertext());
    assertNotEquals(original.getCrypto().getSeedciphertext(),
        rotated.getCrypto().getSeedciphertext());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(newPwd, rotated);
    assertArrayEquals(signer.getPublicKey(), decrypted.getPublicKey());
    assertArrayEquals(signer.getPrivateKey(), decrypted.getPrivateKey());

    try {
      Wallet.decryptPQ(oldPwd, rotated);
      fail("Old password should no longer decrypt the rotated keystore");
    } catch (CipherException e) {
      assertEquals("Invalid password provided", e.getMessage());
    }
  }

  @Test
  public void reEncryptPreservesExtOnlyShape() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 signer = new FNDSA512(seed);
    byte[] oldPwd = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    byte[] newPwd = "rotatedPassword99B".getBytes(StandardCharsets.UTF_8);

    WalletFile original = Wallet.createStandardPQ(
        oldPwd, PQScheme.FN_DSA_512,
        signer.getPersistedPrivateKey(), null, signer.getPublicKey());
    assertNull(original.getCrypto().getSeedciphertext());

    WalletFile rotated = Wallet.reEncryptPQ(oldPwd, newPwd, original);

    assertEquals("FN_DSA_512", rotated.getScheme());
    assertNotNull(rotated.getCrypto().getCiphertext());
    assertNull("ext-only shape must survive rotation",
        rotated.getCrypto().getSeedciphertext());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(newPwd, rotated);
    assertArrayEquals(signer.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void reEncryptPreservesSeedOnlyShape() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 signer = new FNDSA512(seed);
    byte[] oldPwd = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    byte[] newPwd = "rotatedPassword99B".getBytes(StandardCharsets.UTF_8);

    WalletFile original = Wallet.createStandardPQ(
        oldPwd, PQScheme.FN_DSA_512,
        null, seed, signer.getPublicKey());
    assertNull(original.getCrypto().getCiphertext());

    WalletFile rotated = Wallet.reEncryptPQ(oldPwd, newPwd, original);

    assertEquals("FN_DSA_512", rotated.getScheme());
    assertNull("seed-only shape must survive rotation",
        rotated.getCrypto().getCiphertext());
    assertNotNull(rotated.getCrypto().getSeedciphertext());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(newPwd, rotated);
    assertArrayEquals(signer.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void reEncryptRejectsWrongOldPassword() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 signer = new FNDSA512(seed);
    byte[] oldPwd = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    byte[] wrongPwd = "wrongPassword456Z".getBytes(StandardCharsets.UTF_8);
    byte[] newPwd = "rotatedPassword99B".getBytes(StandardCharsets.UTF_8);

    WalletFile original = Wallet.createStandardPQ(
        oldPwd, PQScheme.FN_DSA_512,
        signer.getPersistedPrivateKey(), seed, signer.getPublicKey());

    try {
      Wallet.reEncryptPQ(wrongPwd, newPwd, original);
      fail("Wrong old password must not allow rotation");
    } catch (CipherException e) {
      assertEquals("Invalid password provided", e.getMessage());
    }
  }
}
