package org.tron.walletcli.cli.ledger;

import org.tron.trident.proto.Chain;

/** Result of {@link LedgerSigner#sign}. Non-throwing; carries the failure cause as a status enum. */
public final class LedgerSignOutcome {

    public enum Status {
        OK,
        NOT_CONNECTED,
        APP_NOT_OPEN,
        SIGN_BY_HASH_DISABLED,
        UNSUPPORTED_CONTRACT,
        ALREADY_SIGNING,
        USER_REJECTED,
        TIMEOUT,
        SIGN_FAILED,
    }

    private final Status status;
    private final String message;
    private final Chain.Transaction signedTransaction;
    private final String gasfreeSignature;

    private LedgerSignOutcome(Status status, String message,
                              Chain.Transaction signedTransaction, String gasfreeSignature) {
        this.status = status;
        this.message = message;
        this.signedTransaction = signedTransaction;
        this.gasfreeSignature = gasfreeSignature;
    }

    public static LedgerSignOutcome ok(Chain.Transaction signedTransaction) {
        return new LedgerSignOutcome(Status.OK, null, signedTransaction, null);
    }

    public static LedgerSignOutcome okGasfree(String gasfreeSignature) {
        return new LedgerSignOutcome(Status.OK, null, null, gasfreeSignature);
    }

    public static LedgerSignOutcome failure(Status status, String message) {
        if (status == Status.OK) {
            throw new IllegalArgumentException("OK is a success status; use ok() / okGasfree()");
        }
        return new LedgerSignOutcome(status, message, null, null);
    }

    public Status getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public Chain.Transaction getSignedTransaction() {
        return signedTransaction;
    }

    public String getGasfreeSignature() {
        return gasfreeSignature;
    }

    /** Maps non-OK statuses to the {@code ledger_*} error code used in the JSON envelope. */
    public String errorCode() {
        switch (status) {
            case OK: return null;
            case NOT_CONNECTED: return "ledger_not_connected";
            case APP_NOT_OPEN: return "ledger_app_not_open";
            case SIGN_BY_HASH_DISABLED: return "ledger_sign_by_hash_disabled";
            case UNSUPPORTED_CONTRACT: return "ledger_unsupported_contract";
            case ALREADY_SIGNING: return "ledger_already_signing";
            case USER_REJECTED: return "ledger_user_rejected";
            case TIMEOUT: return "ledger_timeout";
            case SIGN_FAILED:
            default: return "ledger_sign_failed";
        }
    }
}
