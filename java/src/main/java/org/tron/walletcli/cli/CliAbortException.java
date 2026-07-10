package org.tron.walletcli.cli;

final class CliAbortException extends RuntimeException {

    enum Kind {
        EXECUTION,
        USAGE
    }

    private final Kind kind;

    CliAbortException(Kind kind) {
        super(null, null, false, false);
        this.kind = kind;
    }

    Kind getKind() {
        return kind;
    }
}
