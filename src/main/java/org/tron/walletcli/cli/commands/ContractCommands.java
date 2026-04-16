package org.tron.walletcli.cli.commands;

import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.trident.proto.Response;

public class ContractCommands {

    public static void register(CommandRegistry registry) {
        registerDeployContract(registry);
        registerTriggerContract(registry);
        registerTriggerConstantContract(registry);
        registerEstimateEnergy(registry);
        registerClearContractABI(registry);
        registerUpdateSetting(registry);
        registerUpdateEnergyLimit(registry);
    }

    private static void registerDeployContract(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("deploy-contract")
                .aliases("deploycontract")
                .description("Deploy a smart contract")
                .option("name", "Contract name", true)
                .option("abi", "Contract ABI JSON string", true)
                .option("bytecode", "Contract bytecode hex", true)
                .option("constructor", "Constructor signature (optional)", false)
                .option("params", "Constructor parameters (optional)", false)
                .option("fee-limit", "Fee limit in SUN", true, OptionDef.Type.LONG)
                .option("consume-user-resource-percent", "Consume user resource percent (0-100)", false, OptionDef.Type.LONG)
                .option("origin-energy-limit", "Origin energy limit", false, OptionDef.Type.LONG)
                .option("value", "Call value in SUN (default: 0)", false, OptionDef.Type.LONG)
                .option("token-value", "Token value (default: 0)", false, OptionDef.Type.LONG)
                .option("token-id", "Token ID", false)
                .option("library", "Library address pair (libName:address)", false)
                .option("compiler-version", "Compiler version", false)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String name = opts.getString("name");
                    String abi = opts.getString("abi");
                    String bytecode = opts.getString("bytecode");
                    long feeLimit = opts.getLong("fee-limit");
                    CommandSupport.requirePositive(out, "fee-limit", feeLimit);
                    long value = opts.has("value") ? opts.getLong("value") : 0;
                    if (opts.has("value")) CommandSupport.requireNonNegative(out, "value", value);
                    long consumePercent = opts.has("consume-user-resource-percent")
                            ? opts.getLong("consume-user-resource-percent") : 0;
                    long originEnergyLimit = opts.has("origin-energy-limit")
                            ? opts.getLong("origin-energy-limit") : 10_000_000;
                    long tokenValue = opts.has("token-value") ? opts.getLong("token-value") : 0;
                    if (opts.has("token-value")) CommandSupport.requireNonNegative(out, "token-value", tokenValue);
                    String tokenId = opts.has("token-id") ? opts.getString("token-id") : "";
                    if ("#".equals(tokenId)) {
                        tokenId = "";
                    }
                    if (!tokenId.isEmpty()) {
                        try {
                            Long.parseLong(tokenId);
                        } catch (NumberFormatException e) {
                            out.usageError("token-id must be numeric: " + tokenId, null);
                            return;
                        }
                    }
                    String library = opts.has("library") ? opts.getString("library") : null;
                    String compilerVersion = opts.has("compiler-version")
                            ? opts.getString("compiler-version") : null;
                    boolean multi = opts.getBoolean("multi");

                    if (consumePercent < 0 || consumePercent > 100) {
                        out.usageError("consume-user-resource-percent should be between 0 and 100", null);
                        return;
                    }
                    if (originEnergyLimit <= 0) {
                        out.usageError("origin-energy-limit must be greater than 0", null);
                        return;
                    }
                    if (opts.has("constructor") != opts.has("params")) {
                        out.usageError("Provide both --constructor and --params together", null);
                        return;
                    }

                    // If constructor + params provided, append encoded params to bytecode
                    String codeStr = bytecode;
                    if (opts.has("constructor") && opts.has("params")) {
                        String encodedParams;
                        try {
                            encodedParams = AbiUtil.parseMethod(
                                    opts.getString("constructor"), opts.getString("params"), true);
                        } catch (RuntimeException e) {
                            out.usageError("Invalid constructor signature or params: " + e.getMessage(), null);
                            return;
                        }
                        // parseMethod with isHex=true returns just the encoded params without selector
                        codeStr = bytecode + encodedParams;
                    }

                    wrapper.deployContractForCli(owner, name, abi, codeStr,
                            feeLimit, value, consumePercent, originEnergyLimit,
                            tokenValue, tokenId, library, compilerVersion, multi);
                    CommandSupport.emitSuccess(out,
                            "DeployContract successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerTriggerContract(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("trigger-contract")
                .aliases("triggercontract")
                .description("Trigger a smart contract function")
                .option("contract", "Contract address", true)
                .option("method", "Method signature (e.g. transfer(address,uint256))", true)
                .option("params", "Method parameters", false)
                .option("fee-limit", "Fee limit in SUN", true, OptionDef.Type.LONG)
                .option("value", "Call value in SUN (default: 0)", false, OptionDef.Type.LONG)
                .option("token-value", "Token value (default: 0)", false, OptionDef.Type.LONG)
                .option("token-id", "Token ID", false)
                .option("owner", "Caller address", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    String method = opts.getString("method");
                    String params = opts.has("params") ? opts.getString("params") : "";
                    long feeLimit = opts.getLong("fee-limit");
                    CommandSupport.requirePositive(out, "fee-limit", feeLimit);
                    long callValue = opts.has("value") ? opts.getLong("value") : 0;
                    if (opts.has("value")) CommandSupport.requireNonNegative(out, "value", callValue);
                    long tokenValue = opts.has("token-value") ? opts.getLong("token-value") : 0;
                    if (opts.has("token-value")) CommandSupport.requireNonNegative(out, "token-value", tokenValue);
                    String tokenId = opts.has("token-id") ? opts.getString("token-id") : "";
                    if (!tokenId.isEmpty()) {
                        try {
                            Long.parseLong(tokenId);
                        } catch (NumberFormatException e) {
                            out.usageError("token-id must be numeric: " + tokenId, null);
                            return;
                        }
                    }
                    int permissionId = opts.has("permission-id") ? opts.getInt("permission-id") : 0;
                    CommandSupport.requireNonNegative(out, "permission-id", permissionId);
                    boolean multi = opts.getBoolean("multi");

                    byte[] data;
                    try {
                        data = ByteArray.fromHexString(AbiUtil.parseMethod(method, params, false));
                    } catch (RuntimeException e) {
                        out.usageError("Invalid method signature or params: " + e.getMessage(), null);
                        return;
                    }
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    org.apache.commons.lang3.tuple.Triple<Boolean, Long, Long> result;
                    try {
                        result = wrapper.callContractForCli(owner, contractAddress, callValue, data,
                                feeLimit, tokenValue, tokenId, false, true, multi);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    if (!Boolean.TRUE.equals(result.getLeft())) {
                        out.error("execution_error", "TriggerContract failed !!");
                        return;
                    }
                    CommandSupport.emitSuccess(out,
                            "TriggerContract successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerTriggerConstantContract(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicyResolver(opts -> opts.has("owner")
                        ? CommandDefinition.AuthPolicy.NEVER
                        : CommandDefinition.AuthPolicy.REQUIRE)
                .name("trigger-constant-contract")
                .aliases("triggerconstantcontract")
                .description("Call a constant (view/pure) contract function")
                .option("contract", "Contract address", true)
                .option("method", "Method signature", true)
                .option("params", "Method parameters", false)
                .option("owner", "Caller address", false)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    String method = opts.getString("method");
                    String params = opts.has("params") ? opts.getString("params") : "";

                    byte[] data;
                    try {
                        data = ByteArray.fromHexString(AbiUtil.parseMethod(method, params, false));
                    } catch (RuntimeException e) {
                        out.usageError("Invalid method signature or params: " + e.getMessage(), null);
                        return;
                    }
                    Response.TransactionExtention result =
                            wrapper.triggerConstantContractExtention(owner, contractAddress, 0, data, 0, "");
                    if (result == null) {
                        out.error("query_failed", "TriggerConstantContract failed");
                        return;
                    }
                    if (!result.getResult().getResult()) {
                        out.error("query_failed", constantContractMessage(result, "TriggerConstantContract failed"));
                        return;
                    }
                    String formatted = Utils.formatMessageString(result);
                    out.success("Execution result = " + formatted, formatted);
                })
                .build());
    }

    private static String constantContractMessage(Response.TransactionExtention result, String fallback) {
        if (result == null || result.getResult() == null) {
            return fallback;
        }
        String message = result.getResult().getMessage().toStringUtf8();
        return message != null && !message.isEmpty() ? message : fallback;
    }

    private static String estimateEnergyMessage(Response.EstimateEnergyMessage result, String fallback) {
        if (result == null || result.getResult() == null) {
            return fallback;
        }
        String message = result.getResult().getMessage().toStringUtf8();
        return message != null && !message.isEmpty() ? message : fallback;
    }

    private static void registerEstimateEnergy(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicyResolver(opts -> opts.has("owner")
                        ? CommandDefinition.AuthPolicy.NEVER
                        : CommandDefinition.AuthPolicy.REQUIRE)
                .name("estimate-energy")
                .aliases("estimateenergy")
                .description("Estimate energy for a contract call")
                .option("contract", "Contract address", true)
                .option("method", "Method signature", true)
                .option("params", "Method parameters", false)
                .option("value", "Call value (default: 0)", false, OptionDef.Type.LONG)
                .option("token-value", "Token value (default: 0)", false, OptionDef.Type.LONG)
                .option("token-id", "Token ID", false)
                .option("owner", "Caller address", false)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    String method = opts.getString("method");
                    String params = opts.has("params") ? opts.getString("params") : "";
                    long callValue = opts.has("value") ? opts.getLong("value") : 0;
                    long tokenValue = opts.has("token-value") ? opts.getLong("token-value") : 0;
                    String tokenId = opts.has("token-id") ? opts.getString("token-id") : "";
                    if (!tokenId.isEmpty()) {
                        try {
                            Long.parseLong(tokenId);
                        } catch (NumberFormatException e) {
                            out.usageError("token-id must be numeric: " + tokenId, null);
                            return;
                        }
                    }

                    byte[] data;
                    try {
                        data = ByteArray.fromHexString(AbiUtil.parseMethod(method, params, false));
                    } catch (RuntimeException e) {
                        out.usageError("Invalid method signature or params: " + e.getMessage(), null);
                        return;
                    }
                    Response.EstimateEnergyMessage result = wrapper.estimateEnergyMessage(
                            owner, contractAddress, callValue, data, tokenValue, tokenId);
                    if (result == null) {
                        out.error("query_failed", "EstimateEnergy failed");
                        return;
                    }
                    if (!result.getResult().getResult()) {
                        out.error("query_failed", estimateEnergyMessage(result, "EstimateEnergy failed"));
                        return;
                    }
                    String formatted = Utils.formatMessageString(result);
                    out.success("Estimate energy result = " + formatted, formatted);
                })
                .build());
    }

    private static void registerClearContractABI(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("clear-contract-abi")
                .aliases("clearcontractabi")
                .description("Clear a contract's ABI")
                .option("contract", "Contract address", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.clearContractAbiForCli(owner, contractAddress, multi);
                    CommandSupport.emitSuccess(out,
                            "ClearContractABI successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUpdateSetting(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("update-setting")
                .aliases("updatesetting")
                .description("Update contract consume_user_resource_percent")
                .option("contract", "Contract address", true)
                .option("consume-user-resource-percent", "New percentage (0-100)", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    long percent = opts.getLong("consume-user-resource-percent");
                    if (percent < 0 || percent > 100) {
                        out.usageError("consume-user-resource-percent should be between 0 and 100", null);
                        return;
                    }
                    boolean multi = opts.getBoolean("multi");
                    wrapper.updateSettingForCli(owner, contractAddress, percent, multi);
                    CommandSupport.emitSuccess(out,
                            "UpdateSetting successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUpdateEnergyLimit(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("update-energy-limit")
                .aliases("updateenergylimit")
                .description("Update contract origin_energy_limit")
                .option("contract", "Contract address", true)
                .option("origin-energy-limit", "New origin energy limit", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    byte[] contractAddress = opts.getAddress("contract");
                    long limit = opts.getLong("origin-energy-limit");
                    CommandSupport.requirePositive(out, "origin-energy-limit", limit);
                    boolean multi = opts.getBoolean("multi");
                    wrapper.updateEnergyLimitForCli(owner, contractAddress, limit, multi);
                    CommandSupport.emitSuccess(out,
                            "UpdateEnergyLimit successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }
}
