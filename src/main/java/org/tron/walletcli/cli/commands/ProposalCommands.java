package org.tron.walletcli.cli.commands;

import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;

import java.util.HashMap;

public class ProposalCommands {

    public static void register(CommandRegistry registry) {
        registerCreateProposal(registry);
        registerApproveProposal(registry);
        registerDeleteProposal(registry);
    }

    private static void registerCreateProposal(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("create-proposal")
                .aliases("createproposal")
                .description("Create a proposal")
                .option("parameters", "Parameters as 'id1 value1 id2 value2 ...'", true)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    String paramsStr = opts.getString("parameters");
                    String[] parts = paramsStr.trim().split("\\s+");
                    if (parts.length % 2 != 0) {
                        out.usageError("Parameters must be pairs of 'id value'", null);
                        return;
                    }
                    HashMap<Long, Long> parametersMap = new HashMap<Long, Long>();
                    for (int i = 0; i < parts.length; i += 2) {
                        long paramId;
                        long paramValue;
                        try {
                            paramId = Long.parseLong(parts[i]);
                        } catch (NumberFormatException e) {
                            out.usageError("Invalid proposal parameter ID (expected integer): "
                                    + parts[i], null);
                            return;
                        }
                        try {
                            paramValue = Long.parseLong(parts[i + 1]);
                        } catch (NumberFormatException e) {
                            out.usageError("Invalid proposal parameter value (expected integer): "
                                    + parts[i + 1], null);
                            return;
                        }
                        parametersMap.put(paramId, paramValue);
                    }
                    boolean multi = opts.getBoolean("multi");
                    wrapper.createProposalForCli(owner, parametersMap, multi);
                    CommandSupport.emitSuccess(out,
                            "CreateProposal successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerApproveProposal(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("approve-proposal")
                .aliases("approveproposal")
                .description("Approve or disapprove a proposal")
                .option("id", "Proposal ID", true, OptionDef.Type.LONG)
                .option("approve", "true to approve, false to disapprove", true, OptionDef.Type.BOOLEAN)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long id = opts.getLong("id");
                    boolean approve = opts.getBoolean("approve");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.approveProposalForCli(owner, id, approve, multi);
                    CommandSupport.emitSuccess(out,
                            "ApproveProposal successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }

    private static void registerDeleteProposal(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("delete-proposal")
                .aliases("deleteproposal")
                .description("Delete a proposal")
                .option("id", "Proposal ID", true, OptionDef.Type.LONG)
                .option("owner", "Owner address", false)
                .option("multi", "Multi-signature mode", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {

                    byte[] owner = opts.has("owner") ? opts.getAddress("owner") : null;
                    long id = opts.getLong("id");
                    boolean multi = opts.getBoolean("multi");
                    wrapper.deleteProposalForCli(owner, id, multi);
                    CommandSupport.emitSuccess(out,
                            "DeleteProposal successful !!",
                            CommandSupport.lastBroadcastTxResultData());
                })
                .build());
    }
}
