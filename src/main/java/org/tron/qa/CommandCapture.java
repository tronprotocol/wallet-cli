package org.tron.qa;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

/**
 * Utility to capture System.out/System.err during command execution.
 */
public class CommandCapture {

    private final ByteArrayOutputStream outCapture = new ByteArrayOutputStream();
    private final ByteArrayOutputStream errCapture = new ByteArrayOutputStream();
    private final PrintStream originalOut = System.out;
    private final PrintStream originalErr = System.err;

    public void startCapture() {
        System.setOut(new PrintStream(outCapture));
        System.setErr(new PrintStream(errCapture));
    }

    public void stopCapture() {
        System.setOut(originalOut);
        System.setErr(originalErr);
    }

    public String getStdout() {
        return outCapture.toString();
    }

    public String getStderr() {
        return errCapture.toString();
    }

    public void reset() {
        outCapture.reset();
        errCapture.reset();
    }
}
