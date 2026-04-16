package org.tron.walletcli.cli.commands;

import org.apache.commons.lang3.tuple.Triple;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.enums.NetType;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.TransactionUtils;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletserver.WalletApi;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

public class TransactionCommands {

    public static void register(CommandRegistry registry) {
        registerSendCoin(registry);
        registerTransferAsset(registry);
        registerTransferUsdt(registry);
        registerParticipateAssetIssue(registry);
        registerAssetIssue(registry);
        registerCreateAccount(registry);
        registerUpdateAccount(registry);
        registerSetAccountId(registry);
        registerUpdateAsset(registry);
        registerBroadcastTransaction(registry);
        registerUpdateAccountPermission(registry);
        registerGasFreeTransfer(registry);
    }

    private static void registerSendCoin(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("send-coin")
                .aliases("sendcoin")
                .description("Send TRX to an address")
                .option("to", "Recipient address", true)
                .option("amount", "Amount in SUN", true, OptionDef.Type.LONG)
                .option("owner", "Sender address (default: current wallet)", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] to = opts.getAddress("to");
                    long amount = opts.getLong("amount");
                    CommandSupport.requirePositive(out, "amount", amount);
                    int permissionId = opts.has("permission-id") ? opts.getInt("permission-id") : 0;
                    boolean multi = opts.getBoolean("multi");
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    try {
                        wrapper.sendCoinForCli(owner, to, amount, multi);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    String toStr = opts.getString("to");
                    if (multi) {
                        CommandSupport.emitSuccess(out,
                                "create multi-sign transaction successful !!",
                                CommandSupport.lastBroadcastTxResultData());
                    } else {
                        Map<String, Object> json = CommandSupport.lastBroadcastTxResultData();
                        json.put("to", toStr);
                        json.put("amount", amount);
                        CommandSupport.emitSuccess(out, "SendCoin successful !!", json);
                    }
                })
                .build());
    }

    private static void registerTransferAsset(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("transfer-asset")
                .aliases("transferasset")
                .description("Transfer a TRC10 asset")
                .option("to", "Recipient address", true)
                .option("asset", "Asset name", true)
                .option("amount", "Amount", true, OptionDef.Type.LONG)
                .option("owner", "Sender address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] to = opts.getAddress("to");
                    String asset = opts.getString("asset");
                    long amount = opts.getLong("amount");
                    CommandSupport.requirePositive(out, "amount", amount);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.transferAssetForCli(owner, to, asset, amount, multi);
                    CommandSupport.emitSuccess(out,
                            "TransferAsset successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerTransferUsdt(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("transfer-usdt")
                .aliases("transferusdt")
                .description("Transfer USDT (TRC20)")
                .option("to", "Recipient address", true)
                .option("amount", "Amount in smallest unit", true, OptionDef.Type.LONG)
                .option("owner", "Sender address", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    NetType netType = WalletApi.getCurrentNetwork();
                    if (netType.getUsdtAddress() == null) {
                        out.error("unsupported_network",
                                "transfer-usdt does not support the current network.");
                        return;
                    }
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] toAddress = opts.getAddress("to");
                    long amount = opts.getLong("amount");
                    CommandSupport.requirePositive(out, "amount", amount);
                    int permissionId = opts.has("permission-id") ? opts.getInt("permission-id") : 0;
                    boolean multi = opts.getBoolean("multi");

                    String toBase58 = WalletApi.encode58Check(toAddress);
                    String inputStr = String.format("\"%s\",%d", toBase58, amount);
                    String methodStr = "transfer(address,uint256)";
                    byte[] data = Hex.decode(AbiUtil.parseMethod(methodStr, inputStr, false));
                    byte[] contractAddress = WalletApi.decodeFromBase58Check(netType.getUsdtAddress());

                    // Estimate energy to calculate fee limit
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    Triple<Boolean, Long, Long> estimate;
                    try {
                        estimate = wrapper.callContractForCli(
                                owner, contractAddress, 0, data, 0, 0, "", true, true, false);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    if (!Boolean.TRUE.equals(estimate.getLeft())) {
                        out.error("execution_error", "TransferUSDT failed: energy estimation failed.");
                        return;
                    }
                    long energyUsed = estimate.getMiddle();
                    // Get energy price from chain parameters and add 20% buffer
                    java.util.OptionalLong energyFeeOpt = wrapper.getChainParametersForCli()
                            .getChainParameterList().stream()
                            .filter(p -> "getEnergyFee".equals(p.getKey()))
                            .mapToLong(org.tron.trident.proto.Response.ChainParameters.ChainParameter::getValue)
                            .findFirst();
                    if (!energyFeeOpt.isPresent()) {
                        out.error("chain_parameter_error",
                                "Unable to determine energy price from chain parameters.");
                        return;
                    }
                    long energyFee = energyFeeOpt.getAsLong();
                    long feeLimit;
                    try {
                        feeLimit = WalletApiWrapper.computeBufferedFeeLimit(energyFee, energyUsed);
                    } catch (ArithmeticException e) {
                        out.error("fee_limit_overflow",
                                "Estimated fee limit exceeds supported range.");
                        return;
                    }

                    TransactionUtils.setPermissionIdOverride(permissionId);
                    boolean result;
                    try {
                        result = wrapper.callContractForCli(
                                owner, contractAddress, 0, data, feeLimit, 0, "", false, false, multi)
                                .getLeft();
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    CommandSupport.emitBooleanResult(out, result,
                            "TransferUSDT successful !!",
                            "TransferUSDT failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerParticipateAssetIssue(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("participate-asset-issue")
                .aliases("participateassetissue")
                .description("Participate in an asset issue")
                .option("to", "Asset issuer address", true)
                .option("asset", "Asset name", true)
                .option("amount", "Amount", true, OptionDef.Type.LONG)
                .option("owner", "Participant address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] to = opts.getAddress("to");
                    String asset = opts.getString("asset");
                    long amount = opts.getLong("amount");
                    CommandSupport.requirePositive(out, "amount", amount);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.participateAssetIssueForCli(owner, to, asset, amount, multi);
                    CommandSupport.emitSuccess(out,
                            "ParticipateAssetIssue successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerAssetIssue(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("asset-issue")
                .aliases("assetissue")
                .description("Create a TRC10 asset")
                .option("name", "Asset name", true)
                .option("abbr", "Asset abbreviation", true)
                .option("total-supply", "Total supply", true, OptionDef.Type.LONG)
                .option("trx-num", "TRX number", true, OptionDef.Type.LONG)
                .option("ico-num", "ICO number", true, OptionDef.Type.LONG)
                .option("start-time", "ICO start time (ms)", true, OptionDef.Type.LONG)
                .option("end-time", "ICO end time (ms)", true, OptionDef.Type.LONG)
                .option("precision", "Precision (default: 0)", false, OptionDef.Type.LONG)
                .option("description", "Description", false)
                .option("url", "URL", true)
                .option("free-net-limit", "Free net limit per account", true, OptionDef.Type.LONG)
                .option("public-free-net-limit", "Public free net limit", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String name = opts.getString("name");
                    String abbr = opts.getString("abbr");
                    long totalSupply = opts.getLong("total-supply");
                    int trxNum = opts.getInt("trx-num");
                    int icoNum = opts.getInt("ico-num");
                    int precision = opts.has("precision") ? opts.getInt("precision") : 0;
                    long startTime = opts.getLong("start-time");
                    long endTime = opts.getLong("end-time");
                    String desc = opts.has("description") ? opts.getString("description") : "";
                    String url = opts.getString("url");
                    long freeNetLimit = opts.getLong("free-net-limit");
                    long publicFreeNetLimit = opts.getLong("public-free-net-limit");
                    boolean multi = opts.getBoolean("multi");

                    // Pre-validation: catch domain errors before calling legacy wrapper
                    // to prevent System.out.println pollution in JSON mode
                    CommandSupport.requirePositive(out, "total-supply", totalSupply);
                    CommandSupport.requirePositive(out, "trx-num", trxNum);
                    CommandSupport.requirePositive(out, "ico-num", icoNum);
                    if (precision < 0) {
                        out.usageError("precision must be >= 0, got: " + precision, null);
                    }
                    if (startTime <= System.currentTimeMillis()) {
                        out.usageError("start-time must be in the future", null);
                    }
                    if (endTime <= startTime) {
                        out.usageError("end-time must be after start-time", null);
                    }
                    if (freeNetLimit < 0) {
                        out.usageError("free-net-limit must be >= 0, got: " + freeNetLimit, null);
                    }
                    if (publicFreeNetLimit < 0) {
                        out.usageError("public-free-net-limit must be >= 0, got: " + publicFreeNetLimit, null);
                    }

                    HashMap<String, String> frozenSupply = new HashMap<String, String>();
                    wrapper.assetIssueForCli(owner, name, abbr, totalSupply,
                            trxNum, icoNum, precision, startTime, endTime, desc, url,
                            freeNetLimit, publicFreeNetLimit, frozenSupply, multi);
                    CommandSupport.emitSuccess(out,
                            "AssetIssue successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerCreateAccount(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("create-account")
                .aliases("createaccount")
                .description("Create a new account on chain")
                .option("address", "New account address", true)
                .option("owner", "Creator address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] address = opts.getAddress("address");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.createAccountForCli(owner, address, multi);
                    CommandSupport.emitSuccess(out,
                            "CreateAccount successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUpdateAccount(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("update-account")
                .aliases("updateaccount")
                .description("Update account name")
                .option("name", "Account name", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] nameBytes = opts.getString("name").getBytes();
                    boolean multi = opts.getBoolean("multi");
                    wrapper.updateAccountForCli(owner, nameBytes, multi);
                    CommandSupport.emitSuccess(out,
                            "Update Account successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerSetAccountId(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("set-account-id")
                .aliases("setaccountid")
                .description("Set account ID")
                .option("id", "Account ID", true)
                .option("owner", "Owner address", false)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] id = opts.getString("id").getBytes();
                    wrapper.setAccountIdForCli(owner, id);
                    CommandSupport.emitSuccess(out,
                            "Set AccountId successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUpdateAsset(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("update-asset")
                .aliases("updateasset")
                .description("Update asset parameters")
                .option("description", "New description", true)
                .option("url", "New URL", true)
                .option("new-limit", "New free net limit", true, OptionDef.Type.LONG)
                .option("new-public-limit", "New public free net limit", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] desc = opts.getString("description").getBytes();
                    byte[] url = opts.getString("url").getBytes();
                    long newLimit = opts.getLong("new-limit");
                    long newPublicLimit = opts.getLong("new-public-limit");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.updateAssetForCli(owner, desc, url, newLimit, newPublicLimit, multi);
                    CommandSupport.emitSuccess(out,
                            "UpdateAsset successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerBroadcastTransaction(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.NEVER)
                .name("broadcast-transaction")
                .aliases("broadcasttransaction")
                .description("Broadcast a signed transaction")
                .option("transaction", "Transaction hex string", true)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] txBytes = CommandSupport.requireHex(out, "transaction", opts.getString("transaction"));
                    boolean result = org.tron.walletserver.WalletApi.broadcastTransaction(txBytes);
                    CommandSupport.emitBooleanResult(out, result,
                            "BroadcastTransaction successful !!",
                            "BroadcastTransaction failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUpdateAccountPermission(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("update-account-permission")
                .aliases("updateaccountpermission")
                .description("Update account permissions (multi-sign setup)")
                .option("owner", "Owner address", true)
                .option("permissions", "Permissions JSON string", true)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.getAddress("owner");
                    String permissions = opts.getString("permissions");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.accountPermissionUpdateForCli(owner, permissions, multi);
                    CommandSupport.emitSuccess(out,
                            "UpdateAccountPermission successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerGasFreeTransfer(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("gas-free-transfer")
                .aliases("gasfreetransfer")
                .description("Transfer tokens via GasFree service")
                .option("to", "Recipient address", true)
                .option("amount", "Amount", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    String to = opts.getString("to");
                    long amount = opts.getLong("amount");
                    CommandSupport.requirePositive(out, "amount", amount);
                    String gasFreeId = wrapper.gasFreeTransferOrThrow(to, amount);
                    Map<String, Object> data = new LinkedHashMap<String, Object>();
                    data.put("message", "GasFreeTransfer successful !!");
                    if (gasFreeId != null && !"-".equals(gasFreeId)) {
                        data.put("gas_free_id", gasFreeId);
                    }
                    out.success("GasFreeTransfer successful !!", data);
                })
                .build());
    }
}
