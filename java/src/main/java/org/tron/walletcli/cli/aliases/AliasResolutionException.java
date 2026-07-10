package org.tron.walletcli.cli.aliases;

public class AliasResolutionException extends IllegalArgumentException {
    public AliasResolutionException(String message) {
        super(message);
    }

    @Override
    public Throwable fillInStackTrace() {
        return this;
    }
}
