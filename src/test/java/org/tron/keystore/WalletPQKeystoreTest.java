package org.tron.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.tron.common.crypto.pqc.FNDSA512;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
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
  public void encryptDecryptRoundtrip() throws Exception {
    FNDSA512 original = new FNDSA512(fixedSeed());
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);

    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), original.getPublicKey());

    assertEquals("FN_DSA_512", walletFile.getScheme());
    String expectedAddress = WalletApi.encode58Check(
        PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, original.getPublicKey()));
    assertEquals(expectedAddress, walletFile.getAddress());

    FNDSA512 decrypted = Wallet.decryptPQ(password, walletFile);
    assertNotNull(decrypted);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
    assertArrayEquals(original.getPrivateKey(), decrypted.getPrivateKey());

    byte[] msg = "keystore-roundtrip".getBytes(StandardCharsets.UTF_8);
    byte[] sig = decrypted.sign(msg);
    assertTrue(FNDSA512.verify(original.getPublicKey(), msg, sig));
  }

  @Test
  public void jacksonSerializationPreservesSchemeField() throws Exception {
    FNDSA512 original = new FNDSA512(fixedSeed());
    byte[] password = "testpassword123A".getBytes(StandardCharsets.UTF_8);
    WalletFile walletFile = Wallet.createStandardPQ(
        password, PQScheme.FN_DSA_512,
        original.getPrivateKeyWithPublicKey(), original.getPublicKey());

    ObjectMapper mapper = new ObjectMapper();
    String json = mapper.writeValueAsString(walletFile);
    assertTrue("JSON should contain scheme field: " + json,
        json.contains("\"scheme\":\"FN_DSA_512\""));

    WalletFile reloaded = mapper.readValue(json, WalletFile.class);
    assertEquals("FN_DSA_512", reloaded.getScheme());
    assertEquals(walletFile.getAddress(), reloaded.getAddress());

    FNDSA512 decrypted = Wallet.decryptPQ(password, reloaded);
    assertArrayEquals(original.getPublicKey(), decrypted.getPublicKey());
  }

  @Test
  public void legacyWalletFileHasNoSchemeField() throws Exception {
    // A WalletFile with no scheme (legacy ECKey/SM2) must not emit a scheme key.
    WalletFile legacy = new WalletFile();
    legacy.setAddress("Tabcdefg");
    ObjectMapper mapper = new ObjectMapper();
    String json = mapper.writeValueAsString(legacy);
    assertTrue("Legacy JSON should omit scheme: " + json, !json.contains("\"scheme\""));
  }
}
