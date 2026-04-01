package org.tron.walletcli.cli.commands;

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
                .name("freeze-balance")
                .aliases("freezebalance")
                .description("Freeze TRX for bandwidth/energy (v1, deprecated)")
                .option("amount", "Amount to freeze in SUN", true, OptionDef.Type.LONG)
                .option("duration", "Freeze duration in days", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("receiver", "Receiver address (for delegated freeze)", false)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    long duration = opts.getLong("duration");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    byte[] receiver = opts.has("receiver") ? opts.getAddress("receiver") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.freezeBalance(owner, amount, duration, resource, receiver, multi);
                    out.result(result, "FreezeBalance successful !!", "FreezeBalance failed !!");
                })
                .build());
    }

    private static void registerFreezeBalanceV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("freeze-balance-v2")
                .aliases("freezebalancev2")
                .description("Freeze TRX for bandwidth/energy (Stake 2.0)")
                .option("amount", "Amount to freeze in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.freezeBalanceV2(owner, amount, resource, multi);
                    out.result(result, "FreezeBalanceV2 successful !!", "FreezeBalanceV2 failed !!");
                })
                .build());
    }

    private static void registerUnfreezeBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("unfreeze-balance")
                .aliases("unfreezebalance")
                .description("Unfreeze TRX (v1, deprecated)")
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("receiver", "Receiver address", false)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    byte[] receiver = opts.has("receiver") ? opts.getAddress("receiver") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.unfreezeBalance(owner, resource, receiver, multi);
                    out.result(result, "UnfreezeBalance successful !!", "UnfreezeBalance failed !!");
                })
                .build());
    }

    private static void registerUnfreezeBalanceV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("unfreeze-balance-v2")
                .aliases("unfreezebalancev2")
                .description("Unfreeze TRX (Stake 2.0)")
                .option("amount", "Amount to unfreeze in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", false, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = opts.has("resource") ? (int) opts.getLong("resource") : 0;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.unfreezeBalanceV2(owner, amount, resource, multi);
                    out.result(result, "UnfreezeBalanceV2 successful !!", "UnfreezeBalanceV2 failed !!");
                })
                .build());
    }

    private static void registerWithdrawExpireUnfreeze(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("withdraw-expire-unfreeze")
                .aliases("withdrawexpireunfreeze")
                .description("Withdraw expired unfrozen TRX")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.withdrawExpireUnfreeze(owner, multi);
                    out.result(result,
                            "WithdrawExpireUnfreeze successful !!",
                            "WithdrawExpireUnfreeze failed !!");
                })
                .build());
    }

    private static void registerDelegateResource(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
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
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = (int) opts.getLong("resource");
                    byte[] receiver = opts.getAddress("receiver");
                    boolean lock = opts.getBoolean("lock");
                    long lockPeriod = opts.has("lock-period") ? opts.getLong("lock-period") : 0;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.delegateresource(owner, amount, resource, receiver,
                            lock, lockPeriod, multi);
                    out.result(result, "DelegateResource successful !!", "DelegateResource failed !!");
                })
                .build());
    }

    private static void registerUndelegateResource(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("undelegate-resource")
                .aliases("undelegateresource")
                .description("Undelegate bandwidth/energy")
                .option("amount", "Amount in SUN", true, OptionDef.Type.LONG)
                .option("resource", "Resource type (0=BANDWIDTH, 1=ENERGY)", true, OptionDef.Type.LONG)
                .option("receiver", "Receiver address", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long amount = opts.getLong("amount");
                    int resource = (int) opts.getLong("resource");
                    byte[] receiver = opts.getAddress("receiver");
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.undelegateresource(owner, amount, resource, receiver, multi);
                    out.result(result,
                            "UndelegateResource successful !!",
                            "UndelegateResource failed !!");
                })
                .build());
    }

    private static void registerCancelAllUnfreezeV2(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("cancel-all-unfreeze-v2")
                .aliases("cancelallunfreezev2")
                .description("Cancel all pending unfreeze V2 operations")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.cancelAllUnfreezeV2(owner, multi);
                    out.result(result,
                            "CancelAllUnfreezeV2 successful !!",
                            "CancelAllUnfreezeV2 failed !!");
                })
                .build());
    }

    private static void registerWithdrawBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("withdraw-balance")
                .aliases("withdrawbalance")
                .description("Withdraw witness balance")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.withdrawBalance(owner, multi);
                    out.result(result, "WithdrawBalance successful !!", "WithdrawBalance failed !!");
                })
                .build());
    }

    private static void registerUnfreezeAsset(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("unfreeze-asset")
                .aliases("unfreezeasset")
                .description("Unfreeze TRC10 asset")
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.unfreezeAsset(owner, multi);
                    out.result(result, "UnfreezeAsset successful !!", "UnfreezeAsset failed !!");
                })
                .build());
    }
}
