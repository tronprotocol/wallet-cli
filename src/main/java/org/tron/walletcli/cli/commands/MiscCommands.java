package org.tron.walletcli.cli.commands;

import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;

public class MiscCommands {

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerHelp(registry);
    }

    private static void registerHelp(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("help")
                .description("Show help information")
                .option("command", "Command to show help for", false)
                .handler((ctx, opts, wrapper, out) -> {
                    // Help is handled by the runner level --help flag
                    // This registers the command so it appears in the command list
                    out.successMessage(
                            "Use 'wallet-cli --help' for global help or 'wallet-cli <command> --help' for command help.");
                })
                .build());
    }
}
