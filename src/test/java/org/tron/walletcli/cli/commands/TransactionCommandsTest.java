package org.tron.walletcli.cli.commands;

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
        command.getHandler().execute(opts, new WalletApiWrapper() {
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
            if (!isConstant) {
              Assert.fail("broadcast path should not run after estimation failure");
            }
            return Triple.of(false, 0L, 0L);
          }
  
          @Override
          public Response.ChainParameters getChainParameters() {
            Assert.fail("fee calculation should not run after estimation failure");
            return null;
          }
        }, formatter);
      } catch (RuntimeException e) {
        Assert.assertTrue(formatter.hasOutcome());
      }
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": false"));
      Assert.assertTrue(json.contains("\"error\": \"execution_error\""));
      Assert.assertTrue(json.contains("TransferUSDT failed: energy estimation failed."));
    } finally {
      WalletApi.setCurrentNetwork(originalNetwork);
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

      command.getHandler().execute(opts, new WalletApiWrapper(), formatter);
      formatter.flush();

      String json = stdout.toString(StandardCharsets.UTF_8.name());
      Assert.assertTrue(json.contains("\"success\": true"));
      Assert.assertTrue(json.contains("\"txid\": \"" + expectedTxid + "\""));
    } finally {
      WalletApi.setApiCli(originalApiCli);
      System.setOut(originalOut);
    }
  }
}
