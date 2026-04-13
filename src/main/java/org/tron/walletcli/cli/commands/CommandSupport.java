package org.tron.walletcli.cli.commands;

import org.tron.walletcli.cli.OutputFormatter;

import java.util.LinkedHashMap;
import java.util.Map;

final class CommandSupport {

    private CommandSupport() {
    }

    static void emitBooleanResult(OutputFormatter out, boolean success,
                                  String successMessage, String failureMessage) {
        if (!success) {
            out.error("execution_error", failureMessage);
            return;
        }
        out.successMessage(successMessage);
    }

    static void emitBooleanResult(OutputFormatter out, boolean success,
                                  String successMessage, String failureMessage,
                                  Map<String, Object> jsonData) {
        if (!success) {
            out.error("execution_error", failureMessage);
            return;
        }
        if (jsonData == null || jsonData.isEmpty()) {
            out.successMessage(successMessage);
            return;
        }
        if (!jsonData.containsKey("message")) {
            jsonData.put("message", successMessage);
        }
        out.success(successMessage, jsonData);
    }

    static Map<String, Object> lastBroadcastTxResultData() {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        String txid = org.tron.walletserver.WalletApi.consumeLastBroadcastTxId();
        if (txid != null && !txid.isEmpty()) {
            data.put("txid", txid);
        }
        return data;
    }

    static void requirePositive(OutputFormatter out, String name, long value) {
        if (value <= 0) {
            out.usageError(name + " must be a positive integer, got: " + value, null);
        }
    }

    static void requireForce(OutputFormatter out, String commandName, boolean force) {
        if (!force) {
            out.usageError(commandName + " requires --force in standard CLI mode.", null);
        }
    }

}
