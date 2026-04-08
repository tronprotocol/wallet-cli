package org.tron.walletcli.cli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.protobuf.Message;

import java.io.PrintStream;
import java.util.LinkedHashMap;
import java.util.Map;

public class OutputFormatter {

    public enum OutputMode { TEXT, JSON }

    private final OutputMode mode;
    private final boolean quiet;
    private PrintStream out;
    private PrintStream err;
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public OutputFormatter(OutputMode mode, boolean quiet) {
        this.mode = mode;
        this.quiet = quiet;
        this.out = System.out;
        this.err = System.err;
    }

    /** Capture the real stdout/stderr before System.out is redirected. */
    public void captureStreams() {
        this.out = System.out;
        this.err = System.err;
    }

    public OutputMode getMode() {
        return mode;
    }

    private void abortExecution() {
        throw new CliAbortException(CliAbortException.Kind.EXECUTION);
    }

    private void abortUsage() {
        throw new CliAbortException(CliAbortException.Kind.USAGE);
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

    private Object normalizeJsonData(Object payload) {
        if (payload == null) {
            return new LinkedHashMap<String, Object>();
        }
        if (payload instanceof JsonElement || payload instanceof Map) {
            return payload;
        }

        String text = String.valueOf(payload);
        try {
            return JsonParser.parseString(text);
        } catch (Exception e) {
            return wrapMessage(text);
        }
    }

    /** Print a successful result with a text message and optional JSON data. */
    public void success(String textMessage, Map<String, Object> jsonData) {
        if (mode == OutputMode.JSON) {
            emitJsonSuccess(jsonData != null ? jsonData : new LinkedHashMap<String, Object>());
        } else {
            out.println(textMessage);
        }
    }

    /** Print a simple success/failure result. */
    public void result(boolean success, String successMsg, String failMsg) {
        if (mode == OutputMode.JSON) {
            if (success) {
                emitJsonSuccess(wrapMessage(successMsg));
            } else {
                emitJsonError("operation_failed", failMsg);
            }
        } else {
            out.println(success ? successMsg : failMsg);
        }
        if (!success) {
            abortExecution();
        }
    }

    /** Print a protobuf message. Uses Utils.formatMessageString which decodes
     *  addresses to Base58 and bytes to readable strings for both modes. */
    public void protobuf(Message message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        String formatted = org.tron.common.utils.Utils.formatMessageString(message);
        if (mode == OutputMode.JSON) {
            emitJsonSuccess(normalizeJsonData(formatted));
        } else {
            out.println(formatted);
        }
    }

    /** Print a message object (trident Response types or pre-formatted strings). */
    public void printMessage(Object message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        if (mode == OutputMode.JSON) {
            emitJsonSuccess(normalizeJsonData(message));
        } else {
            out.println(message);
        }
    }

    /** Print raw text. */
    public void raw(String text) {
        if (mode == OutputMode.JSON) {
            emitJsonSuccess(wrapMessage(text));
        } else {
            out.println(text);
        }
    }

    /** Print a key-value pair. */
    public void keyValue(String key, Object value) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put(key, value);
            emitJsonSuccess(data);
        } else {
            out.println(key + " = " + value);
        }
    }

    /** Print an error and signal exit code 1. */
    public void error(String code, String message) {
        if (mode == OutputMode.JSON) {
            emitJsonError(code, message);
        } else {
            out.println("Error: " + message);
        }
        abortExecution();
    }

    /** Print an error for usage mistakes and signal exit code 2. */
    public void usageError(String message, CommandDefinition cmd) {
        if (mode == OutputMode.JSON) {
            emitJsonError("usage_error", message);
        } else {
            out.println("Error: " + message);
            if (cmd != null) {
                out.println();
                out.println(cmd.formatHelp());
            }
        }
        abortUsage();
    }

    /** Print info to stderr (suppressed in quiet mode and JSON mode). */
    public void info(String message) {
        if (!quiet && mode != OutputMode.JSON) {
            err.println(message);
        }
    }
}
