package org.tron.walletcli.cli.commands;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.After;
import org.apache.commons.lang3.tuple.Triple;
import org.junit.Assert;
import org.junit.Test;
import org.tron.trident.proto.Response;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.ParsedOptions;

public class StandardCliCommandRoutingTest {
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

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(json.contains("\"success\": true"));
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

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public Response.ChainParameters getChainParametersForCli() {
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

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("getEnergyFee"));
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
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("ClearWalletKeystore successful !!"));
    walletFile.delete();
  }

  @Test
  public void changePasswordUsesGlobalWalletOverrideAsExplicitTarget() throws Exception {
    File tempDir = Files.createTempDirectory("change-password-global-wallet").toFile();
    File externalDir = Files.createTempDirectory("change-password-global-wallet-file").toFile();
    File walletFile = new File(externalDir, "alpha.json");
    Assert.assertTrue(walletFile.createNewFile());
    System.setProperty("user.dir", tempDir.getAbsolutePath());

    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("change-password");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--old-password", "OldPass123!A",
        "--new-password", "NewPass123!B"
    });
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(
        new org.tron.walletcli.cli.CommandContext(walletFile.getAbsolutePath()),
        opts,
        new WalletApiWrapper() {
      @Override
      public boolean changePassword(char[] oldPassword, char[] newPassword, File targetWalletFile) {
        Assert.assertEquals(walletFile.getAbsolutePath(), targetWalletFile.getAbsolutePath());
        return true;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("ChangePassword successful !!"));
  }

  @Test
  public void changePasswordRejectsMixingGlobalWalletWithAddressOrName() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("change-password");
    ParsedOptions opts = command.parseArgs(new String[]{
        "--old-password", "OldPass123!A",
        "--new-password", "NewPass123!B",
        "--address", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"
    });
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(new ByteArrayOutputStream()), System.err);

    try {
      command.getHandler().execute(
          new org.tron.walletcli.cli.CommandContext("/tmp/example-wallet.json", null),
          opts,
          new WalletApiWrapper(),
          formatter);
      Assert.fail("Expected usage error for mixed wallet selectors");
    } catch (RuntimeException e) {
      Assert.assertEquals("CliAbortException", e.getClass().getSimpleName());
    }
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
    ParsedOptions opts = command.parseArgs(new String[]{"--force"});
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
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("ResetWallet successful !!"));
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
    Assert.assertTrue(json.contains("\"success\": true"));
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
    Assert.assertTrue(json.contains("\"success\": true"));
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
      public void deployContractForCli(byte[] ownerAddress, String name, String abiStr,
          String codeStr, long feeLimit, long value, long consumeUserResourcePercent,
          long originEnergyLimit, long tokenValue, String tokenId, String libraryAddressPair,
          String compilerVersion, boolean multi) {
        Assert.assertEquals("TestContract", name);
        Assert.assertEquals("[]", abiStr);
        Assert.assertEquals("6080", codeStr);
        Assert.assertEquals(1000000L, feeLimit);
        Assert.assertFalse(multi);
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
    Assert.assertTrue(json.contains("\"success\": true"));
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
        public void deployContractForCli(byte[] ownerAddress, String name, String abiStr,
            String codeStr, long feeLimit, long value, long consumeUserResourcePercent,
            long originEnergyLimit, long tokenValue, String tokenId, String libraryAddressPair,
            String compilerVersion, boolean multi) {
          Assert.fail("deployContractForCli should not run for invalid usage");
        }
      }, formatter);
      Assert.fail("Expected usage failure");
    } catch (RuntimeException e) {
      Assert.assertTrue(formatter.hasOutcome());
    }
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(json.contains("\"success\": false"));
    Assert.assertTrue(json.contains("\"error\": \"usage_error\""));
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
    Assert.assertTrue(json.contains("\"success\": true"));
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
    Assert.assertTrue(json.contains("\"success\": false"));
    Assert.assertTrue(json.contains("\"error\": \"query_failed\""));
    Assert.assertTrue(json.contains("estimate failed"));
  }

  @Test
  public void switchNetworkUsesCliSafeAdapter() throws Exception {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("switch-network");
    ParsedOptions opts = command.parseArgs(new String[]{"--network", "nile"});
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    OutputFormatter formatter = new OutputFormatter(
        OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);

    command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
      @Override
      public void switchNetworkForCli(String netWorkSymbol, String fullNode, String solidityNode) {
        Assert.assertEquals("nile", netWorkSymbol);
        Assert.assertNull(fullNode);
        Assert.assertNull(solidityNode);
      }

      @Override
      public boolean switchNetwork(String netWorkSymbol, String fulNode, String solidityNode) {
        Assert.fail("legacy switchNetwork() should not be used by standard CLI");
        return false;
      }
    }, formatter);
    formatter.flush();

    String json = stdout.toString(StandardCharsets.UTF_8.name());
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("SwitchNetwork successful !!"));
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
    Assert.assertTrue(json.contains("\"success\": true"));
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
    Assert.assertTrue(json.contains("\"success\": true"));
    Assert.assertTrue(json.contains("UnfreezeBalanceV2 successful !!"));
  }

  @Test
  public void importWalletRejectsLegacyPrivateKeyArgvOption() {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("import-wallet");

    try {
      command.parseArgs(new String[]{"--private-key", "abcd"});
      Assert.fail("Expected usage error for legacy argv secret option");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Unknown option: --private-key", e.getMessage());
    }
  }

  @Test
  public void importWalletByMnemonicRejectsLegacyMnemonicArgvOption() {
    CommandRegistry registry = new CommandRegistry();
    WalletCommands.register(registry);
    CommandDefinition command = registry.lookup("import-wallet-by-mnemonic");

    try {
      command.parseArgs(new String[]{"--mnemonic", "word1 word2"});
      Assert.fail("Expected usage error for legacy argv secret option");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Unknown option: --mnemonic", e.getMessage());
    }
  }

  @Test
  public void getPrivateKeyByMnemonicRejectsLegacyMnemonicArgvOption() {
    CommandRegistry registry = new CommandRegistry();
    MiscCommands.register(registry);
    CommandDefinition command = registry.lookup("get-private-key-by-mnemonic");

    try {
      command.parseArgs(new String[]{"--mnemonic", "word1 word2"});
      Assert.fail("Expected usage error for legacy argv secret option");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("Unknown option: --mnemonic", e.getMessage());
    }
  }
}
