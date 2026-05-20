package org.tron.walletcli.cli;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Reads MASTER_PASSWORD from an {@link InputStream} (typically {@code System.in}) once and caches
 * the result. Designed for the {@code --password-stdin} flow where a password is piped in from
 * a credential helper such as {@code op read} or {@code printf}.
 *
 * <p>Trailing single {@code \n} or {@code \r\n} is stripped (so {@code echo "$pw"} works), but
 * internal whitespace and other characters are preserved verbatim — passwords may legitimately
 * contain spaces.
 */
final class StdinPasswordReader implements StandardCliRunner.MasterPasswordProvider {

    private final InputStream in;
    private boolean read;
    private String value;

    StdinPasswordReader(InputStream in) {
        this.in = in;
    }

    @Override
    public synchronized String get() {
        if (read) {
            return value;
        }
        read = true;
        value = readAll();
        return value;
    }

    private String readAll() {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[256];
        byte[] bytes = null;
        try {
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
            }
            if (buf.size() == 0) {
                return null;
            }
            bytes = buf.toByteArray();
            int len = bytes.length;
            if (len > 0 && bytes[len - 1] == '\n') {
                len--;
                if (len > 0 && bytes[len - 1] == '\r') {
                    len--;
                }
            }
            if (len == 0) {
                return null;
            }
            return new String(bytes, 0, len, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read password from stdin: " + e.getMessage(), e);
        } finally {
            Arrays.fill(chunk, (byte) 0);
            if (bytes != null) {
                Arrays.fill(bytes, (byte) 0);
            }
        }
    }
}
