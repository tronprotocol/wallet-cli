package org.tron.walletcli.cli;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Assert;
import org.junit.Test;

public class OutputFormatterTest {

  @Test
  public void rawMessageUsesStableJsonEnvelope() {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    try {
      OutputFormatter formatter = new OutputFormatter(
          OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
      formatter.raw("hello");
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject root = JsonParser.parseString(json).getAsJsonObject();
      Assert.assertTrue(root.get("success").getAsBoolean());
      Assert.assertTrue(root.has("data") && root.get("data").isJsonObject());
      Assert.assertEquals("hello", root.getAsJsonObject("data").get("message").getAsString());
    } catch (Exception e) {
      Assert.fail("Unexpected exception: " + e.getMessage());
    }
  }

  @Test
  public void queryResultJsonArraysAreWrappedUnderResultField() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "[1,2,3]");
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    Assert.assertTrue(root.get("success").getAsBoolean());
    Assert.assertTrue(root.has("data") && root.get("data").isJsonObject());
    Assert.assertTrue(root.getAsJsonObject("data").has("result"));
    Assert.assertTrue(root.getAsJsonObject("data").get("result").isJsonArray());
  }

  @Test
  public void queryResultJsonObjectUsesParsedDataInJsonMode() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "{\"a\":1}");
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    Assert.assertTrue(root.get("success").getAsBoolean());
    Assert.assertEquals(1, root.getAsJsonObject("data").get("a").getAsInt());
  }

  @Test
  public void duplicateOutcomeCollapsesToSingleExecutionError() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
    formatter.successMessage("ok");
    try {
      formatter.successMessage("again");
      Assert.fail("Expected duplicate outcome to abort execution");
    } catch (CliAbortException e) {
      Assert.assertEquals(CliAbortException.Kind.EXECUTION, e.getKind());
    }

    formatter.flush();
    String json = stdout.toString(StandardCharsets.UTF_8.name());
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    Assert.assertFalse(root.get("success").getAsBoolean());
    Assert.assertEquals("execution_error", root.get("error").getAsString());
    Assert.assertTrue(json.contains("Multiple terminal outcomes emitted"));
  }

  @Test
  public void textModeFlushAppendsJsonDataKeyValues() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    Map<String, Object> data = new LinkedHashMap<String, Object>();
    data.put("txid", "abc123");
    data.put("message", "Success !!");
    formatter.success("Success !!", data);
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Success !!"));
    Assert.assertTrue(output.contains("Metadata:"));
    Assert.assertTrue(output.contains("txid : abc123"));
    Assert.assertFalse(output.contains("message :"));
  }

  @Test
  public void textModeQueryResultFlatJsonObjectRendersMetadata() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "{\"a\":1,\"active\":true}");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Query successful !!"));
    Assert.assertTrue(output.contains("Metadata:"));
    Assert.assertTrue(output.contains("a      : 1"));
    Assert.assertTrue(output.contains("active : true"));
    Assert.assertFalse(output.contains("Result:"));
  }

  @Test
  public void textModeQueryResultNestedJsonObjectRendersResult() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "{\"a\":1,\"nested\":{\"b\":2}}");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Query successful !!"));
    Assert.assertTrue(output.contains("Result:"));
    Assert.assertTrue(output.contains("\"nested\""));
    Assert.assertFalse(output.contains("Metadata:"));
  }

  @Test
  public void textModeQueryResultArrayRendersResult() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "[1,2,3]");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Query successful !!"));
    Assert.assertTrue(output.contains("Result:"));
    Assert.assertTrue(output.contains("\"result\""));
    Assert.assertFalse(output.contains("Metadata:"));
  }

  @Test
  public void textModeQueryResultMessageOnlyRendersResult() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "plain text");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Query successful !!"));
    Assert.assertTrue(output.contains("Result:"));
    Assert.assertTrue(output.contains("\"message\""));
    Assert.assertTrue(output.contains("plain text"));
    Assert.assertFalse(output.contains("Metadata:"));
  }

  @Test
  public void textModeQueryResultEmptyObjectRendersResult() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "{}");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("Query successful !!"));
    Assert.assertTrue(output.contains("Result:"));
    Assert.assertTrue(output.contains("{}"));
    Assert.assertFalse(output.contains("Metadata:"));
  }

  @Test
  public void textModeQueryResultIndentsPrettyPrintedJsonLineFeeds() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.queryResult("Query successful !!", "{\"a\":1,\"nested\":{\"b\":2}}");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(output.contains("  Result:"));
    Assert.assertTrue(output.contains("\n  {"));
    Assert.assertTrue(output.contains("\n    \"nested\""));
  }

  @Test
  public void textModeSuccessMessageOnlyPrintsMessage() throws Exception {
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.TEXT, false, new PrintStream(stdout), System.err);
    formatter.successMessage("Done !!");
    formatter.flush();

    String output = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertEquals("Done !!" + System.lineSeparator(), output);
  }
}
