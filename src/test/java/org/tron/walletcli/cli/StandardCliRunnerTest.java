package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.utils.Utils;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.walletcli.cli.commands.QueryCommands;
import org.tron.walletcli.cli.commands.WalletCommands;
import org.tron.walletserver.ApiClient;
import org.tron.walletserver.WalletApi;

import java.io.ByteArrayOutputStream;
import java.io.File;
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

  @Test
  public void standardCliTemporarilyEnablesEnvPasswordInput() {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("check-env-password-input")
        .description("Checks env-password input scope")
        .handler((opts, wrapper, out) -> {
          Assert.assertTrue(Utils.isEnvPasswordInputEnabled());
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
  public void missingWalletDirectoryPrintsAutoLoginSkipInfoInTextMode() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("ok")
        .description("Simple success command")
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build());

    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    File tempDir = Files.createTempDirectory("runner-no-wallet").toFile();

    System.setProperty("user.dir", tempDir.getAbsolutePath());
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    try {
      GlobalOptions opts = GlobalOptions.parse(new String[]{"ok"});
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      Assert.assertEquals("ok\n", stdout.toString("UTF-8"));
      Assert.assertTrue(stderr.toString("UTF-8")
          .contains("No wallet directory found — skipping auto-login"));
      Assert.assertSame(originalIn, System.in);
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setIn(originalIn);
      System.setProperty("user.dir", originalUserDir);
      tempDir.delete();
    }
  }

  @Test
  public void walletOverrideResolvesPathFileNameAndWalletName() throws Exception {
    File walletDir = Files.createTempDirectory("runner-wallet-override").toFile();
    File walletFile = createWalletFile(walletDir, "alpha", "0000000000000000000000000000000000000000000000000000000000000001");

    Assert.assertEquals(walletFile.getAbsolutePath(),
        StandardCliRunner.resolveWalletOverride(walletDir, walletFile.getAbsolutePath()).getAbsolutePath());
    Assert.assertEquals(walletFile.getAbsolutePath(),
        StandardCliRunner.resolveWalletOverride(walletDir, walletFile.getName()).getAbsolutePath());
    Assert.assertEquals(walletFile.getAbsolutePath(),
        StandardCliRunner.resolveWalletOverride(walletDir, "alpha").getAbsolutePath());
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
  public void grpcEndpointOverrideReplacesApiClientForCurrentRun() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    registry.add(CommandDefinition.builder()
        .name("ok")
        .description("Simple success command")
        .handler((opts, wrapper, out) -> out.raw("ok"))
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
  public void currentNetworkSkipsBrokenActiveWalletAutoAuth() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
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
      int exitCode = new StandardCliRunner(registry, opts).execute();

      Assert.assertEquals(0, exitCode);
      String json = stdout.toString("UTF-8");
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertFalse(json.contains("wallet_not_found"));
      Assert.assertEquals("", stderr.toString("UTF-8"));
    } finally {
      System.setOut(originalOut);
      System.setErr(originalErr);
      System.setIn(originalIn);
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void autoAuthPolicyStillRequiresWalletForChangePassword() {
    CommandDefinition changePassword = CommandDefinition.builder()
        .name("change-password")
        .description("Change password")
        .option("old-password", "Current password", true)
        .option("new-password", "New password", true)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
    ParsedOptions opts = changePassword.parseArgs(new String[]{
        "--old-password", "OldPass123!A",
        "--new-password", "NewPass123!B"
    });

    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(changePassword, opts));
  }

  @Test
  public void autoAuthPolicyStillRequiresWalletForUsdtBalanceEvenWithAddress() {
    CommandDefinition getUsdtBalance = CommandDefinition.builder()
        .name("get-usdt-balance")
        .description("Get USDT balance")
        .option("address", "Address", false)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
    ParsedOptions opts = getUsdtBalance.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    });

    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(getUsdtBalance, opts));
  }

  @Test
  public void autoAuthPolicyStillRequiresWalletForGasFreeInfoEvenWithAddress() {
    CommandDefinition gasFreeInfo = CommandDefinition.builder()
        .name("gas-free-info")
        .description("GasFree info")
        .option("address", "Address", false)
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
    ParsedOptions opts = gasFreeInfo.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    });

    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(gasFreeInfo, opts));
  }

  @Test
  public void autoAuthPolicyStillRequiresWalletForTransactionHistoryViewer() {
    CommandDefinition transactionHistory = CommandDefinition.builder()
        .name("view-transaction-history")
        .description("View tx history")
        .handler((opts, wrapper, out) -> out.raw("ok"))
        .build();
    ParsedOptions opts = transactionHistory.parseArgs(new String[0]);

    Assert.assertTrue(StandardCliRunner.requiresAutoAuth(transactionHistory, opts));
  }

  @Test
  public void listWalletIgnoresMalformedActiveWalletConfig() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    InputStream originalIn = System.in;
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
      System.setIn(originalIn);
      System.setProperty("user.dir", originalUserDir);
    }
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
}
