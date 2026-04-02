package org.tron.walletcli.cli;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class CommandRegistry {

    private final Map<String, CommandDefinition> commands = new LinkedHashMap<String, CommandDefinition>();
    private final Map<String, String> aliasToName = new LinkedHashMap<String, String>();

    public void add(CommandDefinition cmd) {
        commands.put(cmd.getName(), cmd);
        aliasToName.put(cmd.getName(), cmd.getName());
        for (String alias : cmd.getAliases()) {
            aliasToName.put(alias.toLowerCase(), cmd.getName());
        }
    }

    public CommandDefinition lookup(String nameOrAlias) {
        String normalized = nameOrAlias.toLowerCase();
        String primaryName = aliasToName.get(normalized);
        if (primaryName == null) return null;
        return commands.get(primaryName);
    }

    public List<CommandDefinition> getAllCommands() {
        return new ArrayList<CommandDefinition>(commands.values());
    }

    public List<String> getAllNames() {
        return new ArrayList<String>(commands.keySet());
    }

    public int size() {
        return commands.size();
    }

    public String formatGlobalHelp(String version) {
        StringBuilder sb = new StringBuilder();
        sb.append("TRON Wallet CLI").append(version).append("\n\n");
        sb.append("Usage:\n");
        sb.append("  wallet-cli [global options] <command> [command options]\n");
        sb.append("  wallet-cli --interactive    Launch interactive REPL\n");
        sb.append("  wallet-cli --help           Show this help\n");
        sb.append("  wallet-cli <command> --help  Show command help\n\n");
        sb.append("Global Options:\n");
        sb.append("  --output <text|json>         Output format (default: text)\n");
        sb.append("  --network <main|nile|shasta> Network selection\n");
        sb.append("  --wallet <name|path>         Select wallet file\n");
        sb.append("  --grpc-endpoint <host:port>  Custom gRPC endpoint\n");
        sb.append("  --quiet                      Suppress non-essential output\n");
        sb.append("  --verbose                    Debug logging\n\n");
        sb.append("Commands:\n");

        int maxLen = 0;
        for (CommandDefinition cmd : commands.values()) {
            maxLen = Math.max(maxLen, cmd.getName().length());
        }
        String fmt = "  %-" + (maxLen + 2) + "s %s\n";
        for (CommandDefinition cmd : commands.values()) {
            sb.append(String.format(fmt, cmd.getName(), cmd.getDescription()));
        }
        sb.append("\nUse \"wallet-cli <command> --help\" for more information about a command.\n");
        return sb.toString();
    }

    /** Find similar command names for "did you mean?" suggestions. */
    public String suggest(String input) {
        String normalized = input.toLowerCase();
        int bestDist = Integer.MAX_VALUE;
        String bestMatch = null;
        for (String name : aliasToName.keySet()) {
            int dist = levenshtein(normalized, name);
            if (dist < bestDist && dist <= 3) {
                bestDist = dist;
                bestMatch = name;
            }
        }
        return bestMatch;
    }

    private static int levenshtein(String a, String b) {
        int[][] dp = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) dp[i][0] = i;
        for (int j = 0; j <= b.length(); j++) dp[0][j] = j;
        for (int i = 1; i <= a.length(); i++) {
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                dp[i][j] = Math.min(Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1),
                        dp[i - 1][j - 1] + cost);
            }
        }
        return dp[a.length()][b.length()];
    }
}
