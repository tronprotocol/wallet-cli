package org.tron.walletcli.cli.ledger;

import org.tron.trident.proto.Chain;

/**
 * Signs a transaction using a Ledger hardware wallet from the standard CLI.
 *
 * <p>Implementations must be non-interactive (no prompts on stdin/stdout) and must always return an
 * outcome rather than throwing — sign-site code translates non-OK outcomes into structured
 * command errors.
 */
public interface LedgerSigner {

    /**
     * @param transaction the transaction to sign (or, for gasfree, a synthetic transaction whose
     *     raw data hash is the gasfree message digest)
     * @param bip44Path the derivation path stored in the keystore (e.g. {@code m/44'/195'/0'/0/0})
     * @param address the Tron address that the path is expected to produce on the device
     * @param gasfree {@code true} for the gasfree sign flow (digest-only signature),
     *     {@code false} for the regular signTransactionForCli path
     */
    LedgerSignOutcome sign(Chain.Transaction transaction,
                           String bip44Path,
                           String address,
                           boolean gasfree);
}
