package org.tron.walletcli.cli.commands;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.cli.CommandContext;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.ParsedOptions;
import org.tron.walletserver.WalletApi;

/**
 * Network-aware, fail-open resource-code guard for staking commands (issue #939).
 *
 * Covers the tri-state getAllowNewResourceModel behavior (enabled / disabled / unknown fail-open),
 * unconditional TRON_POWER rejection for delegation, and the receiver-aware v1 semantics: a v1
 * freeze/unfreeze with a receiver is a delegated freeze, where TRON_POWER is not delegatable.
 */
public class StakingResourceGuardTest {

  private static final String RECEIVER = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

  /** Stub wrapper: fixed getAllowNewResourceModel state; records whether a broadcast was attempted. */
  private static class GuardStubWrapper extends WalletApiWrapper {
    private final Boolean modelEnabled;
    boolean broadcastCalled = false;

    GuardStubWrapper(Boolean modelEnabled) {
      this.modelEnabled = modelEnabled;
    }

    @Override
    public Boolean isNewResourceModelEnabled() {
      return modelEnabled;
    }

    @Override
    public String freezeBalanceForCli(byte[] ownerAddress, long frozenBalance, long frozenDuration,
        int resourceCode, byte[] receiverAddress, boolean multi) {
      broadcastCalled = true;
      return "faketxid";
    }

    @Override
    public String unfreezeBalanceForCli(byte[] ownerAddress, int resourceCode, byte[] receiverAddress,
        boolean multi) {
      broadcastCalled = true;
      return "faketxid";
    }

    @Override
    public String delegateResourceForCli(byte[] ownerAddress, long balance, int resourceCode,
        byte[] receiverAddress, boolean lock, long lockPeriod, boolean multi) {
      broadcastCalled = true;
      return "faketxid";
    }
  }

  private static class Result {
    final JsonObject json;
    final boolean broadcastCalled;

    Result(JsonObject json, boolean broadcastCalled) {
      this.json = json;
      this.broadcastCalled = broadcastCalled;
    }
  }

  private Result run(GuardStubWrapper wrapper, String commandName, String... args) throws Exception {
    NetType originalNetwork = WalletApi.getCurrentNetwork();
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    WalletApi.setCurrentNetwork(NetType.NILE);
    System.setOut(new PrintStream(stdout));
    try {
      CommandRegistry registry = new CommandRegistry();
      StakingCommands.register(registry);
      CommandDefinition command = registry.lookup(commandName);
      ParsedOptions opts = command.parseArgs(args);
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);
      try {
        command.getHandler().execute(CommandContext.empty(), opts, wrapper, formatter);
      } catch (RuntimeException ignored) {
        // usageError()/error() throw CliAbortException after recording the outcome
      }
      formatter.flush();
      String json = stdout.toString(StandardCharsets.UTF_8.name());
      return new Result(JsonParser.parseString(json).getAsJsonObject(), wrapper.broadcastCalled);
    } finally {
      WalletApi.setCurrentNetwork(originalNetwork);
      System.setOut(originalOut);
    }
  }

  private void assertUsageError(Result r, String messageFragment) {
    Assert.assertFalse("expected failure", r.json.get("success").getAsBoolean());
    Assert.assertEquals("usage_error", r.json.get("error").getAsString());
    Assert.assertTrue("message should contain: " + messageFragment,
        r.json.get("message").getAsString().contains(messageFragment));
    Assert.assertFalse("must not broadcast when rejected", r.broadcastCalled);
  }

  private void assertProceeded(Result r) {
    Assert.assertTrue("expected success", r.json.get("success").getAsBoolean());
    Assert.assertTrue("should reach broadcast", r.broadcastCalled);
  }

  // --- tri-state getAllowNewResourceModel for a self-freeze (no receiver) ---

  @Test
  public void freezeBalanceAllowsTronPowerWhenModelEnabled() throws Exception {
    Result r = run(new GuardStubWrapper(Boolean.TRUE), "freeze-balance",
        "--amount", "1000000", "--duration", "3", "--resource", "2");
    assertProceeded(r);
  }

  @Test
  public void freezeBalanceRejectsTronPowerWhenModelDisabled() throws Exception {
    Result r = run(new GuardStubWrapper(Boolean.FALSE), "freeze-balance",
        "--amount", "1000000", "--duration", "3", "--resource", "2");
    assertUsageError(r, "not enabled on this network");
  }

  @Test
  public void freezeBalanceAllowsTronPowerFailOpenWhenModelUnknown() throws Exception {
    Result r = run(new GuardStubWrapper(null), "freeze-balance",
        "--amount", "1000000", "--duration", "3", "--resource", "2");
    assertProceeded(r);
  }

  // --- receiver-aware v1 semantics: freeze/unfreeze with a receiver is a delegation ---

  @Test
  public void freezeBalanceWithReceiverRejectsTronPowerEvenWhenModelEnabled() throws Exception {
    Result r = run(new GuardStubWrapper(Boolean.TRUE), "freeze-balance",
        "--amount", "1000000", "--duration", "3", "--resource", "2", "--receiver", RECEIVER);
    assertUsageError(r, "not delegatable");
  }

  @Test
  public void unfreezeBalanceWithReceiverRejectsTronPowerEvenWhenModelEnabled() throws Exception {
    Result r = run(new GuardStubWrapper(Boolean.TRUE), "unfreeze-balance",
        "--resource", "2", "--receiver", RECEIVER);
    assertUsageError(r, "not delegatable");
  }

  // --- delegation always rejects TRON_POWER, regardless of the chain parameter ---

  @Test
  public void delegateResourceRejectsTronPowerEvenWhenModelEnabled() throws Exception {
    Result r = run(new GuardStubWrapper(Boolean.TRUE), "delegate-resource",
        "--amount", "1000000", "--resource", "2", "--receiver", RECEIVER);
    assertUsageError(r, "not delegatable");
  }
}
