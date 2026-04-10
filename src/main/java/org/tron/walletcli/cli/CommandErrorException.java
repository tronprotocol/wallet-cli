package org.tron.walletcli.cli;

public final class CommandErrorException extends RuntimeException {

    private final String code;

    public CommandErrorException(String code, String message) {
        super(message, null, false, false);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
