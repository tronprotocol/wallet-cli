package org.tron.walletcli.cli.commands;

import org.tron.common.utils.TransactionUtils;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;

public class StakingCommands {

    public static void register(CommandRegistry registry) {
        registerFreezeBalance(registry);
        registerFreezeBalanceV2(registry);
        registerUnfreezeBalance(registry);
        registerUnfreezeBalanceV2(registry);
        registerWithdrawExpireUnfreeze(registry);
        registerDelegateResource(registry);
        registerUndelegateResource(registry);
        registerCancelAllUnfreezeV2(registry);
        registerWithdrawBalance(registry);
        registerUnfreezeAsset(registry);
    }

    private static void registerFreezeBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("freeze-balance")
                .aliases("freezebalance")
                .description("Freeze TRX for bandwidth/energy (v1, deprecated)")
                .option("amount", "Amount to freeze in SUN", true, OptionDef.Type.LONG)
                .option("duration", "Freeze duration in days", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("receiver", "Receiver address (for delegated freeze)", false)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    long duration = opts.getLong("duration");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    byte[] receiver = opts.has("receiver") ? opts.getAddress("receiver") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.freezeBalanceForCli(owner, amount, duration, resource, receiver, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "FreezeBalance successful !!", "FreezeBalance failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerFreezeBalanceV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("freeze-balance-v2")
                .aliases("freezebalancev2")
                .description("Freeze TRX for bandwidth/energy (Stake 2.0)")
                .option("amount", "Amount to freeze in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    int permissionId = opts.has("permission-id") ? (int) opts.getLong("permission-id") : 0;
                    boolean multi = opts.getBoolean("multi");
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    try {
                        wrapper.freezeBalanceV2ForCli(owner, amount, resource, multi);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    CommandSupport.emitBooleanResult(out, true,
                            "FreezeBalanceV2 successful !!", "FreezeBalanceV2 failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUnfreezeBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("unfreeze-balance")
                .aliases("unfreezebalance")
                .description("Unfreeze TRX (v1, deprecated)")
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("receiver", "Receiver address", false)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    byte[] receiver = opts.has("receiver") ? opts.getAddress("receiver") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.unfreezeBalanceForCli(owner, resource, receiver, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "UnfreezeBalance successful !!", "UnfreezeBalance failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUnfreezeBalanceV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("unfreeze-balance-v2")
                .aliases("unfreezebalancev2")
                .description("Unfreeze TRX (Stake 2.0)")
                .option("amount", "Amount to unfreeze in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    int permissionId = opts.has("permission-id") ? (int) opts.getLong("permission-id") : 0;
                    boolean multi = opts.getBoolean("multi");
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    try {
                        wrapper.unfreezeBalanceV2ForCli(owner, amount, resource, multi);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    CommandSupport.emitBooleanResult(out, true,
                            "UnfreezeBalanceV2 successful !!", "UnfreezeBalanceV2 failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerWithdrawExpireUnfreeze(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("withdraw-expire-unfreeze")
                .aliases("withdrawexpireunfreeze")
                .description("Withdraw expired unfrozen TRX")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.withdrawExpireUnfreezeForCli(owner, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "WithdrawExpireUnfreeze successful !!",
                            "WithdrawExpireUnfreeze failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerDelegateResource(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("delegate-resource")
                .aliases("delegateresource")
                .description("Delegate bandwidth/energy to another address")
                .option("amount", "Amount in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", true, OptionDef.Type.LONG)
                .option("receiver", "Receiver address", true)
                .option("lock", "Lock delegation", false, OptionDef.Type.BOOLEAN)
                .option("lock-period", "Lock period in blocks", false, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = (int) opts.getLong("resource");
                    byte[] receiver = opts.getAddress("receiver");
                    boolean lock = opts.getBoolean("lock");
                    long lockPeriod = opts.has("lock-period") ? opts.getLong("lock-period") : 0;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.delegateResourceForCli(owner, amount, resource, receiver,
                            lock, lockPeriod, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "DelegateResource successful !!", "DelegateResource failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUndelegateResource(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("undelegate-resource")
                .aliases("undelegateresource")
                .description("Undelegate bandwidth/energy")
                .option("amount", "Amount in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", true, OptionDef.Type.LONG)
                .option("receiver", "Receiver address", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = (int) opts.getLong("resource");
                    byte[] receiver = opts.getAddress("receiver");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.undelegateResourceForCli(owner, amount, resource, receiver, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "UndelegateResource successful !!",
                            "UndelegateResource failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerCancelAllUnfreezeV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("cancel-all-unfreeze-v2")
                .aliases("cancelallunfreezev2")
                .description("Cancel all pending unfreeze V2 operations")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.cancelAllUnfreezeV2ForCli(owner, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "CancelAllUnfreezeV2 successful !!",
                            "CancelAllUnfreezeV2 failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerWithdrawBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("withdraw-balance")
                .aliases("withdrawbalance")
                .description("Withdraw witness balance")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.withdrawBalanceForCli(owner, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "WithdrawBalance successful !!", "WithdrawBalance failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerUnfreezeAsset(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("unfreeze-asset")
                .aliases("unfreezeasset")
                .description("Unfreeze TRC10 asset")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    wrapper.unfreezeAssetForCli(owner, multi);
                    CommandSupport.emitBooleanResult(out, true,
                            "UnfreezeAsset successful !!", "UnfreezeAsset failed !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }
}
