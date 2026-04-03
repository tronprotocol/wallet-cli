package org.tron.walletcli.cli.commands;

import org.tron.common.utils.TransactionUtils;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;

import java.util.HashMap;

public class WitnessCommands {

    public static void register(CommandRegistry registry) {
        registerCreateWitness(registry);
        registerUpdateWitness(registry);
        registerVoteWitness(registry);
        registerUpdateBrokerage(registry);
    }

    private static void registerCreateWitness(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("create-witness")
                .aliases("createwitness")
                .description("Create a witness (super representative)")
                .option("url", "Witness URL", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String url = opts.getString("url");
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.createWitness(owner, url, multi);
                    out.result(result, "CreateWitness successful !!", "CreateWitness failed !!");
                })
                .build());
    }

    private static void registerUpdateWitness(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("update-witness")
                .aliases("updatewitness")
                .description("Update witness URL")
                .option("url", "New witness URL", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String url = opts.getString("url");
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.updateWitness(owner, url, multi);
                    out.result(result, "UpdateWitness successful !!", "UpdateWitness failed !!");
                })
                .build());
    }

    private static void registerVoteWitness(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("vote-witness")
                .aliases("votewitness")
                .description("Vote for witnesses (format: address1 count1 address2 count2 ...)")
                .option("votes", "Votes as 'address1 count1 address2 count2 ...'", true)
                .option("owner", "Voter address", false)
                .option("permission-id", "Permission ID for signing (default: 0)", false, OptionDef.Type.LONG)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String votesStr = opts.getString("votes");
                    int permissionId = opts.has("permission-id") ? (int) opts.getLong("permission-id") : 0;
                    String[] parts = votesStr.trim().split("\\s+");
                    if (parts.length % 2 != 0) {
                        out.usageError("Votes must be pairs of 'address count'", null);
                        return;
                    }
                    HashMap<String, String> witness = new HashMap<String, String>();
                    for (int i = 0; i < parts.length; i += 2) {
                        witness.put(parts[i], parts[i + 1]);
                    }
                    boolean multi = opts.getBoolean("multi");
                    TransactionUtils.setPermissionIdOverride(permissionId);
                    boolean result;
                    try {
                        result = wrapper.voteWitness(owner, witness, multi);
                    } finally {
                        TransactionUtils.clearPermissionIdOverride();
                    }
                    out.result(result, "VoteWitness successful !!", "VoteWitness failed !!");
                })
                .build());
    }

    private static void registerUpdateBrokerage(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("update-brokerage")
                .aliases("updatebrokerage")
                .description("Update witness brokerage ratio")
                .option("brokerage", "Brokerage ratio (0-100)", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    int brokerage = (int) opts.getLong("brokerage");
                    boolean multi = opts.getBoolean("multi");
                    boolean result = wrapper.updateBrokerage(owner, brokerage, multi);
                    out.result(result, "UpdateBrokerage successful !!", "UpdateBrokerage failed !!");
                })
                .build());
    }
}
