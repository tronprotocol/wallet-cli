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
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Missing value for --network", e.getMessage());
    }
  }

  @Test
  public void parseRejectsInvalidEnumeratedGlobalOptionValues() {
    assertInvalidValue("--output", "yaml");
  }

  @Test
  public void parseDoesNotTreatCommandTokenAsNetworkValue() {
    try {
      GlobalOptions.parse(new String[]{"--network", "send-coin", "--to", "TXYZ"});
      Assert.fail("Expected invalid value error for --network");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Invalid value for --network: send-coin", e.getMessage());
    }
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
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Missing value for " + option, e.getMessage());
    }
  }

  private void assertInvalidValue(String option, String value) {
    try {
      GlobalOptions.parse(new String[]{option, value});
      Assert.fail("Expected invalid value error for " + option);
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Invalid value for " + option + ": " + value, e.getMessage());
    }
  }
}
