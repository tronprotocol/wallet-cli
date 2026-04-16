package org.tron.walletcli.cli.commands;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.apache.commons.lang3.tuple.Triple;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.enums.NetType;
import org.tron.common.utils.ByteArray;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Response;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.ParsedOptions;
import org.tron.walletserver.ApiClient;
import org.tron.walletserver.WalletApi;

public class TransactionCommandsTest {

  private static class StubApiClient extends ApiClient {
    private boolean broadcastResult;

    StubApiClient() {
      super(NetType.NILE);
    }

    @Override
    public boolean broadcastTransaction(Chain.Transaction signaturedTransaction) {
      return broadcastResult;
    }

    @Override
    public String broadcastTransactionForCli(Chain.Transaction signaturedTransaction) {
      return broadcastResult ? null : "broadcast failed";
    }
  }

  @Test
  public void transferUsdtFailsFastWhenEnergyEstimationFails() throws Exception {
    NetType originalNetwork = WalletApi.getCurrentNetwork();
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    WalletApi.setCurrentNetwork(NetType.NILE);
    System.setOut(new PrintStream(stdout));

    try {
      CommandRegistry registry = new CommandRegistry();
      TransactionCommands.register(registry);
      CommandDefinition command = registry.lookup("transfer-usdt");
      ParsedOptions opts = command.parseArgs(new String[]{
          "--to", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
          "--amount", "1"
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      try {
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
            if (!isConstant) {
              Assert.fail("broadcast path should not run after estimation failure");
            }
            return Triple.of(false, 0L, 0L);
          }
  
          @Override
          public Response.ChainParameters getChainParametersForCli() {
            Assert.fail("fee calculation should not run after estimation failure");
            return null;
          }
        }, formatter);
      } catch (RuntimeException e) {
        Assert.assertTrue(formatter.hasOutcome());
      }
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject root = JsonParser.parseString(json).getAsJsonObject();
      Assert.assertFalse(root.get("success").getAsBoolean());
      Assert.assertEquals("execution_error", root.get("error").getAsString());
      Assert.assertTrue(json.contains("TransferUSDT failed: energy estimation failed."));
    } finally {
      WalletApi.setCurrentNetwork(originalNetwork);
      System.setOut(originalOut);
    }
  }

  @Test
  public void broadcastTransactionRejectsInvalidHexWithUsageError() throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));

    try {
      CommandRegistry registry = new CommandRegistry();
      TransactionCommands.register(registry);
      CommandDefinition command = registry.lookup("broadcast-transaction");
      ParsedOptions opts = command.parseArgs(new String[]{"--transaction", "not-valid-hex!!"});
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      try {
        command.getHandler().execute(
            org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper(), formatter);
        Assert.fail("Expected abort on invalid hex");
      } catch (RuntimeException e) {
        // CliAbortException expected
      }
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject root = JsonParser.parseString(json).getAsJsonObject();
      Assert.assertFalse(root.get("success").getAsBoolean());
      Assert.assertEquals("usage_error", root.get("error").getAsString());
      Assert.assertTrue(root.get("message").getAsString().contains("Invalid hex value"));
    } finally {
      System.setOut(originalOut);
    }
  }

  @Test
  public void broadcastTransactionIncludesTxidInJsonOutput() throws Exception {
    ApiClient originalApiCli = WalletApi.getApiCli();
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    StubApiClient stub = new StubApiClient();
    stub.broadcastResult = true;
    WalletApi.setApiCli(stub);
    System.setOut(new PrintStream(stdout));

    try {
      CommandRegistry registry = new CommandRegistry();
      TransactionCommands.register(registry);
      CommandDefinition command = registry.lookup("broadcast-transaction");
      Chain.Transaction tx = Chain.Transaction.newBuilder()
          .setRawData(Chain.Transaction.raw.newBuilder().setFeeLimit(1L).build())
          .build();
      String expectedTxid = ByteArray.toHexString(Sha256Sm3Hash.hash(tx.getRawData().toByteArray()));
      ParsedOptions opts = command.parseArgs(new String[]{
          "--transaction", ByteArray.toHexString(tx.toByteArray())
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper(), formatter);
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject root = JsonParser.parseString(json).getAsJsonObject();
      Assert.assertTrue(root.get("success").getAsBoolean());
      Assert.assertEquals(expectedTxid, root.getAsJsonObject("data").get("txid").getAsString());
    } finally {
      WalletApi.setApiCli(originalApiCli);
      System.setOut(originalOut);
    }
  }

  @Test
  public void sendCoinUsesStableSuccessMessageInJsonOutput() throws Exception {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));

    try {
      CommandRegistry registry = new CommandRegistry();
      TransactionCommands.register(registry);
      CommandDefinition command = registry.lookup("send-coin");
      ParsedOptions opts = command.parseArgs(new String[]{
          "--to", "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
          "--amount", "1"
      });
      OutputFormatter formatter = new OutputFormatter(OutputFormatter.OutputMode.JSON, false);

      command.getHandler().execute(org.tron.walletcli.cli.CommandContext.empty(), opts, new WalletApiWrapper() {
        @Override
        public void sendCoinForCli(byte[] ownerAddress, byte[] toAddress, long amount, boolean multi) {
          Assert.assertNull(ownerAddress);
          Assert.assertEquals(1L, amount);
          Assert.assertFalse(multi);
        }
      }, formatter);
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      JsonObject root = JsonParser.parseString(json).getAsJsonObject();
      Assert.assertTrue(root.get("success").getAsBoolean());
      JsonObject data = root.getAsJsonObject("data");
      Assert.assertEquals("SendCoin successful !!", data.get("message").getAsString());
      Assert.assertEquals(1L, data.get("amount").getAsLong());
      Assert.assertTrue(json.contains("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"));
    } finally {
      System.setOut(originalOut);
    }
  }
}
