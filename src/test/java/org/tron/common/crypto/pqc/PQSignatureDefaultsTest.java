package org.tron.common.crypto.pqc;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

/**
 * Default-method contract tests for {@link PQSignature}. The defaults validate
 * key and signature lengths so that registered schemes do not need to
 * re-implement that boilerplate.
 */
public class PQSignatureDefaultsTest {

  @Test
  public void validatePrivateKeyRejectsWrongLength() {
    FNDSA512 signer = new FNDSA512();
    try {
      signer.validatePrivateKey(new byte[1]);
      fail("expected IllegalArgumentException for wrong private key length");
    } catch (IllegalArgumentException expected) {
      // pass — FNDSA512 overrides default to also accept extended form,
      // but length=1 fails both branches.
    }
  }

  @Test
  public void validatePrivateKeyAcceptsExtendedForm() {
    FNDSA512 signer = new FNDSA512();
    // Extended form is allowed for FN-DSA (overridden default).
    signer.validatePrivateKey(signer.getPrivateKeyWithPublicKey());
    signer.validatePrivateKey(signer.getPrivateKey());
  }

  @Test
  public void validatePublicKeyRejectsWrongLength() {
    FNDSA512 signer = new FNDSA512();
    try {
      signer.validatePublicKey(new byte[1]);
      fail("expected IllegalArgumentException for wrong public key length");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void validatePublicKeyAcceptsCorrectLength() {
    FNDSA512 signer = new FNDSA512();
    signer.validatePublicKey(signer.getPublicKey());
  }

  @Test
  public void validateSignatureRejectsEmpty() {
    FNDSA512 signer = new FNDSA512();
    try {
      signer.validateSignature(new byte[0]);
      fail("expected IllegalArgumentException for empty signature");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void validateSignatureRejectsTooLong() {
    FNDSA512 signer = new FNDSA512();
    try {
      signer.validateSignature(new byte[FNDSA512.SIGNATURE_LENGTH + 1]);
      fail("expected IllegalArgumentException for oversized signature");
    } catch (IllegalArgumentException expected) {
      // pass
    }
  }

  @Test
  public void lengthGettersMatchConstants() {
    FNDSA512 signer = new FNDSA512();
    assertEquals(FNDSA512.PRIVATE_KEY_LENGTH, signer.getPrivateKeyLength());
    assertEquals(FNDSA512.PUBLIC_KEY_LENGTH, signer.getPublicKeyLength());
    assertEquals(FNDSA512.SIGNATURE_LENGTH, signer.getSignatureLength());
  }
}
