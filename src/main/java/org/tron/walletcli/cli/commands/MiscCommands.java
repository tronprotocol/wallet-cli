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
                    if (opts.has("command")) {
                        CommandDefinition cmd = registry.lookup(opts.getString("command"));
                        if (cmd == null) {
                            String suggestion = registry.suggest(opts.getString("command"));
                            String msg = "Unknown command: " + opts.getString("command");
                            if (suggestion != null) {
                                msg += ". Did you mean: " + suggestion + "?";
                            }
                            out.error("usage_error", msg);
                            return;
                        }
                        out.help(cmd.formatHelp());
                    } else {
                        out.help(registry.formatGlobalHelp(org.tron.common.utils.Utils.VERSION));
                    }
                })
                .build());
    }
}
