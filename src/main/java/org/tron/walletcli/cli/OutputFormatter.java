package org.tron.walletcli.cli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.protobuf.Message;
import org.tron.common.utils.JsonFormat;

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

    /** Print a successful result with a text message and optional JSON data. */
    public void success(String textMessage, Map<String, Object> jsonData) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> envelope = new LinkedHashMap<String, Object>();
            envelope.put("success", true);
            envelope.put("data", jsonData != null ? jsonData : new LinkedHashMap<String, Object>());
            out.println(gson.toJson(envelope));
        } else {
            out.println(textMessage);
        }
    }

    /** Print a simple success/failure result. */
    public void result(boolean success, String successMsg, String failMsg) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put("success", success);
            data.put("message", success ? successMsg : failMsg);
            out.println(gson.toJson(data));
        } else {
            out.println(success ? successMsg : failMsg);
        }
        if (!success) {
            System.exit(1);
        }
    }

    /** Print a protobuf message. Uses Utils.formatMessageString which decodes
     *  addresses to Base58 and bytes to readable strings for both modes. */
    public void protobuf(Message message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        if (mode == OutputMode.JSON) {
            // Single-line valid JSON from protobuf
            out.println(JsonFormat.printToString(message, true));
        } else {
            out.println(org.tron.common.utils.Utils.formatMessageString(message));
        }
    }

    /** Print a message object (trident Response types or pre-formatted strings). */
    public void printMessage(Object message, String failMsg) {
        if (message == null) {
            error("not_found", failMsg);
            return;
        }
        out.println(message);
    }

    /** Print raw text. */
    public void raw(String text) {
        out.println(text);
    }

    /** Print a key-value pair. */
    public void keyValue(String key, Object value) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put(key, value);
            out.println(gson.toJson(data));
        } else {
            out.println(key + " = " + value);
        }
    }

    /** Print an error and exit with code 1. */
    public void error(String code, String message) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put("success", false);
            data.put("error", code);
            data.put("message", message);
            out.println(gson.toJson(data));
        } else {
            out.println("Error: " + message);
        }
        System.exit(1);
    }

    /** Print an error for usage mistakes and exit with code 2. */
    public void usageError(String message, CommandDefinition cmd) {
        if (mode == OutputMode.JSON) {
            Map<String, Object> data = new LinkedHashMap<String, Object>();
            data.put("success", false);
            data.put("error", "usage_error");
            data.put("message", message);
            out.println(gson.toJson(data));
        } else {
            out.println("Error: " + message);
            if (cmd != null) {
                out.println();
                out.println(cmd.formatHelp());
            }
        }
        System.exit(2);
    }

    /** Print info to stderr (suppressed in quiet mode and JSON mode). */
    public void info(String message) {
        if (!quiet && mode != OutputMode.JSON) {
            err.println(message);
        }
    }
}
