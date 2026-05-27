package org.tron.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.tron.common.crypto.pqc.MLDSA44;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
import org.tron.common.crypto.pqc.PQSignature;
import org.tron.protos.Protocol.PQScheme;
import org.tron.walletserver.WalletApi;

public class WalletPQMlDsa44KeystoreTest {

  private static byte[] fixedSeed() {
    byte[] seed = new byte[MLDSA44.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i + 11);
    }
    return seed;
  }

  @Test
  public void encryptDecryptRoundtripDualCiphertext() throws Exception {
    byte[] seed = fixedSeed();
    MLDSA44 original = new MLDSA44(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.ML_DSA_44,
        original.getPersistedPrivateKey(), seed, original.getPublicKey());

    assertEquals("ML_DSA_44", walletFile.getScheme());
    String expectedAddress = WalletApi.encode58Check(
        PQSchemeRegistry.computeAddress(PQScheme.ML_DSA_44, original.getPublicKey()));
    assertEquals(expectedAddress, walletFile.getAddress());

    assertNotNull(walletFile.getCrypto().getCiphertext());
    assertNotNull(walletFile.getCrypto().getSeedciphertext());

    PQSignature decrypted = Wallet.decryptPQ(password, walletFile);
    assertNotNull(decrypted);
    assertEquals(PQScheme.ML_DSA_44, decrypted.getScheme());
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), decrypted.getPrivateKey());

    byte[] msg = "ml-dsa-44-keystore-roundtrip".getBytes(StandardCharsets.UTF_8);
    byte[] sig = decrypted.sign(msg);
    assertTrue(MLDSA44.verify(original.getPublicKey(), msg, sig));
  }

  @Test
  public void encryptDecryptRoundtripExtOnly() throws Exception {
    MLDSA44 original = new MLDSA44(fixedSeed());
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.ML_DSA_44,
        original.getPersistedPrivateKey(), null, original.getPublicKey());

    assertNotNull(walletFile.getCrypto().getCiphertext());
    assertNull(walletFile.getCrypto().getSeedciphertext());

    PQSignature decrypted = Wallet.decryptPQ(password, walletFile);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), decrypted.getPrivateKey());
  }

  @Test
  public void encryptDecryptRoundtripSeedOnly() throws Exception {
    byte[] seed = fixedSeed();
    MLDSA44 original = new MLDSA44(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.ML_DSA_44,
        null, seed, original.getPublicKey());

    assertNull(walletFile.getCrypto().getCiphertext());
    assertNotNull(walletFile.getCrypto().getSeedciphertext());

    PQSignature decrypted = Wallet.decryptPQ(password, walletFile);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void jacksonSerializationPreservesMlDsaScheme() throws Exception {
    byte[] seed = fixedSeed();
    MLDSA44 original = new MLDSA44(seed);
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.ML_DSA_44,
        original.getPersistedPrivateKey(), seed, original.getPublicKey());

    ObjectMapper mapper = new ObjectMapper();
    String json = mapper.writeValueAsString(walletFile);
    assertTrue(json.contains("\"scheme\":\"ML_DSA_44\""));

    WalletFile reloaded = mapper.readValue(json, WalletFile.class);
    assertEquals("ML_DSA_44", reloaded.getScheme());

    PQSignature decrypted = Wallet.decryptPQ(password, reloaded);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }
}
