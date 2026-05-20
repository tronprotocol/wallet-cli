package org.tron.walletcli.cli.ledger;

import java.util.Optional;
import org.tron.trident.proto.Chain;

/**
 * Test seams over the singleton-based Ledger collaborators. Production wiring delegates to
 * {@code HidServicesWrapper.getInstance()} / {@code LedgerEventListener.getInstance()};
 * tests inject hand-written fakes since the codebase has no Mockito.
 *
 * <p>{@link DeviceHandle} hides the concrete {@code org.hid4java.HidDevice} (which has a
 * complex constructor) so tests can use a trivial record-style fake.
 */
public final class LedgerPorts {

    private LedgerPorts() {}

    /**
     * Opaque handle to a connected device. The signer only needs its path (for state lookups)
     * and a way to close it after the sign.
     */
    public interface DeviceHandle {
        String path();
        boolean isClosed();
        void close();
    }

    /** Looks up the connected Ledger device whose Tron-app-derived address at {@code path} matches. */
    public interface HidDeviceFinder {
        DeviceHandle find(String address, String bip44Path);
    }

    /** Reads the current sign state for a device (file-backed in production via {@code LedgerSignResult}). */
    public interface SignStateReader {
        /**
         * @return {@code Optional.empty()} if no state recorded; otherwise one of the
         *     {@code SIGN_RESULT_*} constants from {@code LedgerSignResult}.
         */
        Optional<String> lastState(String devicePath);

        /**
         * Reads the state for the current transaction instead of the device's last recorded line.
         */
        Optional<String> stateByTxid(String devicePath, String txid);

        /**
         * Marks the current transaction as signing before the request is sent, even when the same
         * txid already exists in the Ledger state file from a previous attempt.
         */
        void markSigning(String devicePath, String txid);

        /**
         * Marks the current transaction as canceled or aborted so it does not remain signing.
         */
        void markCanceled(String devicePath, String txid);

        /**
         * Marks the current transaction as timed out after the standard CLI stops waiting for
         * confirmation.
         */
        void markTimedOut(String devicePath, String txid);
    }

    /** Drives the actual APDU exchange and waits for the on-device button. */
    public interface SignExecutor {
        /** Returns true if the request was accepted by the device (regardless of user button). */
        boolean executeSignListen(DeviceHandle device, Chain.Transaction tx,
                                  String bip44Path, boolean gasfree);

        /** Bytes returned by the listener's last {@code handleTransSign} call (may be null). */
        byte[] lastSendResultBytes();
    }

    /** Reads the signature/transaction the listener stashed after a confirmed sign. */
    public interface SignResultReader {
        /**
         * Prepares the singleton-backed listener to attach the returned Ledger signature to this
         * transaction. This mirrors the legacy REPL setup before executeSignListen.
         */
        void prepareTransaction(Chain.Transaction transaction);

        /** {@code Optional.empty()} if no signature was produced; otherwise the gasfree signature hex. */
        Optional<String> gasfreeSignature();

        /** {@code Optional.empty()} if no signed transaction was produced. */
        Optional<Chain.Transaction> signedTransaction();

        /** Resets transaction/signature fields. Called in {@code finally}. */
        void reset();
    }

    /** Mirrors the legacy REPL Ledger contract-type allowlist. */
    public interface ContractSupport {
        boolean canSign(Chain.Transaction transaction);
    }

    /**
     * Thrown by {@link HidDeviceFinder#find} when the Ledger device is physically connected
     * but the Tron app is not open (APDU status word {@code 0x6511}).
     * Distinct from a plain {@code null} return (device not found / address mismatch).
     */
    public static final class AppNotOpenException extends RuntimeException {
        public AppNotOpenException(String message) {
            super(message);
        }
    }
}
