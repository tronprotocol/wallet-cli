package org.tron.walletcli.cli;

import org.tron.walletserver.WalletApi;
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.ResolutionResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Holds the parsed key-value pairs produced by {@link CommandDefinition#parseArgs}
 * and provides typed accessors.
 */
public class ParsedOptions {

    private final Map<String, String> values;
    private final AliasResolver aliasResolver;

    public ParsedOptions(Map<String, String> values) {
        this(values, null);
    }

    public ParsedOptions(Map<String, String> values, AliasResolver aliasResolver) {
        this.values = values == null
                ? Collections.<String, String>emptyMap()
                : new LinkedHashMap<String, String>(values);
        this.aliasResolver = aliasResolver;
    }

    /** Returns {@code true} if the option was supplied on the command line. */
    public boolean has(String key) {
        return values.containsKey(key);
    }

    /** Returns the raw string value, or {@code null} if absent. */
    public String getString(String key) {
        return values.get(key);
    }

    /**
     * Returns the value parsed as a {@code long}.
     *
     * @throws IllegalArgumentException if the key is absent or not a valid long
     */
    public long getLong(String key) {
        String raw = values.get(key);
        if (raw == null) {
            throw new IllegalArgumentException("Missing required option: --" + key);
        }
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "Option --" + key + " requires a numeric value, got: " + raw);
        }
    }

    /**
     * Returns the value parsed as an {@code int}.
     * Delegates to {@link #getLong(String)} and rejects values outside the
     * {@code int} range to prevent silent truncation.
     *
     * @throws IllegalArgumentException if the key is absent, not numeric,
     *         or outside [{@code Integer.MIN_VALUE}, {@code Integer.MAX_VALUE}]
     */
    public int getInt(String key) {
        long value = getLong(key);
        if (value > Integer.MAX_VALUE || value < Integer.MIN_VALUE) {
            throw new IllegalArgumentException(
                    "Option --" + key + " value " + value + " is outside valid int range");
        }
        return (int) value;
    }

    /**
     * Returns the value parsed as a boolean.  Absent keys default to {@code false}.
     */
    public boolean getBoolean(String key) {
        String raw = values.get(key);
        if (raw == null) {
            return false;
        }
        return "true".equalsIgnoreCase(raw) || "1".equals(raw) || "yes".equalsIgnoreCase(raw);
    }

    /**
     * Decodes a Base58Check TRON address.
     *
     * @return the decoded address bytes
     * @throws IllegalArgumentException if the key is absent or the address is invalid
     */
    public byte[] getAddress(String key) {
        String raw = requireValue(key);
        return decodeBase58Address(key, raw);
    }

    public byte[] getAccountAddress(String key) {
        return getResolvedAddress(key, AliasType.ACCOUNT);
    }

    public byte[] getContractAddress(String key) {
        return getResolvedAddress(key, AliasType.TOKEN);
    }

    private byte[] getResolvedAddress(String key, AliasType expectedType) {
        String raw = requireValue(key);
        if (aliasResolver != null) {
            return aliasResolver.resolve(key, raw, expectedType).getAddress();
        }
        return decodeBase58Address(key, raw);
    }

    private String requireValue(String key) {
        String raw = values.get(key);
        if (raw == null) {
            throw new IllegalArgumentException("Missing required option: --" + key);
        }
        return raw;
    }

    private byte[] decodeBase58Address(String key, String raw) {
        byte[] decoded = WalletApi.decodeFromBase58Check(raw);
        if (decoded == null) {
            throw new IllegalArgumentException(
                    "Invalid TRON address for --" + key + ": " + raw);
        }
        return decoded;
    }

    public List<ResolutionResult> getResolutionLog() {
        if (aliasResolver == null) {
            return Collections.unmodifiableList(new ArrayList<ResolutionResult>());
        }
        return aliasResolver.getResolved();
    }

    /** Returns an unmodifiable view of all parsed values. */
    public Map<String, String> asMap() {
        return Collections.unmodifiableMap(values);
    }
}
