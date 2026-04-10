package org.tron.walletcli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.Assert;
import org.junit.Test;

public class ClientMainTest {

  @Test
  public void runMainPrintsGlobalHelpForHelpFlagBeforeCommand() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      int exitCode = Client.runMain(new String[]{"--help", "get-balance"});

      Assert.assertEquals(0, exitCode);
      String output = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(output.contains("TRON Wallet CLI"));
      Assert.assertTrue(output.contains("Usage:"));
      Assert.assertFalse(output.contains("Error:"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void runMainPrintsVersionForVersionFlag() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      int exitCode = Client.runMain(new String[]{"--version"});

      Assert.assertEquals(0, exitCode);
      Assert.assertTrue(stdout.toString(StandardCharsets.UTF_8.name()).contains("wallet-cli"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void runMainReturnsUsageErrorForMissingCommand() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      int exitCode = Client.runMain(new String[]{"--output", "json"});

      Assert.assertEquals(2, exitCode);
      String output = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(output.contains("\"success\": false"));
      Assert.assertTrue(output.contains("\"error\": \"usage_error\""));
      Assert.assertTrue(output.contains("Missing command."));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void runMainMapsGlobalParseFailuresToExitCodeTwo() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      int exitCode = Client.runMain(new String[]{"--outputt", "json", "get-balance"});

      Assert.assertEquals(2, exitCode);
      String output = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(output.contains("Error: Unknown global option: --outputt"));
      Assert.assertFalse(output.contains("Unknown command"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void runMainEmitsJsonForGlobalParseFailureWhenJsonWasRequested() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(stdout));
    try {
      int exitCode = Client.runMain(new String[]{"--output", "json", "--outputt", "json", "get-balance"});

      Assert.assertEquals(2, exitCode);
      String output = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(output.contains("\"success\": false"));
      Assert.assertTrue(output.contains("\"error\": \"usage_error\""));
      Assert.assertTrue(output.contains("Unknown global option: --outputt"));
    } finally {
      System.setOut(originalOut);
    }
  }
}
