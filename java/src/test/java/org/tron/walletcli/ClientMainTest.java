package org.tron.walletcli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.Assert;
import org.junit.Test;

public class ClientMainTest {

  private static final String TS_PACKAGE = "@tron-walletcli/wallet-cli";

  @Test
  public void versionFlagPrintsPlainTextVersion() throws Exception {
    Captured captured = run("--version");

    Assert.assertEquals(0, captured.exitCode);
    Assert.assertTrue(captured.stdout.startsWith("wallet-cli v"));
    Assert.assertFalse(captured.stdout.contains("{"));
    Assert.assertEquals("", captured.stderr);
  }

  @Test
  public void helpFlagPrintsInteractiveUsageAndTheFallbackHint() throws Exception {
    Captured captured = run("--help");

    Assert.assertEquals(0, captured.exitCode);
    Assert.assertTrue(captured.stdout.contains("Usage: java -jar wallet-cli.jar"));
    Assert.assertTrue(captured.stdout.contains("interactive wallet shell"));
    Assert.assertTrue(captured.stdout.contains(TS_PACKAGE));
    Assert.assertEquals("", captured.stderr);
  }

  @Test
  public void interactiveFlagIsNoLongerRecognised() throws Exception {
    assertFallback(run("--interactive"));
  }

  @Test
  public void formerStandardCliCommandFallsBack() throws Exception {
    assertFallback(run("get-account", "--address", "TXyz"));
  }

  @Test
  public void jsonOutputRequestFallsBackWithoutAJsonEnvelope() throws Exception {
    Captured captured = run("--output", "json", "get-account");

    assertFallback(captured);
    Assert.assertFalse(captured.stderr.contains("{"));
    Assert.assertFalse(captured.stderr.contains("\"success\""));
  }

  @Test
  public void bareGlobalFlagFallsBack() throws Exception {
    assertFallback(run("--network", "nile"));
  }

  private static void assertFallback(Captured captured) {
    Assert.assertEquals(2, captured.exitCode);
    Assert.assertEquals("", captured.stdout);
    Assert.assertTrue(captured.stderr.contains("Standard CLI has been removed"));
    Assert.assertTrue(captured.stderr.contains(TS_PACKAGE));
    Assert.assertTrue(captured.stderr.contains("npx " + TS_PACKAGE));
    Assert.assertTrue(captured.stderr.contains(
        "https://github.com/tronprotocol/wallet-cli/blob/HEAD/ts/docs/commands/index.md"));
    Assert.assertEquals(3, captured.stderr.trim().split("\\R").length);
  }

  private static Captured run(String... args) throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    System.setOut(new PrintStream(stdout, true, StandardCharsets.UTF_8.name()));
    System.setErr(new PrintStream(stderr, true, StandardCharsets.UTF_8.name()));
    try {
      int exitCode = Client.runMain(args);
      return new Captured(exitCode,
          stdout.toString(StandardCharsets.UTF_8.name()),
          stderr.toString(StandardCharsets.UTF_8.name()));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  private static final class Captured {
    private final int exitCode;
    private final String stdout;
    private final String stderr;

    private Captured(int exitCode, String stdout, String stderr) {
      this.exitCode = exitCode;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }
}
