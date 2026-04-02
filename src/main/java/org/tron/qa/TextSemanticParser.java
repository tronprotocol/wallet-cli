package org.tron.qa;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses text output into key-value pairs and compares with JSON output
 * for semantic parity verification.
 *
 * <p>This is the Java equivalent of qa/lib/semantic.sh's
 * check_json_text_parity and filter_noise functions, used by
 * QARunner for Java-side verification.
 */
public class TextSemanticParser {

    private static final Gson gson = new Gson();

    private static final List<String> NOISE_PREFIXES = Arrays.asList(
            "User defined config file",
            "User defined config",
            "Authenticated with"
    );

    /**
     * Result of a parity check between text and JSON outputs.
     */
    public static class ParityResult {
        public final boolean passed;
        public final String reason;

        private ParityResult(boolean passed, String reason) {
            this.passed = passed;
            this.reason = reason;
        }

        public static ParityResult pass() {
            return new ParityResult(true, "PASS");
        }

        public static ParityResult fail(String reason) {
            return new ParityResult(false, reason);
        }
    }

    /**
     * Filters known noise lines from command output.
     * Mirrors qa/lib/semantic.sh filter_noise().
     */
    public static String filterNoise(String output) {
        if (output == null || output.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (String line : output.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            boolean isNoise = false;
            for (String prefix : NOISE_PREFIXES) {
                if (trimmed.startsWith(prefix)) {
                    isNoise = true;
                    break;
                }
            }
            if (!isNoise) {
                if (sb.length() > 0) sb.append("\n");
                sb.append(line);
            }
        }
        return sb.toString();
    }

    /**
     * Checks parity between text and JSON outputs.
     * Mirrors qa/lib/semantic.sh check_json_text_parity().
     *
     * Verifies:
     * 1. JSON output is not empty (after noise filtering)
     * 2. JSON output is valid JSON
     * 3. Text output is not empty (after noise filtering)
     */
    public static ParityResult checkJsonTextParity(String command, String textOutput, String jsonOutput) {
        String filteredJson = filterNoise(jsonOutput);
        String filteredText = filterNoise(textOutput);

        if (filteredJson.isEmpty()) {
            return ParityResult.fail("Empty JSON output for " + command);
        }

        if (!isValidJson(filteredJson)) {
            return ParityResult.fail("Invalid JSON output for " + command);
        }

        if (filteredText.isEmpty()) {
            return ParityResult.fail("Empty text output for " + command);
        }

        return ParityResult.pass();
    }

    /**
     * Parses text output into key-value pairs.
     * Handles common wallet-cli text output formats:
     * <ul>
     *   <li>"key = value" (e.g., "address = TXxx...")</li>
     *   <li>"key: value" (e.g., "Balance: 1000000 SUN")</li>
     *   <li>"key : value" (spaced colon)</li>
     * </ul>
     */
    public static Map<String, String> parseTextOutput(String textOutput) {
        Map<String, String> result = new LinkedHashMap<>();
        String filtered = filterNoise(textOutput);
        for (String line : filtered.split("\n")) {
            String trimmed = line.trim();
            // Try "key = value" format first
            int eqIdx = trimmed.indexOf(" = ");
            if (eqIdx > 0) {
                result.put(trimmed.substring(0, eqIdx).trim(), trimmed.substring(eqIdx + 3).trim());
                continue;
            }
            // Try "key: value" or "key : value" format
            int colonIdx = trimmed.indexOf(':');
            if (colonIdx > 0 && colonIdx < trimmed.length() - 1) {
                String key = trimmed.substring(0, colonIdx).trim();
                String value = trimmed.substring(colonIdx + 1).trim();
                if (!key.isEmpty() && !value.isEmpty()) {
                    result.put(key, value);
                }
            }
        }
        return result;
    }

    /**
     * Checks if a JSON string contains a specific field with expected value.
     * Mirrors qa/lib/semantic.sh check_json_field().
     */
    public static boolean checkJsonField(String jsonOutput, String field, String expected) {
        try {
            JsonObject obj = gson.fromJson(filterNoise(jsonOutput), JsonObject.class);
            if (obj == null || !obj.has(field)) return false;
            JsonElement elem = obj.get(field);
            return expected.equals(elem.getAsString());
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Tests if a string is valid JSON (object or array).
     */
    public static boolean isValidJson(String str) {
        if (str == null || str.trim().isEmpty()) return false;
        try {
            gson.fromJson(str, JsonElement.class);
            return true;
        } catch (JsonSyntaxException e) {
            return false;
        }
    }

    /**
     * Checks numerical equivalence between SUN and TRX representations.
     * e.g., "1000000" SUN == "1.000000" TRX
     */
    public static boolean isNumericallyEquivalent(String sunValue, String trxValue) {
        try {
            long sun = Long.parseLong(sunValue.replaceAll("[^0-9]", ""));
            double trx = Double.parseDouble(trxValue.replaceAll("[^0-9.]", ""));
            return sun == (long) (trx * 1_000_000);
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
