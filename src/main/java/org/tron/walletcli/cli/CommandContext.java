package org.tron.walletcli.cli;

import java.io.File;

public class CommandContext {

    private static final CommandContext EMPTY = new CommandContext(null, null, null);

    private final String walletOverride;
    private final File resolvedAuthWalletFile;
    private final StandardCliRunner.MasterPasswordProvider masterPasswordProvider;

    public CommandContext(String walletOverride) {
        this(walletOverride, null, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile) {
        this(walletOverride, resolvedAuthWalletFile, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile,
                          StandardCliRunner.MasterPasswordProvider masterPasswordProvider) {
        this.walletOverride = walletOverride;
        this.resolvedAuthWalletFile = resolvedAuthWalletFile;
        this.masterPasswordProvider = masterPasswordProvider;
    }

    public static CommandContext empty() {
        return EMPTY;
    }

    public static CommandContext fromGlobalOptions(GlobalOptions globalOptions,
                                                    StandardCliRunner.MasterPasswordProvider masterPasswordProvider) {
        return new CommandContext(
                globalOptions != null ? globalOptions.getWallet() : null,
                null,
                masterPasswordProvider);
    }

    public String getWalletOverride() {
        return walletOverride;
    }

    public File getResolvedAuthWalletFile() {
        return resolvedAuthWalletFile;
    }

    public String getMasterPassword() {
        return masterPasswordProvider != null ? masterPasswordProvider.get() : null;
    }

    public CommandContext withResolvedAuthWalletFile(File file) {
        return new CommandContext(walletOverride, file, masterPasswordProvider);
    }
}
