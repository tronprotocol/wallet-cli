package org.tron.walletcli.cli;

import org.bouncycastle.util.encoders.Hex;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.common.utils.Utils;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.trident.proto.Response;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.cli.commands.ContractCommands;
import org.tron.walletcli.cli.commands.QueryCommands;
import org.tron.walletcli.cli.commands.WalletCommands;
import org.tron.walletcli.cli.commands.WitnessCommands;
import org.tron.walletserver.ApiClient;
import org.tron.walletserver.WalletApi;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public class StandardCliRunnerTest {

  @Test
  public void usageErrorDoesNotTerminateJvmAndRestoresStreams() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("needs-arg")
        .description("Command with a required option")
        .option("value", "Required value", true)
        .handler((ctx, opts, wrapper, out) -> {
          Map<String, Object> json = new LinkedHashMap<String, Object>();
          json.put("value", opts.getString("value"));
          out.success("ok", json);
        })
        .build());
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("ok")
        .description("Simple success command")
        .handler((ctx, opts, wrapper, out) -> {
          Map<String, Object> json = Collections.<String, Object>singletonMap("status", "ok");
          out.success("ok", json);
        })
        .build());

    ByteArrayOutputStream firstStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream firstStderr = new ByteArrayOutputStream();
    PrintStream firstOut = new PrintStream(firstStdout);
    PrintStream firstErr = new PrintStream(firstStderr);
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
    GlobalOptions badOpts = GlobalOptions.parse(new String[]{"--output", "json", "needs-arg"});
    int exitCode = new StandardCliRunner(registry, badOpts, firstOut, firstErr).execute();

    Assert.assertEquals(2, exitCode);
    String json = new String(firstStdout.toByteArray(), StandardCharsets.UTF_8);
    Assert.assertTrue(json.contains("\"success\": false"));
    Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
    Assert.assertSame(originalOut, System.out);
    Assert.assertSame(originalErr, System.err);
    Assert.assertSame(originalIn, System.in);

    ByteArrayOutputStream secondStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream secondStderr = new ByteArrayOutputStream();
    PrintStream secondOut = new PrintStream(secondStdout);
    PrintStream secondErr = new PrintStream(secondStderr);
    GlobalOptions okOpts = GlobalOptions.parse(new String[]{"--output", "json", "ok"});
    exitCode = new StandardCliRunner(registry, okOpts, secondOut, secondErr).execute();

    Assert.assertEquals(0, exitCode);
    json = new String(secondStdout.toByteArray(), StandardCharsets.UTF_8);
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("\"status\": \"ok\""));
    Assert.assertEquals("", new String(secondStderr.toByteArray(), StandardCharsets.UTF_8));
    Assert.assertSame(originalOut, System.out);
    Assert.assertSame(originalErr, System.err);
    Assert.assertSame(originalIn, System.in);
  }

  @Test
  public void executionErrorDoesNotTerminateJvmAndReturnsExitCodeOne() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("boom")
        .description("Command that fails")
        .handler((ctx, opts, wrapper, out) -> out.error("boom", "simulated failure"))
        .build());

    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream testOut = new PrintStream(stdout);
    PrintStream testErr = new PrintStream(stderr);
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
    GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "boom"});
    int exitCode = new StandardCliRunner(registry, opts, testOut, testErr).execute();

    Assert.assertEquals(1, exitCode);
    String json = new String(stdout.toByteArray(), StandardCharsets.UTF_8);
    Assert.assertTrue(json.contains("\"success\": false"));
    Assert.assertTrue(json.contains("\"error\": \"boom\""));
    Assert.assertEquals("", new String(stderr.toByteArray(), StandardCharsets.UTF_8));
    Assert.assertSame(originalOut, System.out);
    Assert.assertSame(originalErr, System.err);
    Assert.assertSame(originalIn, System.in);
  }

  @Test
  public void commandErrorExceptionIsRenderedByRunnerAsExecutionError() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("structured-boom")
        .description("Command that throws structured errors")
        .handler((ctx, opts, wrapper, out) -> {
          throw new CommandErrorException("query_failed", "structured failure");
        })
        .build());

    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "structured-boom"});
      int exitCode = new StandardCliRunner(
          registry, opts, new PrintStream(stdout), new PrintStream(stderr)).execute();

      Assert.assertEquals(1, exitCode);
      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"query_failed\""));
      Assert.assertTrue(json.contains("structured failure"));
      Assert.assertEquals("", stderr.toString(StandardCharsets.UTF_8.name()));
    } catch (Exception e) {
      Assert.fail("Unexpected exception: " + e.getMessage());
    } finally {
      Assert.assertSame(originalOut, System.out);
      Assert.assertSame(originalErr, System.err);
    }
  }

  @Test
  public void missingOutcomeBecomesExecutionError() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("silent")
        .description("Command that does not emit an outcome")
        .handler((ctx, opts, wrapper, out) -> {
        })
        .build());

    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "silent"});
      int exitCode = new StandardCliRunner(
          registry, opts, new PrintStream(stdout), new PrintStream(stderr)).execute();

      Assert.assertEquals(1, exitCode);
      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"execution_error\""));
      Assert.assertTrue(json.contains("Command completed without emitting an outcome"));
      Assert.assertEquals("", stderr.toString(StandardCharsets.UTF_8.name()));
    } catch (Exception e) {
      Assert.fail("Unexpected exception: " + e.getMessage());
    } finally {
      Assert.assertSame(originalOut, System.out);
      Assert.assertSame(originalErr, System.err);
    }
  }

  @Test
  public void commandParserSyntaxFailuresMapToUsageErrorExitCodeTwo() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("value")
        .description("Command with required value")
        .option("amount", "Amount", true, OptionDef.Type.LONG)
        .handler((ctx, opts, wrapper, out) -> out.raw("ok"))
        .build());

    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    PrintStream testOut = new PrintStream(stdout);
    PrintStream testErr = new PrintStream(stderr);
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
    GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "value", "--amount="});
    int exitCode = new StandardCliRunner(registry, opts, testOut, testErr).execute();

    Assert.assertEquals(2, exitCode);
    String json = new String(stdout.toByteArray(), StandardCharsets.UTF_8);
    Assert.assertTrue(json.contains("\"success\": false"));
    Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
    Assert.assertTrue(json.contains("Missing or empty value for --amount"));
    Assert.assertEquals("", new String(stderr.toByteArray(), StandardCharsets.UTF_8));
    Assert.assertSame(originalOut, System.out);
    Assert.assertSame(originalErr, System.err);
    Assert.assertSame(originalIn, System.in);
  }

  @Test
  public void sequentialJsonRunsUseProvidedStreamsWithoutGlobalMutation() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("ok")
        .description("Simple success command")
        .handler((ctx, opts, wrapper, out) -> out.success("ok",
            Collections.<String, Object>singletonMap("status", "ok")))
        .build());

    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;

    ByteArrayOutputStream firstStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream firstStderr = new ByteArrayOutputStream();
    GlobalOptions firstOpts = GlobalOptions.parse(new String[]{"--output", "json", "ok"});
    int firstExitCode = new StandardCliRunner(
        registry, firstOpts, new PrintStream(firstStdout), new PrintStream(firstStderr)).execute();

    ByteArrayOutputStream secondStdout = new ByteArrayOutputStream();
    ByteArrayOutputStream secondStderr = new ByteArrayOutputStream();
    GlobalOptions secondOpts = GlobalOptions.parse(new String[]{"--output", "json", "ok"});
    int secondExitCode = new StandardCliRunner(
        registry, secondOpts, new PrintStream(secondStdout), new PrintStream(secondStderr)).execute();

    Assert.assertEquals(0, firstExitCode);
    Assert.assertEquals(0, secondExitCode);
    Assert.assertTrue(firstStdout.toString().contains("\"success\": true"));
    Assert.assertTrue(secondStdout.toString().contains("\"success\": true"));
    Assert.assertEquals("", firstStderr.toString());
    Assert.assertEquals("", secondStderr.toString());
    Assert.assertSame(originalOut, System.out);
    Assert.assertSame(originalErr, System.err);
  }

  @Test
  public void standardCliDoesNotEnableEnvPasswordInputFallback() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("check-env-password-input")
        .description("Checks env-password input scope")
        .handler((ctx, opts, wrapper, out) -> {
          Assert.assertFalse(Utils.isEnvPasswordInputEnabled());
          out.raw("ok");
        })
        .build());

    Utils.setEnvPasswordInputEnabled(false);
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"check-env-password-input"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertFalse(Utils.isEnvPasswordInputEnabled());
    } finally {
      Utils.setEnvPasswordInputEnabled(false);
    }
  }

  @Test
  public void requireCommandFailsWhenWalletDirectoryIsMissing() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    boolean[] handlerCalled = {false};
    registry.add(CommandDefinition.builder()
        .name("needs-wallet")
        .description("Command requiring auth")
        .handler((ctx, opts, wrapper, out) -> {
          handlerCalled[0] = true;
          out.raw("ok");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-no-wallet").toFile();
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"needs-wallet"});
      int exitCode = new StandardCliRunner(registry, opts, () -> "TempPass123!A").execute();

      Assert.assertEquals(1, exitCode);
      Assert.assertFalse(handlerCalled[0]);
      Assert.assertEquals("", stdout.toString("UTF-8"));
      Assert.assertTrue(stderr.toString("UTF-8").contains("Wallet directory not found"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
      tempDir.delete();
    }
  }

  @Test
  public void neverAuthCommandIgnoresMissingWalletDirectory() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("ok")
        .description("Simple success command")
        .handler((ctx, opts, wrapper, out) -> out.raw("ok"))
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-no-wallet-never").toFile();
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"ok"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertEquals("ok\n", stdout.toString("UTF-8"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
      tempDir.delete();
    }
  }

  @Test
  public void walletOverrideResolvesFileNameAndWalletName() throws Exception {
    File walletDir = Files.createTempDirectory("runner-wallet-override").toFile();
    File walletFile = createWalletFile(walletDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");

    Assert.assertEquals(walletFile.getCanonicalPath(),
        StandardCliRunner.resolveWalletOverride(walletDir, walletFile.getName()).getCanonicalPath());
    Assert.assertEquals(walletFile.getCanonicalPath(),
        StandardCliRunner.resolveWalletOverride(walletDir, "alpha").getCanonicalPath());

    Assert.assertEquals(walletFile.getCanonicalPath(),
        StandardCliRunner.resolveWalletOverride(walletDir, walletFile.getAbsolutePath()).getCanonicalPath());
  }

  @Test
  public void globalWalletOverrideIsExposedViaCommandContext() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("inspect")
        .description("Expose command context to the handler")
        .handler((ctx, opts, wrapper, out) -> {
          Assert.assertEquals("/tmp/example-wallet.json", ctx.getWalletOverride());
          out.raw("ok");
        })
        .build());

    GlobalOptions opts = GlobalOptions.parse(
        new String[]{"--wallet", "/tmp/example-wallet.json", "inspect"});
    int exitCode = new StandardCliRunner(registry, opts).execute();

    Assert.assertEquals(0, exitCode);
  }

  @Test
  public void walletOverrideRejectsAmbiguousWalletNames() throws Exception {
    File walletDir = Files.createTempDirectory("runner-wallet-ambiguous").toFile();
    createWalletFile(walletDir, "duplicate", "0000000000000000000000000000000000000000000000000000000000000001");
    createWalletFile(walletDir, "duplicate", "0000000000000000000000000000000000000000000000000000000000000002");

    try {
      StandardCliRunner.resolveWalletOverride(walletDir, "duplicate");
      Assert.fail("Expected ambiguous wallet name to be rejected");
    } catch (IllegalArgumentException e) {
      Assert.assertTrue(e.getMessage().contains("Multiple wallets found with name 'duplicate'"));
    }
  }

  @Test
  public void requireCommandRejectsExplicitWalletPathOutsideWalletDirectory() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("needs-wallet")
        .description("Command requiring auth")
        .handler((ctx, opts, wrapper, out) -> {
          out.raw("ok");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-wallet-explicit").toFile();
    File externalDir = Files.createTempDirectory("runner-wallet-explicit-file").toFile();
    File walletFile = createWalletFile(externalDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{
          "--wallet", walletFile.getAbsolutePath(), "needs-wallet"
      });
      int exitCode = new StandardCliRunner(registry, opts, () -> "TempPass123!A").execute();

      Assert.assertEquals("Absolute wallet path to existing file should be accepted", 0, exitCode);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void requireCommandFailsWhenMasterPasswordIsMissing() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    boolean[] handlerCalled = {false};
    registry.add(CommandDefinition.builder()
        .name("needs-wallet")
        .description("Command requiring auth")
        .handler((ctx, opts, wrapper, out) -> {
          handlerCalled[0] = true;
          out.raw("ok");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-wallet-missing-password").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    File walletFile = createWalletFile(walletDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      ActiveWalletConfig.setActiveAddress(readWalletAddress(walletFile));
      GlobalOptions opts = GlobalOptions.parse(new String[]{"needs-wallet"});
      int exitCode = new StandardCliRunner(registry, opts, () -> null).execute();

      Assert.assertEquals(1, exitCode);
      Assert.assertFalse(handlerCalled[0]);
      Assert.assertEquals("", stdout.toString("UTF-8"));
      Assert.assertTrue(stderr.toString("UTF-8").contains("MASTER_PASSWORD is required"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void requireCommandFailsWhenMasterPasswordIsInvalid() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    boolean[] handlerCalled = {false};
    registry.add(CommandDefinition.builder()
        .name("needs-wallet")
        .description("Command requiring auth")
        .handler((ctx, opts, wrapper, out) -> {
          handlerCalled[0] = true;
          out.raw("ok");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-wallet-invalid-password").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    File walletFile = createWalletFile(walletDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      ActiveWalletConfig.setActiveAddress(readWalletAddress(walletFile));
      GlobalOptions opts = GlobalOptions.parse(new String[]{"needs-wallet"});
      int exitCode = new StandardCliRunner(registry, opts, () -> "WrongPass123!B").execute();

      Assert.assertEquals(1, exitCode);
      Assert.assertFalse(handlerCalled[0]);
      Assert.assertEquals("", stdout.toString("UTF-8"));
      Assert.assertTrue(stderr.toString("UTF-8").contains("Invalid MASTER_PASSWORD"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void grpcEndpointOverrideReplacesApiClientForCurrentRun() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("ok")
        .description("Simple success command")
        .handler((ctx, opts, wrapper, out) -> out.raw("ok"))
        .build());

    ApiClient originalApiCli = WalletApi.getApiCli();
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("runner-grpc-override").toFile();

    try {
      System.setProperty("user.dir", tempDir.getAbsolutePath());
      GlobalOptions opts = GlobalOptions.parse(
          new String[]{"--grpc-endpoint", "127.0.0.1:50051", "ok"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertNotSame(originalApiCli, WalletApi.getApiCli());
    } finally {
      WalletApi.setApiCli(originalApiCli);
      System.setProperty("user.dir", originalUserDir);
      tempDir.delete();
    }
  }

  @Test
  public void grpcEndpointValidationFailurePreservesClientFromApplyNetwork() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("ok")
        .description("Simple success command")
        .handler((ctx, opts, wrapper, out) -> out.raw("ok"))
        .build());

    ApiClient originalApiCli = WalletApi.getApiCli();
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("runner-grpc-mismatch").toFile();

    try {
      System.setProperty("user.dir", tempDir.getAbsolutePath());
      // Use Nile fullnode endpoint but claim --network main → consistency mismatch.
      // The mismatch is detected before any client is created, so the original
      // default client survives unchanged.
      String nileFullNode = NetType.NILE.getGrpc().getFullNode();
      GlobalOptions opts = GlobalOptions.parse(
          new String[]{"--network", "main", "--grpc-endpoint", nileFullNode, "ok"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(2, exitCode);
      // No client replacement should have occurred — the mismatch fails early.
      ApiClient surviving = WalletApi.getApiCli();
      Assert.assertSame("original client should survive a mismatch failure",
          originalApiCli, surviving);
    } finally {
      WalletApi.setApiCli(originalApiCli);
      System.setProperty("user.dir", originalUserDir);
      tempDir.delete();
    }
  }

  @Test
  public void neverAuthCommandIgnoresBrokenActiveWalletConfig() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-broken-active-wallet").toFile();
    File walletDir = new File(tempDir, "Wallet");
    File activeConfig = new File(walletDir, ".active-wallet");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    Assert.assertTrue(walletDir.mkdirs());
    Files.write(activeConfig.toPath(), "{\"address\":\"TBrokenWalletAddress\"}".getBytes(StandardCharsets.UTF_8));

    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "current-network"});
      int exitCode = new StandardCliRunner(registry, opts, () -> "ShouldNotBeUsed").execute();

      Assert.assertEquals(0, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertFalse(json.contains("wallet_not_found"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void autoAuthPolicyFollowsRegisteredCommandMetadata() {
    CommandRegistry queryRegistry = new CommandRegistry();
    QueryCommands.register(queryRegistry);

    CommandDefinition getBalance = queryRegistry.lookup("get-balance");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(getBalance, getBalance.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    })));
    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(getBalance, getBalance.parseArgs(new String[0])));

    CommandDefinition getUsdtBalance = queryRegistry.lookup("get-usdt-balance");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(getUsdtBalance, getUsdtBalance.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    })));
    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(getUsdtBalance, getUsdtBalance.parseArgs(new String[0])));

    CommandDefinition gasFreeInfo = queryRegistry.lookup("gas-free-info");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(gasFreeInfo, gasFreeInfo.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    })));
    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(gasFreeInfo, gasFreeInfo.parseArgs(new String[0])));

    CommandRegistry contractRegistry = new CommandRegistry();
    ContractCommands.register(contractRegistry);

    CommandDefinition triggerConstant = contractRegistry.lookup("trigger-constant-contract");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(triggerConstant, triggerConstant.parseArgs(new String[]{
        "--owner", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "balanceOf(address)"
    })));
    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(triggerConstant, triggerConstant.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "balanceOf(address)"
    })));

    CommandDefinition estimateEnergy = contractRegistry.lookup("estimate-energy");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(estimateEnergy, estimateEnergy.parseArgs(new String[]{
        "--owner", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "balanceOf(address)"
    })));
    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(estimateEnergy, estimateEnergy.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "balanceOf(address)"
    })));

    CommandRegistry walletRegistry = new CommandRegistry();
    WalletCommands.register(walletRegistry);

    CommandDefinition resetWallet = walletRegistry.lookup("reset-wallet");
    Assert.assertFalse(StandardCliRunner.requiresAutoAuth(resetWallet, resetWallet.parseArgs(new String[0])));
  }

  @Test
  public void estimateEnergyEmitsStructuredJsonPayload() throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));
    try {
      CommandRegistry registry = new CommandRegistry();
      ContractCommands.register(registry);
      CommandDefinition command = registry.lookup("estimate-energy");
      ParsedOptions opts = command.parseArgs(new String[]{
          "--owner", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
          "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
          "--method", "balanceOf(address)"
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      command.getHandler().execute(CommandContext.empty(), opts, new WalletApiWrapper() {
        @Override
        public Response.EstimateEnergyMessage estimateEnergyMessage(
            byte[] ownerAddress,
            byte[] contractAddress,
            long callValue,
            byte[] data,
            long tokenValue,
            String tokenId) {
          Response.EstimateEnergyMessage.Builder builder = Response.EstimateEnergyMessage.newBuilder();
          builder.getResultBuilder().setResult(true);
          builder.setEnergyRequired(321L);
          return builder.build();
        }
      }, formatter);
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"data\": {"));
      Assert.assertTrue(json.contains("\"result\": {"));
      Assert.assertFalse(json.contains("\"message\": \"Estimate energy result ="));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void commandHelpUsesJsonEnvelopeInJsonMode() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);

    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "get-balance", "--help"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"data\": {"));
      Assert.assertTrue(json.contains("\"help\":"));
      Assert.assertTrue(json.contains("Get the balance of an address"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  @Test
  public void commandHelpRemainsPlainTextInTextMode() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);

    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"get-balance", "--help"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String text = stdout.toString("UTF-8");
      Assert.assertTrue(text.contains("Get the balance of an address"));
      Assert.assertFalse(text.contains("\"success\""));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  @Test
  public void booleanFlagBeforeHelpDoesNotConsumeHelpToken() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("bool-help")
        .description("Boolean help command")
        .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
        .handler((ctx, opts, wrapper, out) -> out.raw("ok"))
        .build());

    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"bool-help", "--multi", "-h"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String text = stdout.toString("UTF-8");
      Assert.assertTrue(text.contains("Boolean help command"));
      Assert.assertFalse(text.contains("Unexpected argument"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  @Test
  public void helpFlagAnywhereInArgsTriggersCommandHelp() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("value-help")
        .description("Value help command")
        .option("note", "Note text", true)
        .handler((ctx, opts, wrapper, out) -> out.raw(opts.getString("note")))
        .build());

    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      // -h after a non-boolean option should trigger help, not be consumed as its value
      GlobalOptions opts = GlobalOptions.parse(new String[]{"value-help", "--note", "-h"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String text = stdout.toString("UTF-8");
      Assert.assertTrue("expected help text", text.contains("Value help command"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  @Test
  public void helpFlagAfterNonBooleanOptionTriggersHelp() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .authPolicy(CommandDefinition.AuthPolicy.NEVER)
        .name("get-balance")
        .description("Get account balance")
        .option("address", "Wallet address", false)
        .handler((ctx, opts, wrapper, out) -> out.raw("balance"))
        .build());

    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      // Bug: --address --help used to silently swallow --help
      GlobalOptions opts = GlobalOptions.parse(new String[]{"get-balance", "--address", "--help"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertTrue("expected help text", stdout.toString("UTF-8").contains("Get account balance"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }

  @Test
  public void listWalletReturnsSuccessForEmptyWalletDirectory() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-list-wallet-empty").toFile();
    File walletDir = new File(tempDir, "Wallet");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    Assert.assertTrue(walletDir.mkdirs());

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "list-wallet"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("[]"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void listWalletIgnoresMalformedActiveWalletConfig() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-list-wallet").toFile();
    File walletDir = new File(tempDir, "Wallet");
    File activeConfig = new File(walletDir, ".active-wallet");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    Assert.assertTrue(walletDir.mkdirs());
    createWalletFile(walletDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");
    Files.write(activeConfig.toPath(), "{\"address\":123}".getBytes(StandardCharsets.UTF_8));

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "list-wallet"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"wallets\": ["));
      Assert.assertTrue(json.contains("\"is-active\""));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void voteWitnessRejectsNonNumericVoteCountAsUsageError() throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));
    try {
      CommandRegistry registry = new CommandRegistry();
      WitnessCommands.register(registry);
      CommandDefinition command = registry.lookup("vote-witness");
      ParsedOptions opts = command.parseArgs(new String[]{
          "--votes", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL abc"
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      try {
        command.getHandler().execute(CommandContext.empty(), opts, new WalletApiWrapper(), formatter);
        Assert.fail("Expected vote validation to abort with usage error");
      } catch (CliAbortException e) {
        Assert.assertEquals(CliAbortException.Kind.USAGE, e.getKind());
      }
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
      Assert.assertTrue(json.contains("Vote count must be a positive integer: abc"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void voteWitnessRejectsNonPositiveVoteCountAsUsageError() throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));
    try {
      CommandRegistry registry = new CommandRegistry();
      WitnessCommands.register(registry);
      CommandDefinition command = registry.lookup("vote-witness");
      ParsedOptions opts = command.parseArgs(new String[]{
          "--votes", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL 0"
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      try {
        command.getHandler().execute(CommandContext.empty(), opts, new WalletApiWrapper(), formatter);
        Assert.fail("Expected vote validation to abort with usage error");
      } catch (CliAbortException e) {
        Assert.assertEquals(CliAbortException.Kind.USAGE, e.getKind());
      }
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
      Assert.assertTrue(json.contains("Vote count must be a positive integer: 0"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void requireCommandAuthenticatesBeforeHandlerExecution() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    boolean[] handlerCalled = {false};
    boolean[] wasLoggedIn = {false};
    registry.add(CommandDefinition.builder()
        .name("sign-cmd")
        .description("Command requiring auth for signing")
        .handler((ctx, opts, wrapper, out) -> {
          handlerCalled[0] = true;
          wasLoggedIn[0] = wrapper.isLoginState();
          out.raw("signed");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-sign-auth").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    File walletFile = createWalletFile(walletDir, "signer", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      ActiveWalletConfig.setActiveAddress(readWalletAddress(walletFile));
      GlobalOptions opts = GlobalOptions.parse(new String[]{"sign-cmd"});
      int exitCode = new StandardCliRunner(registry, opts, () -> "TempPass123!A").execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertTrue(handlerCalled[0]);
      Assert.assertTrue(wasLoggedIn[0]);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void requireCommandBlocksHandlerWhenAuthFails() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    boolean[] handlerCalled = {false};
    registry.add(CommandDefinition.builder()
        .name("sign-cmd")
        .description("Command requiring auth for signing")
        .handler((ctx, opts, wrapper, out) -> {
          handlerCalled[0] = true;
          out.raw("signed");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-sign-noauth").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    File walletFile = createWalletFile(walletDir, "signer", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      ActiveWalletConfig.setActiveAddress(readWalletAddress(walletFile));
      GlobalOptions opts = GlobalOptions.parse(new String[]{"sign-cmd"});
      int exitCode = new StandardCliRunner(registry, opts, () -> null).execute();

      Assert.assertEquals(1, exitCode);
      Assert.assertFalse(handlerCalled[0]);
      Assert.assertTrue(stderr.toString("UTF-8").contains("MASTER_PASSWORD is required"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void handlerExceptionProducesExecutionErrorInJsonMode() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("sign-fail")
        .description("Command that throws during execution")
        .handler((ctx, opts, wrapper, out) -> {
          throw new CommandErrorException("execution_error", "Transaction signing failed");
        })
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    File tempDir = Files.createTempDirectory("runner-sign-fail").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    File walletFile = createWalletFile(walletDir, "signer", "0000000000000000000000000000000000000000000000000000000000000001");
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      ActiveWalletConfig.setActiveAddress(readWalletAddress(walletFile));
      GlobalOptions opts = GlobalOptions.parse(new String[]{"--output", "json", "sign-fail"});
      int exitCode = new StandardCliRunner(registry, opts, () -> "TempPass123!A").execute();

      Assert.assertEquals(1, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"execution_error\""));
      Assert.assertTrue(json.contains("Transaction signing failed"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void commandErrorExceptionDoesNotCaptureStackTrace() {
    CommandErrorException exception = new CommandErrorException("boom", "simulated failure");

    Assert.assertEquals("boom", exception.getCode());
    Assert.assertEquals("simulated failure", exception.getMessage());
    Assert.assertEquals(0, exception.getStackTrace().length);
  }

  private File createWalletFile(File walletDir, String walletName, String privateKeyHex) throws Exception {
    byte[] password = "TempPass123!A".getBytes(StandardCharsets.UTF_8);
    byte[] privateKey = Hex.decode(privateKeyHex);
    try {
      WalletFile walletFile = WalletApi.CreateWalletFile(password, privateKey, null);
      walletFile.setName(walletName);
      WalletUtils.generateWalletFile(walletFile, walletDir);
      return walletFile.getSourceFile();
    } finally {
      Arrays.fill(password, (byte) 0);
      Arrays.fill(privateKey, (byte) 0);
    }
  }

  private String readWalletAddress(File walletFile) throws Exception {
    return WalletUtils.loadWalletFile(walletFile).getAddress();
  }

}
