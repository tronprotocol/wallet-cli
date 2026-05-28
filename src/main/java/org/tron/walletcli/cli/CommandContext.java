package org.tron.walletcli.cli;

import java.io.File;

public class CommandContext {

    private static final CommandContext EMPTY = new CommandContext(null, null, null, null);

    private final String walletOverride;
    private final File resolvedAuthWalletFile;
    private final StandardCliRunner.MasterPasswordProvider masterPasswordProvider;
    private final org.tron.walletcli.cli.aliases.AliasResolver aliasResolver;

    public CommandContext(String walletOverride) {
        this(walletOverride, null, null, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile) {
        this(walletOverride, resolvedAuthWalletFile, null, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile,
                          StandardCliRunner.MasterPasswordProvider masterPasswordProvider) {
        this(walletOverride, resolvedAuthWalletFile, masterPasswordProvider, null);
    }

    public CommandContext(String walletOverride, File resolvedAuthWalletFile,
                          StandardCliRunner.MasterPasswordProvider masterPasswordProvider,
                          org.tron.walletcli.cli.aliases.AliasResolver aliasResolver) {
        this.walletOverride = walletOverride;
        this.resolvedAuthWalletFile = resolvedAuthWalletFile;
        this.masterPasswordProvider = masterPasswordProvider;
        this.aliasResolver = aliasResolver;
    }

    public static CommandContext empty() {
        return EMPTY;
    }

    public static CommandContext fromGlobalOptions(GlobalOptions globalOptions,
                                                    StandardCliRunner.MasterPasswordProvider masterPasswordProvider) {
        return new CommandContext(
                globalOptions != null ? globalOptions.getWallet() : null,
                null,
                masterPasswordProvider,
                null);
    }

    public static CommandContext fromGlobalOptions(GlobalOptions globalOptions,
                                                    StandardCliRunner.MasterPasswordProvider masterPasswordProvider,
                                                    org.tron.walletcli.cli.aliases.AliasResolver aliasResolver) {
        return new CommandContext(
                globalOptions != null ? globalOptions.getWallet() : null,
                null,
                masterPasswordProvider,
                aliasResolver);
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

    public org.tron.walletcli.cli.aliases.AliasResolver getAliasResolver() {
        return aliasResolver;
    }

    public CommandContext withResolvedAuthWalletFile(File file) {
        return new CommandContext(walletOverride, file, masterPasswordProvider, aliasResolver);
    }
}
