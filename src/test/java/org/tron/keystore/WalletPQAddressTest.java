package org.tron.keystore;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.pqc.FNDSA512;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
import org.tron.protos.Protocol.PQScheme;

/**
 * Parity test: confirm that PQ address derivation matches the documented
 * formula {@code 0x41 ‖ Keccak-256(public_key)[12..32]}, the same shape as
 * the ECDSA address derivation. The vector is computed at test time from a
 * fixed seed (no hard-coded magic bytes — the test guards the formula, not
 * a snapshot of the BC implementation).
 */
public class WalletPQAddressTest {

  @Test
  public void addressMatchesKeccak256Slice() {
    byte[] seed = new byte[FNDSA512.SEED_LENGTH];
    for (int i = 0; i < seed.length; i++) {
      seed[i] = (byte) (i * 3 + 1);
    }
    FNDSA512 signer = new FNDSA512(seed);
    byte[] publicKey = signer.getPublicKey();

    byte[] digest = Hash.sha3(publicKey);
    assertEquals(32, digest.length);

    byte[] expected = new byte[21];
    expected[0] = 0x41;
    System.arraycopy(digest, digest.length - 20, expected, 1, 20);

    byte[] actual = PQSchemeRegistry.computeAddress(PQScheme.FN_DSA_512, publicKey);
    assertArrayEquals(expected, actual);
    assertArrayEquals(expected, signer.getAddress());
  }
}
