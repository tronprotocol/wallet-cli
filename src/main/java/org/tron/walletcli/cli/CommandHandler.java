package org.tron.walletcli.cli;

import org.tron.walletcli.WalletApiWrapper;

/**
 * Functional interface for command execution logic.
 */
public interface CommandHandler {

    /**
     * Executes the command.
     *
     * @param opts    parsed command-line options
     * @param wrapper wallet API wrapper for blockchain operations
     * @param out     output formatter for writing results
     * @throws Exception if execution fails
     */
    void execute(ParsedOptions opts, WalletApiWrapper wrapper, OutputFormatter out)
            throws Exception;
}
