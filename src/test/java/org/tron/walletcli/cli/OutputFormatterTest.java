package org.tron.walletcli.cli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.Assert;
import org.junit.Test;

public class OutputFormatterTest {

  @Test
  public void rawMessageUsesStableJsonEnvelope() {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);
      formatter.raw("hello");
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"data\": {"));
      Assert.assertTrue(json.contains("\"message\": \"hello\""));
    } catch (Exception e) {
      Assert.fail("Unexpected exception: " + e.getMessage());
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void jsonArraysAreWrappedUnderResultField() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);
      formatter.printMessage("[1,2,3]", "failed");
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"data\": {"));
      Assert.assertTrue(json.contains("\"result\": ["));
      Assert.assertTrue(json.contains("1"));
      Assert.assertTrue(json.contains("2"));
      Assert.assertTrue(json.contains("3"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void duplicateOutcomeCollapsesToSingleExecutionError() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);
      formatter.successMessage("ok");
      try {
        formatter.successMessage("again");
        Assert.fail("Expected duplicate outcome to abort execution");
      } catch (CliAbortException e) {
        Assert.assertEquals(CliAbortException.Kind.EXECUTION, e.getKind());
      }

      formatter.flush();
      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"execution_error\""));
      Assert.assertTrue(json.contains("Multiple terminal outcomes emitted"));
    } finally {
      System.setOut(originalOut);
    }
  }
}
