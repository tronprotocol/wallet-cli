package org.tron.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.tron.common.crypto.pqc.FNDSA512;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
import org.tron.core.exception.CipherException;
import org.tron.protos.Protocol.PQScheme;
import org.tron.walletserver.WalletApi;

public class WalletPQKeystoreTest {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[FNDSA512.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 7);
    }
    return seed;
  }

  @Test
  public void encryptDecryptRoundtripDualCiphertext() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), seed, original.getPublicKey());

    assertEquals("FN_DSA_512", walletFile.getScheme());
    String expectedAddress = WalletApi.encode58Check(
        PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, original.getPublicKey()));
    assertEquals(expectedAddress, walletFile.getAddress());

    // Both segments must be present
    assertNotNull(walletFile.getCrypto().getCiphertext());
    assertNotNull(walletFile.getCrypto().getSeedciphertext());

    // IVs must be independent
    String extIv = walletFile.getCrypto().getCipherparams().getIv();
    String seedIv = walletFile.getCrypto().getSeedcipherparams().getIv();
    assertFalse("IVs must be independent", extIv.equals(seedIv));

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(password, walletFile);
    assertNotNull(decrypted);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), decrypted.getPrivateKey());

    byte[] msg = "keystore-roundtrip-dual".getBytes(StandardCharsets.UTF_8);
    byte[] sig = decrypted.sign(msg);
    assertTrue(FNDSA512.verify(original.getPublicKey(), msg, sig));
  }

  @Test
  public void encryptDecryptRoundtripExtOnly() throws Exception {
    FNDSA512 original = new FNDSA512(fixedSeed());
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), null, original.getPublicKey());

    assertNotNull(walletFile.getCrypto().getCiphertext());
    assertNull(walletFile.getCrypto().getSeedciphertext());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(password, walletFile);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void encryptDecryptRoundtripSeedOnly() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        null, seed, original.getPublicKey());

    assertNull(walletFile.getCrypto().getCiphertext());
    assertNotNull(walletFile.getCrypto().getSeedciphertext());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(password, walletFile);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void createFailsWithoutKeyMaterial() {
    byte[] password = "test".getBytes(StandardCharsets.UTF_8);
    try {
      Wallet.createStandardPQ(password, PQScheme.FN_DSA_512, null, null, new byte[896]);
      fail("Should reject null key material");
    } catch (CipherException e) {
      assertTrue(e.getMessage().contains("requires at least one"));
    }
  }

  @Test
  public void extMacTamperRejectsDecryption() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "test".getBytes(StandardCharsets.UTF_8);
    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), seed, original.getPublicKey());

    String mac = walletFile.getCrypto().getMac();
    char flipped = mac.charAt(0) == '0' ? '1' : '0';
    walletFile.getCrypto().setMac(flipped + mac.substring(1));

    try {
      Wallet.decryptPQ(password, walletFile);
      fail("Should reject tampered ext MAC");
    } catch (CipherException e) {
      assertEquals("Invalid password provided", e.getMessage());
    }
  }

  @Test
  public void seedMacTamperRejectsDecryption() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "test".getBytes(StandardCharsets.UTF_8);
    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), seed, original.getPublicKey());

    String seedMac = walletFile.getCrypto().getSeedmac();
    char seedFlipped = seedMac.charAt(0) == '0' ? '1' : '0';
    walletFile.getCrypto().setSeedmac(seedFlipped + seedMac.substring(1));

    try {
      Wallet.decryptPQ(password, walletFile);
      fail("Should reject tampered seed MAC");
    } catch (CipherException e) {
      assertEquals("Invalid password provided", e.getMessage());
    }
  }

  @Test
  public void mismatchBetweenSeedAndExtRejectsDecryption() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "test".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), seed, original.getPublicKey());

    // Create a second wallet with a different key, steal its seed ciphertext + mac + iv
    byte[] seed2 = seed.clone();
    seed2[0] ^= 1;
    FNDSA512 other = new FNDSA512(seed2);
    WalletFile otherWallet = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        other.getPrivateKeyWithPublicKey(), seed2, other.getPublicKey());

    // Graft the other wallet's seed segment into the first wallet (an insider
    // with the password could do this to try to desync the wallet).
    walletFile.getCrypto().setSeedciphertext(otherWallet.getCrypto().getSeedciphertext());
    walletFile.getCrypto().setSeedmac(otherWallet.getCrypto().getSeedmac());
    walletFile.getCrypto().setSeedcipherparams(otherWallet.getCrypto().getSeedcipherparams());

    try {
      Wallet.decryptPQ(password, walletFile);
      fail("Should reject mismatched seed/ext");
    } catch (CipherException e) {
      assertTrue("Expected 'Invalid password provided' (due to mismatched MAC since scrypt key doesn't match graft), got: " + e.getMessage(),
          e.getMessage().contains("Invalid password provided") || e.getMessage().contains("disagree"));
    }
  }

  @Test
  public void jacksonSerializationPreservesDualCiphertext() throws Exception {
    byte[] seed = fixedSeed();
    FNDSA512 original = new FNDSA512(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), seed, original.getPublicKey());

    ObjectMapper mapper = new ObjectMapper();
    String json = mapper.writeValueAsString(walletFile);
    assertTrue(json.contains("\"scheme\":\"FN_DSA_512\""));
    assertTrue(json.contains("\"seedciphertext\""));
    assertTrue(json.contains("\"seedmac\""));

    WalletFile reloaded = mapper.readValue(json, WalletFile.class);
    assertEquals("FN_DSA_512", reloaded.getScheme());

    FNDSA512 decrypted = (FNDSA512) Wallet.decryptPQ(password, reloaded);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void legacyWalletFileHasNoSeedFields() throws Exception {
    WalletFile legacy = new WalletFile();
    legacy.setAddress("Tabcdefg");
    ObjectMapper mapper = new ObjectMapper();
    String json = mapper.writeValueAsString(legacy);
    assertFalse(json.contains("\"scheme\""));
    assertFalse(json.contains("\"seedciphertext\""));
  }
}
