package org.tron.walletcli.cli.ledger;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.tron.trident.proto.Chain;
import org.tron.walletcli.cli.OutputFormatter;

public class NonInteractiveLedgerSignerTest {

  private static final String ADDRESS = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
  private static final String PATH = "m/44'/195'/0'/0/0";
  private static final String DEV_PATH = "/dev/hidraw0";

  private FakeFinder finder;
  private FakeStateReader stateReader;
  private FakeExecutor executor;
  private FakeResultReader resultReader;
  private FakeContractSupport contractSupport;
  private ByteArrayOutputStream stderrBuf;
  private OutputFormatter formatter;

  @Before
  public void setUp() {
    finder = new FakeFinder();
    stateReader = new FakeStateReader();
    executor = new FakeExecutor();
    resultReader = new FakeResultReader();
    contractSupport = new FakeContractSupport();
    stderrBuf = new ByteArrayOutputStream();
    formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false,
        new PrintStream(new ByteArrayOutputStream()), new PrintStream(stderrBuf));
  }

  private NonInteractiveLedgerSigner newSigner() {
    return new NonInteractiveLedgerSigner(formatter, finder, stateReader, executor, resultReader,
        contractSupport);
  }

  private LedgerSignOutcome signNonGasfree() {
    return newSigner().sign(Chain.Transaction.getDefaultInstance(), PATH, ADDRESS, false);
  }

  // ---------- happy path ----------

  @Test
  public void signSucceedsWhenUserConfirmsAndSignatureIsRecorded() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    Chain.Transaction signed = Chain.Transaction.newBuilder().build();
    resultReader.signedTransaction = Optional.of(signed);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CONFIRMED);

    LedgerSignOutcome r = signNonGasfree();

    Assert.assertEquals(LedgerSignOutcome.Status.OK, r.getStatus());
    Assert.assertSame(signed, r.getSignedTransaction());
  }

  @Test
  public void signSucceedsForGasfreeWhenSignatureIsRecorded() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    resultReader.gasfreeSignature = Optional.of("deadbeef");
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CONFIRMED);

    LedgerSignOutcome r = newSigner().sign(Chain.Transaction.getDefaultInstance(),
        PATH, ADDRESS, true);

    Assert.assertEquals(LedgerSignOutcome.Status.OK, r.getStatus());
    Assert.assertEquals("deadbeef", r.getGasfreeSignature());
  }

  @Test
  public void doesNotReportSuccessWhenSignedTransactionPresentButStateIsSigning() {
    // Regression: the listener stashes the input transaction in TSM before the user presses
    // the button. A non-null signedTransaction therefore does not by itself indicate confirm —
    // the state file is the authoritative discriminator.
    finder.next = new FakeDeviceHandle(DEV_PATH);
    resultReader.signedTransaction = Optional.of(Chain.Transaction.newBuilder().build());
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_SIGNING);

    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.TIMEOUT, r.getStatus());
  }

  // ---------- discovery failures ----------

  @Test
  public void returnsNotConnectedWhenDeviceMissing() {
    finder.next = null;
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.NOT_CONNECTED, r.getStatus());
  }

  @Test
  public void returnsNotConnectedWhenFinderThrows() {
    finder.toThrow = new IllegalStateException("transport boom");
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.NOT_CONNECTED, r.getStatus());
    Assert.assertTrue(r.getMessage().contains("transport boom"));
  }

  @Test
  public void returnsUnsupportedContractBeforeDeviceLookup() {
    contractSupport.canSign = false;
    finder.next = new FakeDeviceHandle(DEV_PATH);
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.UNSUPPORTED_CONTRACT, r.getStatus());
    Assert.assertFalse("device lookup should not happen for unsupported contract",
        finder.findCalled);
  }

  // ---------- APDU error mapping ----------

  @Test
  public void returnsAppNotOpenOn0x6511() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    executor.lastSendResult = new byte[]{0x65, 0x11};
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.APP_NOT_OPEN, r.getStatus());
  }

  @Test
  public void returnsSignByHashDisabledOn0x6a8c() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    executor.lastSendResult = new byte[]{0x6a, (byte) 0x8c};
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.SIGN_BY_HASH_DISABLED, r.getStatus());
  }

  @Test
  public void returnsSignFailedOnUnknownApduResponse() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    executor.lastSendResult = new byte[]{(byte) 0xff, (byte) 0xff};
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.SIGN_FAILED, r.getStatus());
    Assert.assertTrue(r.getMessage().toLowerCase().contains("0xffff"));
  }

  // ---------- pre-state ----------

  @Test
  public void returnsAlreadySigningWhenPriorStateIsSigning() {
    FakeDeviceHandle d = new FakeDeviceHandle(DEV_PATH);
    finder.next = d;
    stateReader.preState = Optional.of(NonInteractiveLedgerSigner.STATE_SIGNING);
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.ALREADY_SIGNING, r.getStatus());
    Assert.assertFalse("listener should not be invoked when a sign is already in progress",
        executor.executeCalled);
    Assert.assertTrue("device must be closed on ALREADY_SIGNING early return", d.closed);
  }

  // ---------- post-state outcomes ----------

  @Test
  public void returnsUserRejectedWhenPostStateIsCancel() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CANCEL);
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.USER_REJECTED, r.getStatus());
  }

  @Test
  public void returnsTimeoutWhenPostStateRemainsSigning() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_SIGNING);
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.TIMEOUT, r.getStatus());
    Assert.assertEquals("timeout must clear the current signing state so the next CLI command "
            + "is not blocked by a stale signing entry",
        NonInteractiveLedgerSigner.STATE_CANCEL, stateReader.updatedState);
    Assert.assertEquals(DEV_PATH, stateReader.updatedDevicePath);
    Assert.assertNotNull(stateReader.updatedTxid);
  }

  @Test
  public void marksCurrentTxSigningBeforeExecutingLedgerRequest() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CANCEL);

    LedgerSignOutcome r = signNonGasfree();

    Assert.assertEquals(LedgerSignOutcome.Status.USER_REJECTED, r.getStatus());
    Assert.assertEquals("signer must reset stale state for the current txid before waiting",
        NonInteractiveLedgerSigner.STATE_SIGNING, stateReader.signingState);
    Assert.assertEquals(DEV_PATH, stateReader.signingDevicePath);
    Assert.assertNotNull(stateReader.signingTxid);
    Assert.assertEquals("state reset must happen before listener execution",
        stateReader.signingTxid, executor.txidAtExecute);
  }

  @Test
  public void returnsSignFailedWhenPostStateIsConfirmedButNoSignaturePresent() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CONFIRMED);
    // resultReader returns empty
    LedgerSignOutcome r = signNonGasfree();
    Assert.assertEquals(LedgerSignOutcome.Status.SIGN_FAILED, r.getStatus());
  }

  // ---------- invariants ----------

  @Test
  public void closesDeviceOnEveryExitPath() {
    FakeDeviceHandle d = new FakeDeviceHandle(DEV_PATH);
    finder.next = d;
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CANCEL);
    signNonGasfree();
    Assert.assertTrue("device must be closed even on USER_REJECTED", d.closed);

    FakeDeviceHandle d2 = new FakeDeviceHandle(DEV_PATH);
    finder.next = d2;
    Chain.Transaction signed = Chain.Transaction.newBuilder().build();
    resultReader.signedTransaction = Optional.of(signed);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CONFIRMED);
    signNonGasfree();
    Assert.assertTrue("device must be closed on OK", d2.closed);
  }

  @Test
  public void resetsResultReaderOnEveryExitPath() {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CANCEL);
    signNonGasfree();
    Assert.assertTrue("must reset before sign and after; at least one reset on exit",
        resultReader.resetCalls >= 1);
  }

  @Test
  public void emitsExactlyOneStderrNoticeIncludingAddress() throws Exception {
    finder.next = new FakeDeviceHandle(DEV_PATH);
    stateReader.postState = Optional.of(NonInteractiveLedgerSigner.STATE_CONFIRMED);
    Chain.Transaction signed = Chain.Transaction.newBuilder().build();
    resultReader.signedTransaction = Optional.of(signed);
    signNonGasfree();
    String stderr = stderrBuf.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue("notice must include the address", stderr.contains(ADDRESS));
    Assert.assertEquals("notice must be exactly one line", 1,
        stderr.split("\\R").length);
    Assert.assertTrue(stderr.toLowerCase().contains("ledger"));
  }

  // ---------- fakes ----------

  private static final class FakeDeviceHandle implements LedgerPorts.DeviceHandle {
    private final String path;
    boolean closed;
    FakeDeviceHandle(String path) { this.path = path; }
    @Override public String path() { return path; }
    @Override public boolean isClosed() { return closed; }
    @Override public void close() { closed = true; }
  }

  private static final class FakeFinder implements LedgerPorts.HidDeviceFinder {
    LedgerPorts.DeviceHandle next;
    RuntimeException toThrow;
    boolean findCalled;
    @Override public LedgerPorts.DeviceHandle find(String address, String bip44Path) {
      findCalled = true;
      if (toThrow != null) throw toThrow;
      return next;
    }
  }

  private static final class FakeStateReader implements LedgerPorts.SignStateReader {
    Optional<String> preState = Optional.empty();
    Optional<String> postState = Optional.empty();
    @Override public Optional<String> lastState(String devicePath) {
      return preState;
    }
    @Override public Optional<String> stateByTxid(String devicePath, String txid) {
      return postState;
    }
    String signingDevicePath;
    String signingTxid;
    String signingState;
    @Override public void markSigning(String devicePath, String txid) {
      signingDevicePath = devicePath;
      signingTxid = txid;
      signingState = NonInteractiveLedgerSigner.STATE_SIGNING;
    }
    String updatedDevicePath;
    String updatedTxid;
    String updatedState;
    @Override public void markCanceled(String devicePath, String txid) {
      updatedDevicePath = devicePath;
      updatedTxid = txid;
      updatedState = NonInteractiveLedgerSigner.STATE_CANCEL;
    }
  }

  private static final class FakeExecutor implements LedgerPorts.SignExecutor {
    byte[] lastSendResult;
    boolean executeCalled;
    String txidAtExecute;
    @Override public boolean executeSignListen(LedgerPorts.DeviceHandle device,
                                               Chain.Transaction tx, String path, boolean gasfree) {
      executeCalled = true;
      txidAtExecute = org.tron.common.utils.TransactionUtils.getTransactionId(tx).toString();
      return true;
    }
    @Override public byte[] lastSendResultBytes() { return lastSendResult; }
  }

  private static final class FakeResultReader implements LedgerPorts.SignResultReader {
    Optional<String> gasfreeSignature = Optional.empty();
    Optional<Chain.Transaction> signedTransaction = Optional.empty();
    int resetCalls;
    Chain.Transaction preparedTransaction;
    @Override public void prepareTransaction(Chain.Transaction transaction) {
      preparedTransaction = transaction;
    }
    @Override public Optional<String> gasfreeSignature() { return gasfreeSignature; }
    @Override public Optional<Chain.Transaction> signedTransaction() { return signedTransaction; }
    @Override public void reset() { resetCalls++; }
  }

  private static final class FakeContractSupport implements LedgerPorts.ContractSupport {
    boolean canSign = true;
    @Override public boolean canSign(Chain.Transaction transaction) { return canSign; }
  }
}
