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

  private CommandDefinition buildValueCommand() {
    return CommandDefinition.builder()
        .name("value-cmd")
        .description("Value parsing test")
        .option("amount", "Amount", true, OptionDef.Type.LONG)
        .option("offset", "Offset", false, OptionDef.Type.LONG)
        .option("note", "Note", false)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
  }

  private CommandDefinition buildRequiredBooleanCommand() {
    return CommandDefinition.builder()
        .name("approve-cmd")
        .description("Required boolean parsing test")
        .option("approve", "Approve", true, OptionDef.Type.BOOLEAN)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
  }

  @Test
  public void booleanFlagWithoutValueParsesAsTrue() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi"});
    Assert.assertTrue(opts.getBoolean("multi"));
    Assert.assertEquals("true", opts.getString("multi"));
  }

  @Test
  public void booleanFlagAcceptsExplicitFalseInline() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi=false"});
    Assert.assertFalse(opts.getBoolean("multi"));
    Assert.assertEquals("false", opts.getString("multi"));
  }

  @Test
  public void booleanFlagAcceptsExplicitTrueInline() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi=true"});
    Assert.assertTrue(opts.getBoolean("multi"));
  }

  @Test
  public void booleanFlagAcceptsInlineValueAndCanonicalizesStorage() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi=yes"});

    Assert.assertTrue(opts.getBoolean("multi"));
    Assert.assertEquals("true", opts.getString("multi"));
  }

  @Test
  public void requiredBooleanOptionMayBeProvidedAsBareFlag() {
    ParsedOptions opts = buildRequiredBooleanCommand().parseArgs(new String[]{"--approve"});

    Assert.assertTrue(opts.getBoolean("approve"));
    Assert.assertEquals("true", opts.getString("approve"));
  }

  @Test
  public void parseSupportsLongOptionInlineValueSyntax() {
    ParsedOptions opts = buildValueCommand().parseArgs(new String[]{"--amount=1", "--note=hello"});

    Assert.assertEquals(1L, opts.getLong("amount"));
    Assert.assertEquals("hello", opts.getString("note"));
  }

  @Test
  public void parseAllowsNegativeNumericValueTokensForValuedOptions() {
    ParsedOptions opts = buildValueCommand().parseArgs(new String[]{"--amount", "1", "--offset", "-1"});

    Assert.assertEquals(-1L, opts.getLong("offset"));
  }

  @Test
  public void shortMultiFlagOnlyWorksWhenMultiIsDeclared() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"-m"});

    Assert.assertTrue(opts.getBoolean("multi"));
    Assert.assertEquals("true", opts.getString("multi"));
  }

  @Test
  public void parseRejectsUnknownLongOption() {
    assertUsageError(buildValueCommand(), new String[]{"--unknown", "1"},
        "Unknown option: --unknown");
  }

  @Test
  public void parseRejectsUnknownShortOption() {
    assertUsageError(buildValueCommand(), new String[]{"-x"},
        "Unknown option: -x");
  }

  @Test
  public void parseRejectsBarePositionalTokens() {
    assertUsageError(buildValueCommand(), new String[]{"literal"},
        "Unexpected argument: literal");
  }

  @Test
  public void parseRejectsEmptyOptionName() {
    assertUsageError(buildValueCommand(), new String[]{"--"},
        "Empty option name: --");
  }

  @Test
  public void parseRejectsMissingNonBooleanValue() {
    assertUsageError(buildValueCommand(), new String[]{"--amount"},
        "Missing value for --amount");
    assertUsageError(buildValueCommand(), new String[]{"--amount", "--note", "x"},
        "Missing value for --amount");
  }

  @Test
  public void parseRejectsEmptyInlineAndSplitNonBooleanValues() {
    assertUsageError(buildValueCommand(), new String[]{"--amount="},
        "Missing or empty value for --amount");
    assertUsageError(buildValueCommand(), new String[]{"--amount", ""},
        "Missing or empty value for --amount");
  }

  @Test
  public void parseRejectsInvalidBooleanValues() {
    assertUsageError(buildBooleanCommand(), new String[]{"--multi=maybe"},
        "Option --multi requires a boolean value (true/false/1/0/yes/no), got: maybe");
  }

  @Test
  public void booleanFlagDoesNotConsumeFollowingBareToken() {
    assertUsageError(buildBooleanCommand(), new String[]{"--multi", "maybe"},
        "Unexpected argument: maybe");
  }

  @Test
  public void booleanFlagDoesNotConsumeFollowingShortOptionLikeToken() {
    assertUsageError(buildBooleanCommand(), new String[]{"--multi", "-1"},
        "Unknown option: -1");
  }

  @Test
  public void parseRejectsShortMultiWhenCommandDoesNotDeclareIt() {
    assertUsageError(buildValueCommand(), new String[]{"-m"},
        "Option -m is only supported for commands with --multi");
  }

  @Test
  public void parseRejectsRepeatedValuedOption() {
    assertUsageError(buildValueCommand(), new String[]{"--amount", "1", "--amount", "2"},
        "Repeated option: --amount");
  }

  @Test
  public void parseAllowsRepeatedBooleanWithSameEffectiveMeaning() {
    ParsedOptions opts = buildBooleanCommand().parseArgs(new String[]{"--multi", "--multi=true", "--multi=yes"});

    Assert.assertTrue(opts.getBoolean("multi"));
    Assert.assertEquals("true", opts.getString("multi"));
  }

  @Test
  public void parseRejectsRepeatedBooleanWithConflictingMeaning() {
    assertUsageError(buildBooleanCommand(), new String[]{"--multi", "--multi=false"},
        "Conflicting values for option: --multi");
  }

  @Test
  public void parseRejectsMalformedContractStyleMissingValueEarly() {
    CommandDefinition command = CommandDefinition.builder()
        .name("contract-cmd")
        .description("Contract parsing test")
        .option("contract", "Contract", true)
        .option("method", "Method", true)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();

    assertUsageError(command, new String[]{"--contract", "--method", "balanceOf(address)"},
        "Missing value for --contract");
    assertUsageError(command, new String[]{"--contract=", "--method", "balanceOf(address)"},
        "Missing or empty value for --contract");
  }

  @Test
  public void parseRejectsMissingRequiredOptionsAfterSyntaxParsing() {
    assertUsageError(buildRequiredBooleanCommand(), new String[0],
        "Missing required option(s): --approve");
  }

  @Test
  public void authPolicyDefaultsToRequire() {
    CommandDefinition command = buildValueCommand();

    Assert.assertEquals(CommandDefinition.AuthPolicy.REQUIRE,
        command.resolveAuthPolicy(command.parseArgs(new String[]{"--amount", "1"})));
  }

  @Test
  public void authPolicyResolverMayDependOnParsedOptions() {
    CommandDefinition command = CommandDefinition.builder()
        .name("conditional-auth")
        .description("Conditional auth")
        .option("address", "Address", false)
        .authPolicyResolver(opts -> opts.has("address")
            ? CommandDefinition.AuthPolicy.NEVER
            : CommandDefinition.AuthPolicy.REQUIRE)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();

    Assert.assertEquals(CommandDefinition.AuthPolicy.NEVER,
        command.resolveAuthPolicy(command.parseArgs(new String[]{"--address", "TXYZ"})));
    Assert.assertEquals(CommandDefinition.AuthPolicy.REQUIRE,
        command.resolveAuthPolicy(command.parseArgs(new String[0])));
  }

  private void assertUsageError(CommandDefinition command, String[] args, String expectedMessage) {
    try {
      command.parseArgs(args);
      Assert.fail("Expected usage error: " + expectedMessage);
    } catch (CliUsageException e) {
      Assert.assertEquals(expectedMessage, e.getMessage());
    }
  }
}
