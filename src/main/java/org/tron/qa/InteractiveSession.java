package org.tron.qa;

import java.lang.reflect.Method;

/**
 * Drives the interactive CLI's methods programmatically via reflection.
 * Used by the QA system to capture baseline output from the old interactive mode.
 */
public class InteractiveSession {

    private final Object clientInstance;

    public InteractiveSession(Object clientInstance) {
        this.clientInstance = clientInstance;
    }

    /**
     * Executes a command by invoking the corresponding method on the Client instance.
     *
     * @param command the command name (hyphenated or camelCase)
     * @param args    arguments to pass (used if method accepts String[])
     * @return captured result with stdout, stderr, and exit code
     */
    public CapturedResult execute(String command, String[] args) {
        CommandCapture capture = new CommandCapture();
        int exitCode = 0;
        capture.startCapture();
        try {
            Method method = findMethod(command);
            if (method != null) {
                method.setAccessible(true);
                if (method.getParameterCount() == 0) {
                    method.invoke(clientInstance);
                } else if (method.getParameterCount() == 1
                        && method.getParameterTypes()[0] == String[].class) {
                    method.invoke(clientInstance, (Object) args);
                } else {
                    // Try invoking with no args if signature doesn't match
                    method.invoke(clientInstance);
                }
            } else {
                capture.stopCapture();
                return new CapturedResult("", "Command method not found: " + command, 2);
            }
        } catch (Exception e) {
            exitCode = 1;
        } finally {
            capture.stopCapture();
        }
        return new CapturedResult(capture.getStdout(), capture.getStderr(), exitCode);
    }

    /**
     * Finds a method on the Client class matching the command name.
     * Tries exact match first, then case-insensitive match with hyphens removed.
     */
    private Method findMethod(String command) {
        String normalized = command.replace("-", "").toLowerCase();
        for (Method m : clientInstance.getClass().getDeclaredMethods()) {
            if (m.getName().toLowerCase().equals(normalized)) {
                return m;
            }
        }
        return null;
    }

    /**
     * Holds the captured output from a command execution.
     */
    public static class CapturedResult {
        public final String stdout;
        public final String stderr;
        public final int exitCode;

        public CapturedResult(String stdout, String stderr, int exitCode) {
            this.stdout = stdout;
            this.stderr = stderr;
            this.exitCode = exitCode;
        }
    }
}
