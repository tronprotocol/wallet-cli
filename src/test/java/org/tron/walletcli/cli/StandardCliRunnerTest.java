package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public class StandardCliRunnerTest {

  @Test
  public void usageErrorDoesNotTerminateJvmAndRestoresStreams() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("needs-arg")
        .description("Command with a required option")
        .option("value", "Required value", true)
        .handler((opts, wrapper, out) -> {
          Map<String, Object> json = new LinkedHashMap<String, Object>();
          json.put("value", opts.getString("value"));
          out.success("ok", json);
        })
        .build());
    registry.add(CommandDefinition.builder()
        .name("ok")
        .description("Simple success command")
        .handler((opts, wrapper, out) -> {
          Map<String, Object> json = Collections.<String, Object>singletonMap("status", "ok");
          out.success("ok", json);
        })
        .build());

    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;

    ByteArrayOutputStream firstStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream firstStderr = new ByteArrayOutputStream();
    PrintStream firstOut = new PrintStream(firstStdout);
    PrintStream firstErr = new PrintStream(firstStderr);
    System.setOut(firstOut);
    System.setErr(firstErr);
    try {
      GlobalOptions badOpts = GlobalOptions.parse(new String[]{"--output", "json", "needs-arg"});
      int exitCode = new StandardCliRunner(registry, badOpts).execute();

      Assert.assertEquals(2, exitCode);
      String json = new String(firstStdout.toByteArray(), StandardCharsets.UTF_8);
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
      Assert.assertSame(firstOut, System.out);
      Assert.assertSame(firstErr, System.err);
      Assert.assertSame(originalIn, System.in);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setIn(originalIn);
    }

    ByteArrayOutputStream secondStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream secondStderr = new ByteArrayOutputStream();
    PrintStream secondOut = new PrintStream(secondStdout);
    PrintStream secondErr = new PrintStream(secondStderr);
    System.setOut(secondOut);
    System.setErr(secondErr);
    try {
      GlobalOptions okOpts = GlobalOptions.parse(new String[]{"--output", "json", "ok"});
      int exitCode = new StandardCliRunner(registry, okOpts).execute();

      Assert.assertEquals(0, exitCode);
      String json = new String(secondStdout.toByteArray(), StandardCharsets.UTF_8);
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"status\": \"ok\""));
      Assert.assertEquals("", new String(secondStderr.toByteArray(), StandardCharsets.UTF_8));
      Assert.assertSame(secondOut, System.out);
      Assert.assertSame(secondErr, System.err);
      Assert.assertSame(originalIn, System.in);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setIn(originalIn);
    }
  }

  @Test
  public void executionErrorDoesNotTerminateJvmAndReturnsExitCodeOne() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("boom")
        .description("Command that fails")
        .handler((opts, wrapper, out) -> out.error("boom", "simulated failure"))
        .build());

    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream testOut = new PrintStream(stdout);
    PrintStream testErr = new PrintStream(stderr);
    System.setOut(testOut);
    System.setErr(testErr);
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "boom"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(1, exitCode);
      String json = new String(stdout.toByteArray(), StandardCharsets.UTF_8);
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"boom\""));
      Assert.assertEquals("", new String(stderr.toByteArray(), StandardCharsets.UTF_8));
      Assert.assertSame(testOut, System.out);
      Assert.assertSame(testErr, System.err);
      Assert.assertSame(originalIn, System.in);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setIn(originalIn);
    }
  }
}
