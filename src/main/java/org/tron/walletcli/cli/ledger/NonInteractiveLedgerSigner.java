package org.tron.walletcli.cli.ledger;

import static org.tron.common.utils.TransactionUtils.getTransactionId;

import java.util.Optional;
import org.tron.trident.proto.Chain;
import org.tron.walletcli.cli.OutputFormatter;

/**
 * Non-interactive {@link LedgerSigner} for the standard CLI.
 *
 * <p>Wires the existing Ledger machinery (HID discovery, listener, {@code TransactionSignManager},
 * {@code LedgerSignResult}) into a structured outcome without printing prompts or reading from
 * stdin. Stdout output from shared Ledger code is suppressed for the duration of the sign call;
 * one stderr notice is emitted via the formatter so the user knows to press the on-device button.
 *
 * <p>The signer never throws — every failure mode is reported via {@link LedgerSignOutcome}.
 * The sign-site code translates non-OK outcomes into {@code CommandErrorException}.
 */
public final class NonInteractiveLedgerSigner implements LedgerSigner {

    /**
     * Status strings written by {@code LedgerSignResult}. These mirror its public constants
     * (kept private here to avoid forcing test fakes to depend on the listener package).
     */
    static final String STATE_SIGNING = "signing";    // SIGN_RESULT_SIGNING — in progress
    static final String STATE_CONFIRMED = "confirmed"; // SIGN_RESULT_SUCCESS — user confirmed
    static final String STATE_CANCEL = "cancel";       // SIGN_RESULT_CANCEL — rejected or late response

    /** APDU status word: Tron app is not open on the device. */
    private static final byte[] APDU_APP_IS_OPEN = new byte[] { 0x65, 0x11 };
    /** APDU status word: "Sign By Hash" setting is not enabled. */
    private static final byte[] APDU_SIGN_BY_HASH = new byte[] { 0x6a, (byte) 0x8c };

    private final OutputFormatter formatter;
    private final LedgerPorts.HidDeviceFinder finder;
    private final LedgerPorts.SignStateReader stateReader;
    private final LedgerPorts.SignExecutor executor;
    private final LedgerPorts.SignResultReader resultReader;
    private final LedgerPorts.ContractSupport contractSupport;

    public NonInteractiveLedgerSigner(OutputFormatter formatter,
                                      LedgerPorts.HidDeviceFinder finder,
                                      LedgerPorts.SignStateReader stateReader,
                                      LedgerPorts.SignExecutor executor,
                                      LedgerPorts.SignResultReader resultReader,
                                      LedgerPorts.ContractSupport contractSupport) {
        this.formatter = formatter;
        this.finder = finder;
        this.stateReader = stateReader;
        this.executor = executor;
        this.resultReader = resultReader;
        this.contractSupport = contractSupport;
    }

    @Override
    public LedgerSignOutcome sign(Chain.Transaction transaction,
                                  String bip44Path,
                                  String address,
                                  boolean gasfree) {
        if (!gasfree && !contractSupport.canSign(transaction)) {
            return LedgerSignOutcome.failure(LedgerSignOutcome.Status.UNSUPPORTED_CONTRACT,
                    "Transaction type is not supported by Ledger signing");
        }

        LedgerPorts.DeviceHandle device;
        try (SystemOutSuppressor ignored = SystemOutSuppressor.capture()) {
            try {
                device = finder.find(address, bip44Path);
            } catch (RuntimeException e) {
                return LedgerSignOutcome.failure(LedgerSignOutcome.Status.NOT_CONNECTED,
                        "HID transport failure: " + e.getMessage());
            }
        }

        if (device == null) {
            return LedgerSignOutcome.failure(LedgerSignOutcome.Status.NOT_CONNECTED,
                    "No Ledger device matching address " + address + " is connected");
        }

        Optional<String> preState = stateReader.lastState(device.path());
        if (preState.isPresent() && STATE_SIGNING.equals(preState.get())) {
            return LedgerSignOutcome.failure(LedgerSignOutcome.Status.ALREADY_SIGNING,
                    "A previous sign operation is still in progress on the Ledger device");
        }

        // Defensive reset to avoid contamination from any prior interrupted sign.
        resultReader.reset();
        resultReader.prepareTransaction(transaction);

        formatter.notice("Please confirm transaction on Ledger device for " + address);
        String txid = getTransactionId(transaction).toString();

        try {
            try (SystemOutSuppressor ignored = SystemOutSuppressor.capture()) {
                executor.executeSignListen(device, transaction, bip44Path, gasfree);
            }

            byte[] apdu = executor.lastSendResultBytes();
            if (apdu != null && apdu.length > 0) {
                if (matches(apdu, APDU_APP_IS_OPEN)) {
                    return LedgerSignOutcome.failure(LedgerSignOutcome.Status.APP_NOT_OPEN,
                            "Open the Tron app on your Ledger device and try again");
                }
                if (matches(apdu, APDU_SIGN_BY_HASH)) {
                    return LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_BY_HASH_DISABLED,
                            "Enable 'Sign By Hash' in the Ledger Tron app settings and try again");
                }
                return LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_FAILED,
                        "Ledger returned APDU error " + toHex(apdu));
            }

            // The state file (LedgerSignResult) is the authoritative discriminator. The
            // listener stashes the *input* transaction in TransactionSignManager before waiting
            // for the button, so checking signedTransaction()-non-null alone would falsely
            // report success on timeout. We trust the state, then fetch the signature/transaction.
            Optional<String> postState = stateReader.stateByTxid(device.path(), txid);
            if (postState.isPresent()) {
                if (STATE_CONFIRMED.equals(postState.get())) {
                    if (gasfree) {
                        Optional<String> sig = resultReader.gasfreeSignature();
                        if (sig.isPresent()) {
                            return LedgerSignOutcome.okGasfree(sig.get());
                        }
                    } else {
                        Optional<Chain.Transaction> signed = resultReader.signedTransaction();
                        if (signed.isPresent()) {
                            return LedgerSignOutcome.ok(signed.get());
                        }
                    }
                    return LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_FAILED,
                            "Ledger reported confirmation but no signature was recorded");
                }
                // STATE_CANCEL covers both the user-pressed-reject case and the rare
                // "device responded after our 60s window" case. From the user's perspective
                // both are "the sign did not complete because the user did not confirm in time".
                if (STATE_CANCEL.equals(postState.get())) {
                    return LedgerSignOutcome.failure(LedgerSignOutcome.Status.USER_REJECTED,
                            "Transaction was rejected on the Ledger device");
                }
                if (STATE_SIGNING.equals(postState.get())) {
                    return LedgerSignOutcome.failure(LedgerSignOutcome.Status.TIMEOUT,
                            "Timed out waiting for confirmation on Ledger device");
                }
            }
            return LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_FAILED,
                    "Ledger sign ended in an unexpected state: "
                            + postState.orElse("(no state recorded)"));
        } catch (RuntimeException e) {
            return LedgerSignOutcome.failure(LedgerSignOutcome.Status.SIGN_FAILED,
                    "Unexpected failure during Ledger sign: " + e.getMessage());
        } finally {
            resultReader.reset();
            try {
                if (!device.isClosed()) {
                    device.close();
                }
            } catch (RuntimeException ignored) {
                // Best-effort close; primary outcome is already determined.
            }
        }
    }

    private static boolean matches(byte[] actual, byte[] expected) {
        if (actual.length != expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if (actual[i] != expected[i]) {
                return false;
            }
        }
        return true;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder("0x");
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }
}
