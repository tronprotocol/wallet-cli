package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.tron.walletserver.WalletApi;

public final class AliasValidation {
    private AliasValidation() {
    }

    private static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,31}$");
    private static final Pattern HEX = Pattern.compile("^(0x|41)[0-9a-fA-F]{40}$");
    private static final Set<String> RESERVED = new HashSet<String>(Arrays.asList(
            "me", "self", "main", "mainnet", "nile", "shasta", "custom", "trx", "default"));

    public static boolean looksLikeAddress(String input) {
        if (input == null) {
            return false;
        }
        String t = input.trim();
        if (t.isEmpty()) {
            return false;
        }
        if (HEX.matcher(t).matches()) {
            return true;
        }
        try {
            return WalletApi.decodeFromBase58Check(t) != null;
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static void requireValidName(String name) {
        if (name == null) {
            throw new IllegalArgumentException("alias name must not be null");
        }
        String t = name.trim();
        if (!NAME.matcher(t).matches()) {
            throw new IllegalArgumentException("invalid alias name: " + name
                    + " (must match ^[A-Za-z][A-Za-z0-9_.-]{0,31}$)");
        }
        if (RESERVED.contains(t.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("alias name is reserved: " + t);
        }
        if (looksLikeAddress(t)) {
            throw new IllegalArgumentException("alias name must not look like a TRON address: " + t);
        }
    }
}
