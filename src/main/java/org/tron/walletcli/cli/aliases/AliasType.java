package org.tron.walletcli.cli.aliases;

import java.util.Locale;

public enum AliasType {
    ACCOUNT,
    TOKEN;

    public static AliasType parse(String s) {
        if (s == null) {
            throw new IllegalArgumentException("type must not be null");
        }
        String upper = s.trim().toUpperCase(Locale.ROOT);
        try {
            return AliasType.valueOf(upper);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("type must be ACCOUNT or TOKEN, got: " + s);
        }
    }
}
