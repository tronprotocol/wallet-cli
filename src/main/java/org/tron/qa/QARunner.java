package org.tron.qa;

import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;

import java.util.List;

/**
 * QA helper entry point for listing the registered standard CLI commands.
 *
 * <p>Usage:
 * <pre>
 *   java -cp wallet-cli.jar org.tron.qa.QARunner list
 * </pre>
 */
public class QARunner {
    private static final String RETIRED_MODE_MESSAGE =
            "QARunner baseline/verify modes are no longer supported. "
                    + "Use 'bash qa/run.sh verify' (optionally with --query-batch) for QA verification.";

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "list";

        switch (mode) {
            case "list":
                listCommands();
                break;
            case "baseline":
            case "verify":
                System.err.println(RETIRED_MODE_MESSAGE);
                System.exit(1);
                break;
            default:
                System.err.println("Unknown mode: " + mode);
                System.err.println("Usage: QARunner <list>");
                System.exit(1);
        }
    }

    /**
     * Lists all registered standard CLI commands.
     */
    private static void listCommands() {
        CommandRegistry registry = buildRegistry();
        List<CommandDefinition> commands = registry.getAllCommands();
        System.out.println("Registered standard CLI commands: " + commands.size());
        System.out.println();
        for (CommandDefinition cmd : commands) {
            StringBuilder sb = new StringBuilder();
            sb.append("  ").append(cmd.getName());
            if (!cmd.getAliases().isEmpty()) {
                sb.append(" (aliases: ");
                for (int i = 0; i < cmd.getAliases().size(); i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(cmd.getAliases().get(i));
                }
                sb.append(")");
            }
            System.out.println(sb.toString());
        }
    }

    /**
     * Builds the full command registry (same as Client.initRegistry()).
     */
    private static CommandRegistry buildRegistry() {
        CommandRegistry registry = new CommandRegistry();
        org.tron.walletcli.cli.commands.QueryCommands.register(registry);
        org.tron.walletcli.cli.commands.TransactionCommands.register(registry);
        org.tron.walletcli.cli.commands.ContractCommands.register(registry);
        org.tron.walletcli.cli.commands.StakingCommands.register(registry);
        org.tron.walletcli.cli.commands.WitnessCommands.register(registry);
        org.tron.walletcli.cli.commands.ProposalCommands.register(registry);
        org.tron.walletcli.cli.commands.ExchangeCommands.register(registry);
        org.tron.walletcli.cli.commands.WalletCommands.register(registry);
        org.tron.walletcli.cli.commands.MiscCommands.register(registry);
        return registry;
    }
}
