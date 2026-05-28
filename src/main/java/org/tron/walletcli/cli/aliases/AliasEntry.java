package org.tron.walletcli.cli.aliases;

import java.util.Locale;

public final class AliasEntry {

    private final String name;
    private final AliasType type;
    private final byte[] address;
    private final int decimals;
    private final String source;
    private final String note;

    private AliasEntry(String name, AliasType type, byte[] address,
                       int decimals, String source, String note) {
        if (name == null) {
            throw new IllegalArgumentException("name must not be null");
        }
        String n = name.trim().toUpperCase(Locale.ROOT);
        if (n.isEmpty()) {
            throw new IllegalArgumentException("name must not be blank");
        }
        if (type == null) {
            throw new IllegalArgumentException("type must not be null");
        }
        if (address == null) {
            throw new IllegalArgumentException("address must not be null");
        }
        if (address.length != 21) {
            throw new IllegalArgumentException("address must be 21 bytes, got " + address.length);
        }
        if (source == null || source.trim().isEmpty()) {
            throw new IllegalArgumentException("source must not be blank");
        }
        if (type == AliasType.TOKEN && (decimals < 0 || decimals > 18)) {
            throw new IllegalArgumentException("token decimals must be between 0 and 18");
        }
        this.name = n;
        this.type = type;
        this.address = address.clone();
        this.decimals = decimals;
        this.source = source;
        this.note = note;
    }

    public static AliasEntry token(String name, byte[] address, int decimals, String source) {
        return new AliasEntry(name, AliasType.TOKEN, address, decimals, source, null);
    }

    public static AliasEntry account(String name, byte[] address, String source, String note) {
        return new AliasEntry(name, AliasType.ACCOUNT, address, 0, source, note);
    }

    public String getName() {
        return name;
    }

    public AliasType getType() {
        return type;
    }

    public byte[] getAddress() {
        return address.clone();
    }

    public int getDecimals() {
        return decimals;
    }

    public String getSource() {
        return source;
    }

    public String getNote() {
        return note;
    }
}
