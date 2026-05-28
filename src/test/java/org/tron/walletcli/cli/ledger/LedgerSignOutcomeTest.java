package org.tron.walletcli.cli.ledger;

import org.junit.Assert;
import org.junit.Test;
import org.tron.trident.proto.Chain;

public class LedgerSignOutcomeTest {

  @Test
  public void okCarriesSignedTransactionAndNoErrorCode() {
    Chain.Transaction tx = Chain.Transaction.newBuilder().build();
    LedgerSignOutcome r = LedgerSignOutcome.ok(tx);
    Assert.assertEquals(LedgerSignOutcome.Status.OK, r.getStatus());
    Assert.assertSame(tx, r.getSignedTransaction());
    Assert.assertNull(r.getGasfreeSignature());
    Assert.assertNull(r.errorCode());
  }

  @Test
  public void okGasfreeCarriesSignatureOnly() {
    LedgerSignOutcome r = LedgerSignOutcome.okGasfree("deadbeef");
    Assert.assertEquals(LedgerSignOutcome.Status.OK, r.getStatus());
    Assert.assertEquals("deadbeef", r.getGasfreeSignature());
    Assert.assertNull(r.getSignedTransaction());
    Assert.assertNull(r.errorCode());
  }

  @Test
  public void failureRejectsOkStatus() {
    try {
      LedgerSignOutcome.failure(LedgerSignOutcome.Status.OK, "x");
      Assert.fail("Expected IllegalArgumentException");
    } catch (IllegalArgumentException e) {
      Assert.assertTrue(e.getMessage().contains("OK"));
    }
  }

  @Test
  public void everyNonOkStatusMapsToALedgerErrorCode() {
    for (LedgerSignOutcome.Status s : LedgerSignOutcome.Status.values()) {
      if (s == LedgerSignOutcome.Status.OK) continue;
      LedgerSignOutcome r = LedgerSignOutcome.failure(s, "msg");
      Assert.assertNotNull("status " + s + " should produce an error code", r.errorCode());
      Assert.assertTrue("status " + s + " error code should start with ledger_",
              r.errorCode().startsWith("ledger_"));
    }
  }

  @Test
  public void errorCodesAreStable() {
    Assert.assertEquals("ledger_not_connected",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.NOT_CONNECTED, "x").errorCode());
    Assert.assertEquals("ledger_app_not_open",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.APP_NOT_OPEN, "x").errorCode());
    Assert.assertEquals("ledger_sign_by_hash_disabled",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_BY_HASH_DISABLED, "x").errorCode());
    Assert.assertEquals("ledger_unsupported_contract",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.UNSUPPORTED_CONTRACT, "x").errorCode());
    Assert.assertEquals("ledger_already_signing",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.ALREADY_SIGNING, "x").errorCode());
    Assert.assertEquals("ledger_user_rejected",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.USER_REJECTED, "x").errorCode());
    Assert.assertEquals("ledger_timeout",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.TIMEOUT, "x").errorCode());
    Assert.assertEquals("ledger_sign_failed",
        LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_FAILED, "x").errorCode());
  }
}
