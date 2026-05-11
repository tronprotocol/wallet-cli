package org.tron.walletcli.cli.ledger;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

/**
 * Captures everything written to {@link System#out} for the duration of a try-with-resources scope
 * and restores the original stream on close.
 *
 * <p>Used to prevent shared Ledger code (printlns inside {@code LedgerEventListener},
 * {@code HidServicesWrapper}, {@code LedgerSignUtil}) from polluting standard CLI's JSON stdout.
 */
public final class SystemOutSuppressor implements AutoCloseable {

    private final PrintStream originalOut;
    private final ByteArrayOutputStream sink;

    private SystemOutSuppressor(PrintStream originalOut, ByteArrayOutputStream sink) {
        this.originalOut = originalOut;
        this.sink = sink;
    }

    public static SystemOutSuppressor capture() {
        PrintStream original = System.out;
        ByteArrayOutputStream sink = new ByteArrayOutputStream();
        PrintStream replacement = createUtf8PrintStream(sink);
        System.setOut(replacement);
        return new SystemOutSuppressor(original, sink);
    }

    private static PrintStream createUtf8PrintStream(ByteArrayOutputStream sink) {
        try {
            return new PrintStream(sink, true, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException e) {
            throw new AssertionError("UTF-8 must be supported by every Java runtime", e);
        }
    }

    /** Returns everything captured so far as a string (for verbose-mode echo). */
    public String drained() {
        return new String(sink.toByteArray(), StandardCharsets.UTF_8);
    }

    @Override
    public void close() {
        System.setOut(originalOut);
    }
}
