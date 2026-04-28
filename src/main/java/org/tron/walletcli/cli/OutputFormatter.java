package org.tron.walletcli.cli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.protobuf.Message;

import java.io.PrintStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class OutputFormatter {

    public enum OutputMode { TEXT, JSON }
    private static final String MULTIPLE_OUTCOMES_MESSAGE = "Multiple terminal outcomes emitted";
    private static final int MAX_METADATA_KEYS = 12;
    private static final int MAX_METADATA_VALUE_LENGTH = 200;

    private final OutputMode mode;
    private final boolean quiet;
    private final PrintStream out;
    private final PrintStream err;
    private Outcome outcome;
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public OutputFormatter(OutputMode mode, boolean quiet) {
        this(mode, quiet, System.out, System.err);
    }

    public OutputFormatter(OutputMode mode, boolean quiet, PrintStream out, PrintStream err) {
        this.mode = mode;
        this.quiet = quiet;
        this.out = out;
        this.err = err;
    }

    OutputMode getMode() {
        return mode;
    }

    private void emitJsonSuccess(Object data) {
        Map<String, Object> envelope = new LinkedHashMap<String, Object>();
        envelope.put("success", true);
        envelope.put("data", data != null ? data : new LinkedHashMap<String, Object>());
        out.println(gson.toJson(envelope));
    }

    private void emitJsonError(String code, String message) {
        Map<String, Object> envelope = new LinkedHashMap<String, Object>();
        envelope.put("success", false);
        envelope.put("error", code);
        envelope.put("message", message);
        out.println(gson.toJson(envelope));
    }

    private Map<String, Object> wrapMessage(String text) {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put("message", text);
        return data;
    }

    private Map<String, Object> wrapResult(Object value) {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put("result", value);
        return data;
    }

    private Object normalizeJsonElement(JsonElement element) {
        if (element == null || element.isJsonNull()) {
            return new LinkedHashMap<String, Object>();
        }
        if (element.isJsonObject()) {
            return element;
        }
        return wrapResult(element);
    }

    private Object normalizeJsonData(Object payload) {
        if (payload == null) {
            return new LinkedHashMap<String, Object>();
        }
        if (payload instanceof Map) {
            return payload;
        }
        if (payload instanceof JsonElement) {
            return normalizeJsonElement((JsonElement) payload);
        }
        if (payload instanceof Number || payload instanceof Boolean) {
            return wrapResult(payload);
        }

        String text = String.valueOf(payload);
        try {
            return normalizeJsonElement(JsonParser.parseString(text));
        } catch (Exception e) {
            return wrapMessage(text);
        }
    }

    private void recordSuccess(String textMessage, Object jsonData) {
        recordSuccess(textMessage, jsonData, false);
    }

    private void recordSuccess(String textMessage, Object jsonData, boolean queryResult) {
        if (outcome != null) {
            recordMultipleOutcomeViolation();
            throw new CliAbortException(CliAbortException.Kind.EXECUTION);
        }
        outcome = Outcome.success(textMessage, normalizeJsonData(jsonData), queryResult);
    }

    private void recordError(String code, String message, CliAbortException.Kind abortKind, String usageHelp) {
        if (outcome != null) {
            recordMultipleOutcomeViolation();
            throw new CliAbortException(CliAbortException.Kind.EXECUTION);
        }
        outcome = Outcome.error(code, message, usageHelp);
        throw new CliAbortException(abortKind);
    }

    private void recordMultipleOutcomeViolation() {
        outcome = Outcome.error("execution_error", MULTIPLE_OUTCOMES_MESSAGE, null);
    }

    public boolean hasOutcome() {
        return outcome != null;
    }

    public void flush() {
        if (outcome == null) {
            return;
        }

        Outcome current = outcome;
        outcome = null;
        if (current.success) {
            if (mode == OutputMode.JSON) {
                emitJsonSuccess(current.jsonData);
            } else {
                out.println(current.textMessage);
                if (current.queryResult) {
                    renderQueryResult(current.jsonData);
                } else {
                    renderMetadata(current.jsonData);
                }
            }
            return;
        }

        if (mode == OutputMode.JSON) {
            emitJsonError(current.errorCode, current.errorMessage);
        } else {
            err.println("Error: " + current.errorMessage);
            if (current.usageHelp != null) {
                err.println();
                err.println(current.usageHelp);
            }
        }
    }

    /** Print a successful result with a text message and optional JSON data. */
    public void success(String textMessage, Object jsonData) {
        recordSuccess(textMessage, jsonData);
    }

    /** Print a query result with a success message and formatter-selected text details. */
    public void queryResult(String textMessage, Object resultData) {
        recordSuccess(textMessage, resultData, true);
    }

    /** Print a success message in text mode and expose it under data.message in JSON mode. */
    public void successMessage(String textMessage) {
        recordSuccess(textMessage, wrapMessage(textMessage));
    }

    /** Print command help in a formatter-owned success shape. */
    public void help(String helpText) {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put("help", helpText);
        recordSuccess(helpText, data);
    }

    /** Print a simple success/failure result. */
    public void result(boolean success, String successMsg, String failMsg) {
        if (!success) {
            error("execution_error", failMsg);
            return;
        }
        successMessage(successMsg);
    }

    /** Print a protobuf message. Uses Utils.formatMessageString which decodes
     *  addresses to Base58 and bytes to readable strings for both modes. */
    public void protobuf(Message message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        String formatted = org.tron.common.utils.Utils.formatMessageString(message);
        recordSuccess(formatted, mode == OutputMode.TEXT ? wrapMessage(formatted) : formatted);
    }

    /** Print a message object (trident Response types or pre-formatted strings). */
    public void printMessage(Object message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        String text = String.valueOf(message);
        recordSuccess(text, mode == OutputMode.TEXT ? wrapMessage(text) : message);
    }

    /** Print raw text. */
    public void raw(String text) {
        recordSuccess(text, wrapMessage(text));
    }

    /** Print a key-value pair. */
    public void keyValue(String key, Object value) {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put(key, value);
        recordSuccess(key + " = " + value, data);
    }

    private void renderQueryResult(Object jsonData) {
        if (shouldRenderAsMetadata(jsonData)) {
            renderMetadata(jsonData);
            return;
        }
        out.println();
        out.println("  Result:");
        out.println(indentResult(gson.toJson(jsonData)));
    }

    private String indentResult(String text) {
        return "  " + text.replace(System.lineSeparator(), System.lineSeparator() + "  ");
    }

    private void renderMetadata(Object jsonData) {
        Map<?, ?> kvPairs = objectEntries(jsonData);
        // Intentional: text mode surfaces structured data as an aligned metadata table,
        // giving human users richer context without requiring --output json.
        if (kvPairs != null) {
            List<Map.Entry<?, ?>> details = new ArrayList<>();
            int maxKeyLen = 0;
            for (Map.Entry<?, ?> e : kvPairs.entrySet()) {
                if ("message".equals(e.getKey())) continue;
                details.add(e);
                maxKeyLen = Math.max(maxKeyLen, String.valueOf(e.getKey()).length());
            }
            if (!details.isEmpty()) {
                out.println();
                out.println("  Metadata:");
                String fmt = "    %-" + maxKeyLen + "s : %s%n";
                for (Map.Entry<?, ?> e : details) {
                    out.printf(fmt, e.getKey(), e.getValue());
                }
            }
        }
    }

    private Map<?, ?> objectEntries(Object jsonData) {
        if (jsonData instanceof Map) {
            return (Map<?, ?>) jsonData;
        }
        if (jsonData instanceof JsonElement && ((JsonElement) jsonData).isJsonObject()) {
            return ((JsonElement) jsonData).getAsJsonObject().asMap();
        }
        return null;
    }

    private boolean shouldRenderAsMetadata(Object jsonData) {
        Map<?, ?> kvPairs = objectEntries(jsonData);
        if (kvPairs == null || kvPairs.size() > MAX_METADATA_KEYS) {
            return false;
        }
        for (Map.Entry<?, ?> e : kvPairs.entrySet()) {
            if ("message".equals(e.getKey())) {
                continue;
            }
            if (!isMetadataValue(e.getValue())) {
                return false;
            }
            if (String.valueOf(e.getValue()).length() > MAX_METADATA_VALUE_LENGTH) {
                return false;
            }
        }
        return true;
    }

    private boolean isMetadataValue(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean
                || value instanceof Character) {
            return true;
        }
        if (value instanceof JsonElement) {
            JsonElement element = (JsonElement) value;
            return element.isJsonNull() || element.isJsonPrimitive();
        }
        return false;
    }

    /** Print an error and signal exit code 1. */
    public void error(String code, String message) {
        recordError(code, message, CliAbortException.Kind.EXECUTION, null);
    }

    /** Print an error for usage mistakes and signal exit code 2. */
    public void usageError(String message, CommandDefinition cmd) {
        recordError("usage_error", message, CliAbortException.Kind.USAGE,
                cmd != null ? cmd.formatHelp() : null);
    }

    /** Print info to stderr (suppressed in quiet mode and JSON mode). */
    public void info(String message) {
        if (!quiet && mode != OutputMode.JSON) {
            err.println(message);
        }
    }

    private static final class Outcome {
        private final boolean success;
        private final String textMessage;
        private final Object jsonData;
        private final boolean queryResult;
        private final String errorCode;
        private final String errorMessage;
        private final String usageHelp;

        private Outcome(boolean success, String textMessage, Object jsonData, boolean queryResult,
                        String errorCode, String errorMessage, String usageHelp) {
            this.success = success;
            this.textMessage = textMessage;
            this.jsonData = jsonData;
            this.queryResult = queryResult;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
            this.usageHelp = usageHelp;
        }

        private static Outcome success(String textMessage, Object jsonData, boolean queryResult) {
            return new Outcome(true, textMessage, jsonData, queryResult, null, null, null);
        }

        private static Outcome error(String errorCode, String errorMessage, String usageHelp) {
            return new Outcome(false, null, null, false, errorCode, errorMessage, usageHelp);
        }
    }
}
