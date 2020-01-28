package org.tron.core.exception;

public class TransactionException extends RuntimeException {

    public final String codeName;
    public final int codeNumber;

    public TransactionException(String message, String codeName, int codeNumber) {
        super(message);
        this.codeName = codeName;
        this.codeNumber = codeNumber;
    }
}
