package org.tron.walletcli.cli.commands;

import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;

import java.nio.charset.StandardCharsets;

public class ExchangeCommands {

    public static void register(CommandRegistry registry) {
        registerExchangeCreate(registry);
        registerExchangeInject(registry);
        registerExchangeWithdraw(registry);
        registerMarketSellAsset(registry);
        registerMarketCancelOrder(registry);
    }

    private static void registerExchangeCreate(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("exchange-create")
                .aliases("exchangecreate")
                .description("Create a Bancor exchange pair")
                .option("first-token", "First token ID (use _ for TRX)", true)
                .option("first-balance", "First token balance", true, OptionDef.Type.LONG)
                .option("second-token", "Second token ID", true)
                .option("second-balance", "Second token balance", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] firstToken = opts.getString("first-token").getBytes(StandardCharsets.UTF_8);
                    long firstBalance = opts.getLong("first-balance");
                    CommandSupport.requirePositive(out, "first-balance", firstBalance);
                    byte[] secondToken = opts.getString("second-token").getBytes(StandardCharsets.UTF_8);
                    long secondBalance = opts.getLong("second-balance");
                    CommandSupport.requirePositive(out, "second-balance", secondBalance);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.exchangeCreateForCli(owner, firstToken, firstBalance,
                            secondToken, secondBalance, multi);
                    CommandSupport.emitSuccess(out,
                            "ExchangeCreate successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerExchangeInject(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("exchange-inject")
                .aliases("exchangeinject")
                .description("Inject tokens into an exchange")
                .option("exchange-id", "Exchange ID", true, OptionDef.Type.LONG)
                .option("token-id", "Token ID", true)
                .option("quant", "Token quantity", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long exchangeId = opts.getLong("exchange-id");
                    byte[] tokenId = opts.getString("token-id").getBytes(StandardCharsets.UTF_8);
                    long quant = opts.getLong("quant");
                    CommandSupport.requirePositive(out, "quant", quant);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.exchangeInjectForCli(owner, exchangeId, tokenId, quant, multi);
                    CommandSupport.emitSuccess(out,
                            "ExchangeInject successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerExchangeWithdraw(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("exchange-withdraw")
                .aliases("exchangewithdraw")
                .description("Withdraw tokens from an exchange")
                .option("exchange-id", "Exchange ID", true, OptionDef.Type.LONG)
                .option("token-id", "Token ID", true)
                .option("quant", "Token quantity", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long exchangeId = opts.getLong("exchange-id");
                    byte[] tokenId = opts.getString("token-id").getBytes(StandardCharsets.UTF_8);
                    long quant = opts.getLong("quant");
                    CommandSupport.requirePositive(out, "quant", quant);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.exchangeWithdrawForCli(owner, exchangeId, tokenId, quant, multi);
                    CommandSupport.emitSuccess(out,
                            "ExchangeWithdraw successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerMarketSellAsset(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("market-sell-asset")
                .aliases("marketsellasset")
                .description("Create a market sell order")
                .option("sell-token", "Token to sell", true)
                .option("sell-quantity", "Quantity to sell", true, OptionDef.Type.LONG)
                .option("buy-token", "Token to buy", true)
                .option("buy-quantity", "Expected buy quantity", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] sellToken = opts.getString("sell-token").getBytes(StandardCharsets.UTF_8);
                    long sellQuantity = opts.getLong("sell-quantity");
                    CommandSupport.requirePositive(out, "sell-quantity", sellQuantity);
                    byte[] buyToken = opts.getString("buy-token").getBytes(StandardCharsets.UTF_8);
                    long buyQuantity = opts.getLong("buy-quantity");
                    CommandSupport.requirePositive(out, "buy-quantity", buyQuantity);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.marketSellAssetForCli(owner, sellToken, sellQuantity,
                            buyToken, buyQuantity, multi);
                    CommandSupport.emitSuccess(out,
                            "MarketSellAsset successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerMarketCancelOrder(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("market-cancel-order")
                .aliases("marketcancelorder")
                .description("Cancel a market order")
                .option("order-id", "Order ID hex", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] orderId = CommandSupport.requireHex(out, "order-id", opts.getString("order-id"));
                    boolean multi = opts.getBoolean("multi");
                    wrapper.marketCancelOrderForCli(owner, orderId, multi);
                    CommandSupport.emitSuccess(out,
                            "MarketCancelOrder successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }
}
