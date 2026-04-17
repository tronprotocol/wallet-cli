package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;

public class GlobalOptionsTest {

  @Test
  public void parseThrowsWhenGlobalOptionValueIsMissing() {
    assertMissingValue("--output");
    assertMissingValue("--network");
    assertMissingValue("--wallet");
    assertMissingValue("--grpc-endpoint");
  }

  @Test
  public void parseFailsFastWhenNetworkValueIsMissingBeforeAnotherFlag() {
    try {
      GlobalOptions.parse(new String[]{"--network", "--output", "json", "send-coin"});
      Assert.fail("Expected missing value error for --network");
    } catch (CliUsageException e) {
      Assert.assertEquals("Missing value for --network", e.getMessage());
    }
  }

  @Test
  public void parseSupportsInlineValuedGlobalOptions() {
    GlobalOptions opts = GlobalOptions.parse(new String[]{
        "--output=json",
        "--network=nile",
        "--wallet=alpha",
        "--grpc-endpoint=127.0.0.1:50051",
        "get-balance",
        "--address",
        "TXYZ"
    });

    Assert.assertEquals("json", opts.getOutput());
    Assert.assertEquals("nile", opts.getNetwork());
    Assert.assertEquals("alpha", opts.getWallet());
    Assert.assertEquals("127.0.0.1:50051", opts.getGrpcEndpoint());
    Assert.assertEquals("get-balance", opts.getCommand());
    Assert.assertArrayEquals(new String[]{"--address", "TXYZ"}, opts.getCommandArgs());
  }

  @Test
  public void parseRejectsInvalidEnumeratedGlobalOptionValues() {
    assertInvalidValue("--output", "yaml");
    assertInvalidValue("--network", "beta");
  }

  @Test
  public void parseDoesNotTreatCommandTokenAsNetworkValue() {
    try {
      GlobalOptions.parse(new String[]{"--network", "send-coin", "--to", "TXYZ"});
      Assert.fail("Expected invalid value error for --network");
    } catch (CliUsageException e) {
      Assert.assertEquals("Invalid value for --network: send-coin", e.getMessage());
    }
  }

  @Test
  public void parseNormalizesCommandAndPreservesPostCommandTokens() {
    GlobalOptions opts = GlobalOptions.parse(new String[]{
        "--output", "json",
        "Get-Balance",
        "--network=nile",
        "-h",
        "value"
    });

    Assert.assertEquals("get-balance", opts.getCommand());
    Assert.assertArrayEquals(new String[]{"--network=nile", "-h", "value"}, opts.getCommandArgs());
  }

  @Test
  public void parseTreatsPreCommandHelpAsGlobalHelpOnly() {
    GlobalOptions opts = GlobalOptions.parse(new String[]{"-h", "Get-Balance"});

    Assert.assertTrue(opts.isHelp());
    Assert.assertEquals("get-balance", opts.getCommand());
    Assert.assertArrayEquals(new String[0], opts.getCommandArgs());
  }

  @Test
  public void parseRejectsUnknownPreCommandGlobalOption() {
    assertUsageError(new String[]{"--outputt", "json", "get-balance"},
        "Unknown global option: --outputt");
  }

  @Test
  public void parseRejectsUnsupportedShortOption() {
    assertUsageError(new String[]{"-v", "get-balance"},
        "Unknown global option: -v");
  }

  @Test
  public void parseRejectsEmptyInlineGlobalValues() {
    assertUsageError(new String[]{"--output="}, "Missing or empty value for --output");
    assertUsageError(new String[]{"--wallet="}, "Missing or empty value for --wallet");
  }

  @Test
  public void parseRejectsInlineValuesForFlags() {
    assertUsageError(new String[]{"--quiet=true"}, "Option --quiet does not take a value");
    assertUsageError(new String[]{"--help=yes"}, "Option --help does not take a value");
    assertUsageError(new String[]{"-h=yes"}, "Option -h does not take a value");
  }

  @Test
  public void parseRejectsRepeatedValuedGlobalOptions() {
    assertUsageError(new String[]{"--network", "nile", "--network", "main", "get-balance"},
        "Repeated global option: --network");
    assertUsageError(new String[]{"--output", "json", "--output=text", "get-balance"},
        "Repeated global option: --output");
  }

  @Test
  public void parseAllowsRepeatedIdempotentBooleanFlags() {
    GlobalOptions opts = GlobalOptions.parse(new String[]{
        "--verbose",
        "--verbose",
        "--help",
        "-h",
        "get-balance"
    });

    Assert.assertTrue(opts.isVerbose());
    Assert.assertTrue(opts.isHelp());
    Assert.assertEquals("get-balance", opts.getCommand());
  }

  @Test
  public void parseRejectsConflictingQuietAndVerboseFlags() {
    assertUsageError(new String[]{"--quiet", "--verbose", "get-balance"},
        "Conflicting global options: --quiet and --verbose");
    assertUsageError(new String[]{"--verbose", "--quiet", "get-balance"},
        "Conflicting global options: --quiet and --verbose");
  }

  @Test
  public void getCommandArgsReturnsDefensiveCopy() {
    GlobalOptions opts = GlobalOptions.parse(new String[]{"send-coin", "--to", "TXYZ"});

    String[] first = opts.getCommandArgs();
    first[0] = "mutated";

    String[] second = opts.getCommandArgs();
    Assert.assertEquals("--to", second[0]);
    Assert.assertEquals("TXYZ", second[1]);
  }

  private void assertMissingValue(String option) {
    try {
      GlobalOptions.parse(new String[]{option});
      Assert.fail("Expected missing value error for " + option);
    } catch (CliUsageException e) {
      Assert.assertEquals("Missing value for " + option, e.getMessage());
    }
  }

  private void assertInvalidValue(String option, String value) {
    try {
      GlobalOptions.parse(new String[]{option, value});
      Assert.fail("Expected invalid value error for " + option);
    } catch (CliUsageException e) {
      Assert.assertEquals("Invalid value for " + option + ": " + value, e.getMessage());
    }
  }

  private void assertUsageError(String[] args, String expectedMessage) {
    try {
      GlobalOptions.parse(args);
      Assert.fail("Expected usage error: " + expectedMessage);
    } catch (CliUsageException e) {
      Assert.assertEquals(expectedMessage, e.getMessage());
    }
  }
}
