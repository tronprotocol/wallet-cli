package org.tron.walletcli.cli.commands;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import org.apache.commons.lang3.tuple.Triple;
import org.junit.Assert;
import org.junit.Test;
import org.tron.trident.proto.Response;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.WalletApiWrapper.CliWalletCreationResult;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.ParsedOptions;
import org.tron.walletserver.WalletApi;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;

public class StandardCliCommandRoutingTest {
  private static JsonObject parseJson(String raw) {
    return JsonParser.parseString(raw).getAsJsonObject();
  }

  @Rule
  public TemporaryFolder tempFolder = new TemporaryFolder();

  private final String originalUserDir = System.getProperty("user.dir");

  @After
  public void restoreUserDir() {
    System.setProperty("user.dir", originalUserDir);
  }

  @Test
  public void triggerContractUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("trigger-contract");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "transfer(address,uint256)",
        "--params", "\"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL\",1",
        "--fee-limit", "1000000"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    AtomicBoolean cliSafeCalled = new AtomicBoolean(false);
    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public Triple<Boolean, Long, Long> callContractForCli(
          byte[] ownerAddress,
          byte[] contractAddress,
          long callValue,
          byte[] data,
          long feeLimit,
          long tokenValue,
          String tokenId,
          boolean isConstant,
          boolean display,
          boolean multi) {
        cliSafeCalled.set(true);
        return Triple.of(true, 0L, 0L);
      }

      @Override
      public Triple<Boolean, Long, Long> callContract(
          byte[] ownerAddress,
          byte[] contractAddress,
          long callValue,
          byte[] data,
          long feeLimit,
          long tokenValue,
          String tokenId,
          boolean isConstant,
          boolean display,
          boolean multi) {
        Assert.fail("legacy callContract() should not be used by standard CLI trigger-contract");
        return Triple.of(false, 0L, 0L);
      }
    }, formatter);
    formatter.flush();

    Assert.assertTrue("callContractForCli should be invoked", cliSafeCalled.get());
    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("TriggerContract successful !!"));
  }

  @Test
  public void getChainParametersUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);
    CommandDefinition command = registry.lookup("get-chain-parameters");
    ParsedOptions opts = command.parseArgs(new String[0]);
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    AtomicBoolean cliSafeCalled = new AtomicBoolean(false);
    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public Response.ChainParameters getChainParametersForCli() {
        cliSafeCalled.set(true);
        return Response.ChainParameters.newBuilder()
            .addChainParameter(Response.ChainParameters.ChainParameter.newBuilder()
                .setKey("getEnergyFee")
                .setValue(420L)
                .build())
            .build();
      }

      @Override
      public Response.ChainParameters getChainParameters() {
        Assert.fail("legacy getChainParameters() should not be used by standard CLI queries");
        return null;
      }
    }, formatter);
    formatter.flush();

    Assert.assertTrue("getChainParametersForCli should be invoked", cliSafeCalled.get());
    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("getEnergyFee"));
  }

  @Test
  public void getUsdtBalanceUsesExactStringPayload() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);
    CommandDefinition command = registry.lookup("get-usdt-balance");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public String getUSDTBalanceExact(byte[] ownerAddress) {
        return "9223372036854775808";
      }
    }, formatter);
    formatter.flush();

    JsonObject data = parseJson(stdout.toString(StandardCharsets.UTF_8.name())).getAsJsonObject("data");
    Assert.assertEquals("9223372036854775808", data.get("usdt_balance").getAsString());
  }

  @Test
  public void clearWalletKeystoreUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("clear-wallet-keystore");
    ParsedOptions opts = command.parseArgs(new String[]{"--force"});
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
    File walletFile = File.createTempFile("clear-wallet-routing", ".json");

    command.getHandler().execute(
        new org.tron.walletcli.cli.CommandContext(null, walletFile),
        opts,
        new WalletApiWrapper() {
      @Override
      public void clearWalletKeystoreForCli(boolean force, File targetWalletFile) {
        Assert.assertTrue(force);
        Assert.assertEquals(walletFile.getAbsolutePath(), targetWalletFile.getAbsolutePath());
      }

      @Override
      public boolean clearWalletKeystore(boolean force) {
        Assert.fail("legacy clearWalletKeystore() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("ClearWalletKeystore successful !!"));
    walletFile.delete();
  }

  @Test
  public void clearWalletKeystorePreservesActiveWalletOnFailure() throws Exception {
    File tempDir = java.nio.file.Files.createTempDirectory("clear-wallet-routing").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    ActiveWalletConfig.setActiveAddress("TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB");

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("clear-wallet-keystore");
    ParsedOptions opts = command.parseArgs(new String[]{"--force"});
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(new ByteArrayOutputStream()), System.err);

    try {
      command.getHandler().execute(
          new org.tron.walletcli.cli.CommandContext(null, new File(tempDir, "Wallet/active.json")),
          opts,
          new WalletApiWrapper() {
        @Override
        public void clearWalletKeystoreForCli(boolean force, File targetWalletFile) {
          throw new RuntimeException("boom");
        }
      }, formatter);
      Assert.fail("Expected clear-wallet-keystore failure");
    } catch (RuntimeException expected) {
      Assert.assertEquals("boom", expected.getMessage());
    }

    Assert.assertNotNull(ActiveWalletConfig.getActiveAddressLenient());
  }

  @Test
  public void clearWalletKeystoreDoesNotClearActiveWalletWhenDeletingExternalTarget() throws Exception {
    File tempDir = java.nio.file.Files.createTempDirectory("clear-wallet-external-routing").toFile();
    File walletDir = new File(tempDir, "Wallet");
    File activeWalletFile = new File(walletDir, "active.json");
    File externalDir = java.nio.file.Files.createTempDirectory("clear-wallet-external-file").toFile();
    File externalWalletFile = new File(externalDir, "external.json");
    Assert.assertTrue(walletDir.mkdirs());
    Assert.assertTrue(activeWalletFile.createNewFile());
    Assert.assertTrue(externalWalletFile.createNewFile());
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    Files.write(new File(walletDir, ".active-wallet").toPath(),
        "{\"address\":\"TActiveWalletAddress\"}".getBytes(StandardCharsets.UTF_8));

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("clear-wallet-keystore");
    ParsedOptions opts = command.parseArgs(new String[]{"--force"});
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(
        new org.tron.walletcli.cli.CommandContext(null, externalWalletFile),
        opts,
        new WalletApiWrapper() {
          @Override
          public void clearWalletKeystoreForCli(boolean force, File targetWalletFile) {
            Assert.assertEquals(externalWalletFile.getAbsolutePath(), targetWalletFile.getAbsolutePath());
          }
        },
        formatter);
    formatter.flush();

    Assert.assertNotNull(ActiveWalletConfig.getActiveAddressLenient());
  }

  @Test
  public void resetWalletClearsActiveWalletAfterSuccess() throws Exception {
    File tempDir = java.nio.file.Files.createTempDirectory("reset-wallet-routing").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    ActiveWalletConfig.setActiveAddress("TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB");

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("reset-wallet");
    ParsedOptions opts = command.parseArgs(new String[]{"--confirm", "delete-all-wallets"});
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void resetWalletForCli(boolean force) {
        Assert.assertTrue(force);
      }
    }, formatter);
    formatter.flush();

    Assert.assertNull(ActiveWalletConfig.getActiveAddressLenient());
    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("ResetWallet successful !!"));
  }

  @Test
  public void resetWalletDryRunIncludesLedgerAndConfigFields() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("reset-dryrun-scope").toFile();
    File walletDir = new File(tempDir, "Wallet");
    Assert.assertTrue(walletDir.mkdirs());
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    try {
      ActiveWalletConfig.setActiveAddress("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");

      CommandRegistry registry = new CommandRegistry();
      WalletCommands.register(registry);
      CommandDefinition command = registry.lookup("reset-wallet");
      ParsedOptions opts = command.parseArgs(new String[]{});
      ByteArrayOutputStream stdout = new ByteArrayOutputStream();
      OutputFormatter formatter = new OutputFormatter(
          OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

      command.getHandler().execute(
          org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper(), formatter);
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject data = parseJson(json).getAsJsonObject("data");
      Assert.assertEquals("dry-run", data.get("mode").getAsString());
      Assert.assertNotNull("dry-run must include ledger_files field",
          data.getAsJsonArray("ledger_files"));
      Assert.assertNotNull("dry-run must include config_files field",
          data.getAsJsonArray("config_files"));
      // .active-wallet was created above, so config_files should list it
      Assert.assertTrue(data.getAsJsonArray("config_files").size() > 0);
    } finally {
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void updateAccountUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    TransactionCommands.register(registry);
    CommandDefinition command = registry.lookup("update-account");
    ParsedOptions opts = command.parseArgs(new String[]{"--name", "qa-test"});
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void updateAccountForCli(byte[] ownerAddress, byte[] accountNameBytes, boolean multi) {
        Assert.assertEquals("qa-test", new String(accountNameBytes, StandardCharsets.UTF_8));
        Assert.assertFalse(multi);
      }

      @Override
      public boolean updateAccount(byte[] ownerAddress, byte[] accountNameBytes, boolean multi) {
        Assert.fail("legacy updateAccount() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("Update Account successful !!"));
  }

  @Test
  public void updateSettingUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("update-setting");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--consume-user-resource-percent", "0"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void updateSettingForCli(byte[] ownerAddress, byte[] contractAddress,
          long consumeUserResourcePercent, boolean multi) {
        Assert.assertEquals(0L, consumeUserResourcePercent);
        Assert.assertFalse(multi);
      }

      @Override
      public boolean updateSetting(byte[] ownerAddress, byte[] contractAddress,
          long consumeUserResourcePercent, boolean multi) {
        Assert.fail("legacy updateSetting() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("UpdateSetting successful !!"));
  }

  @Test
  public void deployContractUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("deploy-contract");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--name", "TestContract",
        "--abi", "[]",
        "--bytecode", "6080",
        "--fee-limit", "1000000"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public String deployContractForCli(byte[] ownerAddress, String name, String abiStr,
          String codeStr, long feeLimit, long value, long consumeUserResourcePercent,
          long originEnergyLimit, long tokenValue, String tokenId, String libraryAddressPair,
          String compilerVersion, boolean multi) {
        Assert.assertEquals("TestContract", name);
        Assert.assertEquals("[]", abiStr);
        Assert.assertEquals("6080", codeStr);
        Assert.assertEquals(1000000L, feeLimit);
        Assert.assertFalse(multi);
        return "TFakeContractAddress";
      }

      @Override
      public boolean deployContract(byte[] ownerAddress, String name, String abiStr, String codeStr,
          long feeLimit, long value, long consumeUserResourcePercent, long originEnergyLimit,
          long tokenValue, String tokenId, String libraryAddressPair, String compilerVersion,
          boolean multi) {
        Assert.fail("legacy deployContract() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("DeployContract successful !!"));
  }

  @Test
  public void deployContractRejectsInvalidUsageBeforeExecution() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("deploy-contract");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--name", "TestContract",
        "--abi", "[]",
        "--bytecode", "6080",
        "--fee-limit", "1000000",
        "--consume-user-resource-percent", "101"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
        @Override
        public String deployContractForCli(byte[] ownerAddress, String name, String abiStr,
            String codeStr, long feeLimit, long value, long consumeUserResourcePercent,
            long originEnergyLimit, long tokenValue, String tokenId, String libraryAddressPair,
            String compilerVersion, boolean multi) {
          Assert.fail("deployContractForCli should not run for invalid usage");
          return null;
        }
      }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("consume-user-resource-percent should be between 0 and 100"));
  }

  @Test
  public void freezeBalanceUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    StakingCommands.register(registry);
    CommandDefinition command = registry.lookup("freeze-balance");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--amount", "1000000",
        "--duration", "3"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void freezeBalanceForCli(byte[] ownerAddress, long frozenBalance, long frozenDuration,
          int resourceCode, byte[] receiverAddress, boolean multi) {
        Assert.assertEquals(1000000L, frozenBalance);
        Assert.assertEquals(3L, frozenDuration);
        Assert.assertEquals(0, resourceCode);
        Assert.assertNull(receiverAddress);
        Assert.assertFalse(multi);
      }

      @Override
      public boolean freezeBalance(byte[] ownerAddress, long frozenBalance, long frozenDuration,
          int resourceCode, byte[] receiverAddress, boolean multi) {
        Assert.fail("legacy freezeBalance() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("FreezeBalance successful !!"));
  }

  @Test
  public void estimateEnergyFailureUsesStructuredErrorEnvelope() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("estimate-energy");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--owner", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "balanceOf(address)"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
        @Override
        public Response.EstimateEnergyMessage estimateEnergyMessage(
            byte[] ownerAddress,
            byte[] contractAddress,
            long callValue,
            byte[] data,
            long tokenValue,
            String tokenId) {
          Response.EstimateEnergyMessage.Builder builder = Response.EstimateEnergyMessage.newBuilder();
          builder.getResultBuilder()
              .setResult(false)
              .setMessage(com.google.protobuf.ByteString.copyFromUtf8("estimate failed"));
          return builder.build();
        }
      }, formatter);
      Assert.fail("Expected formatter to abort after structured error emission");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("query_failed", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("estimate failed"));
  }

  @Test
  public void freezeBalanceV2UsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    StakingCommands.register(registry);
    CommandDefinition command = registry.lookup("freeze-balance-v2");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--amount", "1000000",
        "--resource", "1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void freezeBalanceV2ForCli(byte[] ownerAddress, long frozenBalance,
          int resourceCode, boolean multi) {
        Assert.assertNull(ownerAddress);
        Assert.assertEquals(1000000L, frozenBalance);
        Assert.assertEquals(1, resourceCode);
        Assert.assertFalse(multi);
      }

      @Override
      public boolean freezeBalanceV2(byte[] ownerAddress, long frozenBalance,
          int resourceCode, boolean multi) {
        Assert.fail("legacy freezeBalanceV2() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("FreezeBalanceV2 successful !!"));
  }

  @Test
  public void unfreezeBalanceV2UsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    StakingCommands.register(registry);
    CommandDefinition command = registry.lookup("unfreeze-balance-v2");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--amount", "1000000",
        "--resource", "1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void unfreezeBalanceV2ForCli(byte[] ownerAddress, long unfreezeBalance,
          int resourceCode, boolean multi) {
        Assert.assertNull(ownerAddress);
        Assert.assertEquals(1000000L, unfreezeBalance);
        Assert.assertEquals(1, resourceCode);
        Assert.assertFalse(multi);
      }

      @Override
      public boolean unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance,
          int resourceCode, boolean multi) {
        Assert.fail("legacy unfreezeBalanceV2() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertTrue(json.contains("UnfreezeBalanceV2 successful !!"));
  }

  @Test
  public void retiredCommandsAreNotRegisteredInStandardCli() {
    CommandRegistry walletRegistry = new CommandRegistry();
    WalletCommands.register(walletRegistry);
    Assert.assertNull(walletRegistry.lookup("import-wallet"));
    Assert.assertNull(walletRegistry.lookup("importwallet"));
    Assert.assertNull(walletRegistry.lookup("import-wallet-by-mnemonic"));
    Assert.assertNull(walletRegistry.lookup("importwalletbymnemonic"));
    Assert.assertNull(walletRegistry.lookup("change-password"));
    Assert.assertNull(walletRegistry.lookup("changepassword"));
    Assert.assertNull(walletRegistry.lookup("lock"));
    Assert.assertNull(walletRegistry.lookup("unlock"));

    CommandRegistry miscRegistry = new CommandRegistry();
    MiscCommands.register(miscRegistry);
    Assert.assertNull(miscRegistry.lookup("get-private-key-by-mnemonic"));
    Assert.assertNull(miscRegistry.lookup("getprivatekeybymnemonic"));
    Assert.assertNull(miscRegistry.lookup("encoding-converter"));
    Assert.assertNull(miscRegistry.lookup("encodingconverter"));
    Assert.assertNull(miscRegistry.lookup("address-book"));
    Assert.assertNull(miscRegistry.lookup("addressbook"));
    Assert.assertNull(miscRegistry.lookup("view-transaction-history"));
    Assert.assertNull(miscRegistry.lookup("viewtransactionhistory"));
    Assert.assertNull(miscRegistry.lookup("view-backup-records"));
    Assert.assertNull(miscRegistry.lookup("viewbackuprecords"));

    CommandRegistry transactionRegistry = new CommandRegistry();
    TransactionCommands.register(transactionRegistry);
    Assert.assertNull(transactionRegistry.lookup("add-transaction-sign"));
    Assert.assertNull(transactionRegistry.lookup("addtransactionsign"));
    Assert.assertNull(transactionRegistry.lookup("tronlink-multi-sign"));
    Assert.assertNull(transactionRegistry.lookup("tronlinkmultisign"));
  }

  @Test
  public void registerWalletRequiresName() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("register-wallet");

    try {
      command.parseArgs(new String[]{"--words", "12"});
      Assert.fail("Expected missing --name usage error");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Missing required option(s): --name", e.getMessage());
    }
  }

  @Test
  public void registerWalletForCliDoesNotPrintMnemonicPromptText() throws Exception {
    System.setProperty("user.dir", tempFolder.getRoot().getAbsolutePath());
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    char[] password = "TempPass123!A".toCharArray();
    WalletApiWrapper.CliWalletCreationResult result = null;
    try {
      System.setOut(new PrintStream(stdout));
      result = new WalletApiWrapper().registerWalletForCli(password, 12, "qa");

      Assert.assertNotNull(result.getKeystoreName());
      Assert.assertNotNull(result.getMnemonicKeystoreName());
      Assert.assertEquals("qa", result.getWalletName());
      Assert.assertTrue(new File("Wallet", result.getKeystoreName()).isFile());
      Assert.assertTrue(new File("Mnemonic", result.getMnemonicKeystoreName()).isFile());
      String text = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertFalse(text.contains("Please name your wallet"));
      Assert.assertFalse(text.contains("mnemonic file :"));
    } finally {
      System.setOut(originalOut);
      deleteCreatedWalletFiles(result);
      org.tron.keystore.StringUtils.clear(password);
    }
  }

  @Test
  public void registerWalletForCliRejectsInvalidWords() throws Exception {
    char[] password = "TempPass123!A".toCharArray();
    try {
      new WalletApiWrapper().registerWalletForCli(password, 13, "qa");
      Assert.fail("Expected invalid word count to be rejected");
    } catch (org.tron.walletcli.cli.CommandErrorException e) {
      Assert.assertEquals("usage_error", e.getCode());
      Assert.assertTrue(e.getMessage().contains("--words must be 12 or 24"));
    } finally {
      org.tron.keystore.StringUtils.clear(password);
    }
  }

  @Test
  public void generateSubAccountRequiresParametersAndUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("generate-sub-account");

    try {
      command.parseArgs(new String[]{"--index", "1"});
      Assert.fail("Expected missing --name usage error");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Missing required option(s): --name", e.getMessage());
    }

    ParsedOptions opts = command.parseArgs(new String[]{"--index", "1", "--name", "sub"});
    AtomicBoolean cliSafeCalled = new AtomicBoolean(false);
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public CliWalletCreationResult generateSubAccountForCli(int index, String walletName) {
        cliSafeCalled.set(true);
        Assert.assertEquals(1, index);
        Assert.assertEquals("sub", walletName);
        return new CliWalletCreationResult("TSUB.json", "TSUB.json", "TSUB", "sub",
            "m/44'/195'/0'/0/1");
      }

      @Override
      public void generateSubAccountOrThrow() {
        Assert.fail("legacy generateSubAccountOrThrow() should not be used by standard CLI");
      }
    }, formatter);
    formatter.flush();

    Assert.assertTrue(cliSafeCalled.get());
    String json = stdout.toString(StandardCharsets.UTF_8.name());
    JsonObject data = parseJson(json).getAsJsonObject("data");
    Assert.assertTrue(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("sub", data.get("wallet_name").getAsString());
    Assert.assertEquals("m/44'/195'/0'/0/1", data.get("path").getAsString());
  }

  @Test
  public void generateSubAccountForCliIsNonInteractiveAndRejectsDuplicateIndex() throws Exception {
    System.setProperty("user.dir", tempFolder.getRoot().getAbsolutePath());
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    char[] passwordChars = "TempPass123!A".toCharArray();
    byte[] passwordBytes = "TempPass123!A".getBytes(StandardCharsets.UTF_8);
    WalletApiWrapper.CliWalletCreationResult parent = null;
    WalletApiWrapper.CliWalletCreationResult subAccount = null;
    try {
      System.setOut(new PrintStream(stdout));
      WalletApiWrapper wrapper = new WalletApiWrapper();
      parent = wrapper.registerWalletForCli(passwordChars, 12, "qa");
      File walletFile = new File("Wallet", parent.getKeystoreName());
      WalletFile wf = WalletUtils.loadWalletFile(walletFile);
      wf.setSourceFile(walletFile);
      WalletApi walletApi = new WalletApi(wf);
      walletApi.setLogin(null);
      walletApi.setUnifiedPassword(Arrays.copyOf(passwordBytes, passwordBytes.length));
      wrapper.setWallet(walletApi);

      subAccount = wrapper.generateSubAccountForCli(1, "sub");

      Assert.assertEquals("sub", subAccount.getWalletName());
      Assert.assertEquals("m/44'/195'/0'/0/1", subAccount.getPath());
      Assert.assertTrue(new File("Wallet", subAccount.getKeystoreName()).isFile());
      Assert.assertTrue(new File("Mnemonic", subAccount.getMnemonicKeystoreName()).isFile());

      try {
        wrapper.generateSubAccountForCli(1, "dupe");
        Assert.fail("Expected duplicate sub-account path to be rejected");
      } catch (org.tron.walletcli.cli.CommandErrorException e) {
        Assert.assertEquals("already_exists", e.getCode());
      }

      String text = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertFalse(text.contains("Enter your choice"));
      Assert.assertFalse(text.contains("Please name your wallet"));
      Assert.assertFalse(text.contains("mnemonic file :"));
    } finally {
      System.setOut(originalOut);
      deleteCreatedWalletFiles(subAccount);
      deleteCreatedWalletFiles(parent);
      org.tron.keystore.StringUtils.clear(passwordChars);
      org.tron.keystore.StringUtils.clear(passwordBytes);
    }
  }

  @Test
  public void generateSubAccountForCliRejectsOutOfRangeIndexBeforeAuth() throws Exception {
    try {
      new WalletApiWrapper().generateSubAccountForCli(100, "sub");
      Assert.fail("Expected invalid sub-account index to be rejected");
    } catch (org.tron.walletcli.cli.CommandErrorException e) {
      Assert.assertEquals("usage_error", e.getCode());
      Assert.assertTrue(e.getMessage().contains("--index must be between 0 and 99"));
    }
  }

  // ── M1: update-energy-limit rejects zero origin-energy-limit ────────────────

  @Test
  public void updateEnergyLimitRejectsZeroOriginEnergyLimit() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("update-energy-limit");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--origin-energy-limit", "0"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public void updateEnergyLimitForCli(byte[] ownerAddress, byte[] contractAddress,
                long originEnergyLimit, boolean multi) {
              Assert.fail("updateEnergyLimitForCli should not run for invalid usage");
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("origin-energy-limit must be a positive integer"));
  }

  // ── M2a: deploy-contract rejects negative value ──────────────────────────

  @Test
  public void deployContractRejectsNegativeValue() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("deploy-contract");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--name", "TestContract",
        "--abi", "[]",
        "--bytecode", "6080",
        "--fee-limit", "1000000",
        "--value", "-1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public String deployContractForCli(byte[] ownerAddress, String name, String abiStr,
                String codeStr, long feeLimit, long value, long consumeUserResourcePercent,
                long originEnergyLimit, long tokenValue, String tokenId,
                String libraryAddressPair, String compilerVersion, boolean multi) {
              Assert.fail("deployContractForCli should not run for invalid usage");
              return null;
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("value must not be negative"));
  }

  // ── M2b: trigger-contract rejects negative token-value ───────────────────

  @Test
  public void triggerContractRejectsNegativeTokenValue() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ContractCommands.register(registry);
    CommandDefinition command = registry.lookup("trigger-contract");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--contract", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--method", "transfer(address,uint256)",
        "--fee-limit", "1000000",
        "--token-value", "-1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public Triple<Boolean, Long, Long> callContractForCli(
                byte[] ownerAddress, byte[] contractAddress, long callValue, byte[] data,
                long feeLimit, long tokenValue, String tokenId,
                boolean isConstant, boolean display, boolean multi) {
              Assert.fail("callContractForCli should not run for invalid usage");
              return Triple.of(false, 0L, 0L);
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("token-value must not be negative"));
  }

  // ── M3: freeze-balance rejects zero duration ─────────────────────────────

  @Test
  public void freezeBalanceRejectsZeroDuration() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    StakingCommands.register(registry);
    CommandDefinition command = registry.lookup("freeze-balance");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--amount", "1000000",
        "--duration", "0"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public void freezeBalanceForCli(byte[] ownerAddress, long frozenBalance,
                long frozenDuration, int resourceCode, byte[] receiverAddress, boolean multi) {
              Assert.fail("freezeBalanceForCli should not run for invalid usage");
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("duration must be a positive integer"));
  }

  // ── M4: delegate-resource rejects negative lock-period ───────────────────

  @Test
  public void delegateResourceRejectsNegativeLockPeriod() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    StakingCommands.register(registry);
    CommandDefinition command = registry.lookup("delegate-resource");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--amount", "1000000",
        "--resource", "0",
        "--receiver", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--lock-period", "-1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public void delegateResourceForCli(byte[] ownerAddress, long amount,
                int resourceCode, byte[] receiverAddress,
                boolean lock, long lockPeriod, boolean multi) {
              Assert.fail("delegateResourceForCli should not run for invalid usage");
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("lock-period must not be negative"));
  }

  // ── M5a: approve-proposal rejects zero id ────────────────────────────────

  @Test
  public void approveProposalRejectsZeroId() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ProposalCommands.register(registry);
    CommandDefinition command = registry.lookup("approve-proposal");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--id", "0",
        "--approve"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public void approveProposalForCli(byte[] ownerAddress, long id,
                boolean isAddApproval, boolean multi) {
              Assert.fail("approveProposalForCli should not run for invalid usage");
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("id must be a positive integer"));
  }

  // ── M5b: delete-proposal rejects negative id ─────────────────────────────

  @Test
  public void deleteProposalRejectsNegativeId() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    ProposalCommands.register(registry);
    CommandDefinition command = registry.lookup("delete-proposal");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--id", "-1"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper() {
            @Override
            public void deleteProposalForCli(byte[] ownerAddress, long id, boolean multi) {
              Assert.fail("deleteProposalForCli should not run for invalid usage");
            }
          }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("id must be a positive integer"));
  }

  // ── M6: get-can-delegated-max-size rejects invalid resource type ──────────

  @Test
  public void getCanDelegatedMaxSizeRejectsInvalidResourceType() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    QueryCommands.register(registry);
    CommandDefinition command = registry.lookup("get-can-delegated-max-size");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--owner", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
        "--type", "2"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    try {
      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts,
          new WalletApiWrapper(), formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertFalse(parseJson(json).get("success").getAsBoolean());
    Assert.assertEquals("usage_error", parseJson(json).get("error").getAsString());
    Assert.assertTrue(json.contains("type must be 0 (BANDWIDTH) or 1 (ENERGY)"));
  }

  private static void deleteCreatedWalletFiles(WalletApiWrapper.CliWalletCreationResult result) {
    if (result == null) {
      return;
    }
    if (result.getKeystoreName() != null) {
      new File("Wallet", result.getKeystoreName()).delete();
    }
    if (result.getMnemonicKeystoreName() != null) {
      new File("Mnemonic", result.getMnemonicKeystoreName()).delete();
    }
  }
}
