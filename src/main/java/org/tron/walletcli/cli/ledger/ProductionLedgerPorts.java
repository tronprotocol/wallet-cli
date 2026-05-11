package org.tron.walletcli.cli.ledger;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.hid4java.HidDevice;
import org.tron.ledger.LedgerAddressUtil;
import org.tron.ledger.listener.LedgerEventListener;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.ContractTypeChecker;
import org.tron.ledger.wrapper.HidServicesWrapper;
import org.tron.ledger.wrapper.LedgerSignResult;
import org.tron.trident.proto.Chain;
import org.tron.walletcli.cli.OutputFormatter;

/**
 * Wires {@link LedgerPorts} interfaces to the existing process-wide singletons. This is the
 * production composition root for {@link NonInteractiveLedgerSigner}.
 */
public final class ProductionLedgerPorts {

    private ProductionLedgerPorts() {}

    public static NonInteractiveLedgerSigner buildSigner(OutputFormatter formatter) {
        LedgerPorts.HidDeviceFinder finder = (address, path) -> {
            HidDevice device = HidServicesWrapper.getInstance().getHidDevice(address, path);
            if (device == null) {
                return null;
            }
            boolean matched = false;
            try {
                if (device.isClosed()) {
                    device.open();
                }
                String deviceAddress = LedgerAddressUtil.getTronAddress(path, device);
                matched = address.equals(deviceAddress);
                if (!matched) {
                    return null;
                }
                return new HidDeviceAdapter(device);
            } finally {
                if (!matched && !device.isClosed()) {
                    device.close();
                }
            }
        };

        LedgerPorts.SignStateReader stateReader =
                new LedgerPorts.SignStateReader() {
                    @Override
                    public Optional<String> lastState(String devicePath) {
                        return LedgerSignResult.getLastTransactionState(devicePath);
                    }

                    @Override
                    public Optional<String> stateByTxid(String devicePath, String txid) {
                        return LedgerSignResult.getStateByTxid(devicePath, txid);
                    }

                    @Override
                    public void markSigning(String devicePath, String txid) {
                        LedgerSignResult.upsertState(
                                devicePath, txid, LedgerSignResult.SIGN_RESULT_SIGNING);
                    }

                    @Override
                    public void markCanceled(String devicePath, String txid) {
                        LedgerSignResult.updateState(
                                devicePath, txid, LedgerSignResult.SIGN_RESULT_CANCEL);
                    }
                };

        LedgerPorts.SignExecutor executor = new LedgerPorts.SignExecutor() {
            @Override
            public boolean executeSignListen(LedgerPorts.DeviceHandle device, Chain.Transaction tx,
                                             String path, boolean gasfree) {
                HidDevice raw = ((HidDeviceAdapter) device).delegate;
                LedgerEventListener listener = LedgerEventListener.getInstance();
                listener.setStandardCliQuiet(true);
                listener.setLedgerSignEnd(new AtomicBoolean(false));
                if (raw.isClosed()) {
                    raw.open();
                }
                boolean accepted = listener.executeSignListen(raw, tx, path, gasfree);
                if (listener.getLastSendResultBytes() != null || !accepted) {
                    listener.setStandardCliQuiet(false);
                }
                return accepted;
            }

            @Override
            public byte[] lastSendResultBytes() {
                return LedgerEventListener.getInstance().getLastSendResultBytes();
            }
        };

        LedgerPorts.SignResultReader resultReader = new LedgerPorts.SignResultReader() {
            @Override
            public void prepareTransaction(Chain.Transaction transaction) {
                TransactionSignManager.getInstance().setTransaction(transaction);
            }

            @Override
            public Optional<String> gasfreeSignature() {
                String sig = TransactionSignManager.getInstance().getGasfreeSignature();
                return sig == null || sig.isEmpty() ? Optional.empty() : Optional.of(sig);
            }

            @Override
            public Optional<Chain.Transaction> signedTransaction() {
                Chain.Transaction tx = TransactionSignManager.getInstance().getTransaction();
                return tx == null ? Optional.empty() : Optional.of(tx);
            }

            @Override
            public void reset() {
                TransactionSignManager.getInstance().setTransaction(null);
                TransactionSignManager.getInstance().setGasfreeSignature(null);
            }
        };

        LedgerPorts.ContractSupport contractSupport = transaction -> {
            if (transaction.getRawData().getContractCount() == 0) {
                return false;
            }
            String type = transaction.getRawData().getContract(0).getType().toString();
            try (SystemOutSuppressor ignored = SystemOutSuppressor.capture()) {
                return ContractTypeChecker.canUseLedgerSign(type);
            }
        };

        return new NonInteractiveLedgerSigner(formatter, finder, stateReader, executor, resultReader,
                contractSupport);
    }

    /** Thin adapter so the signer can stay free of {@code org.hid4java} types. */
    private static final class HidDeviceAdapter implements LedgerPorts.DeviceHandle {
        private final HidDevice delegate;

        HidDeviceAdapter(HidDevice delegate) {
            this.delegate = delegate;
        }

        @Override
        public String path() {
            return delegate.getPath();
        }

        @Override
        public boolean isClosed() {
            return delegate.isClosed();
        }

        @Override
        public void close() {
            delegate.close();
        }
    }
}
