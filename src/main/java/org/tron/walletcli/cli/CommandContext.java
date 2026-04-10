package org.tron.walletcli.cli;

import java.io.File;

public class CommandContext {

    private static final CommandContext EMPTY = new CommandContext(null, null);

    private final String walletOverride;
    private final File resolvedAuthWalletFile;

    public CommandContext(String walletOverride) {
        this(walletOverride, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile) {
        this.walletOverride = walletOverride;
        this.resolvedAuthWalletFile = resolvedAuthWalletFile;
    }

    public static CommandContext empty() {
        return EMPTY;
    }

    public static CommandContext fromGlobalOptions(GlobalOptions globalOptions) {
        return new CommandContext(globalOptions != null ? globalOptions.getWallet() : null, null);
    }

    public String getWalletOverride() {
        return walletOverride;
    }

    public File getResolvedAuthWalletFile() {
        return resolvedAuthWalletFile;
    }

    public CommandContext withResolvedAuthWalletFile(File file) {
        return new CommandContext(walletOverride, file);
    }
}
