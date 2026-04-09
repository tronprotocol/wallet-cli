package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;

public class CommandDefinitionTest {

  private CommandDefinition buildBooleanCommand() {
    return CommandDefinition.builder()
        .name("bool-cmd")
        .description("Boolean parsing test")
        .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
  }

  @Test
  public void booleanFlagWithoutValueParsesAsTrue() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi"});
    Assert.assertTrue(opts.getBoolean("multi"));
  }

  @Test
  public void booleanFlagAcceptsExplicitFalse() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi", "false"});
    Assert.assertFalse(opts.getBoolean("multi"));
  }

  @Test
  public void booleanFlagAcceptsExplicitTrue() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi", "true"});
    Assert.assertTrue(opts.getBoolean("multi"));
  }

  @Test
  public void booleanFlagRejectsNegativeNumericValue() {
    try {
      buildBooleanCommand().parseArgs(new String[]{"--multi", "-1"});
      Assert.fail("Expected invalid boolean value to be rejected");
    } catch (IllegalArgumentException e) {
      Assert.assertTrue(e.getMessage().contains("Option --multi requires a boolean value"));
    }
  }
}
