package org.tron.qa;

import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.GlobalOptions;
import org.tron.walletcli.cli.StandardCliRunner;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * QA-only in-process batch runner for query phases.
 *
 * <p>This class is intentionally opt-in. It only generates the same text/json
 * artifacts the shell QA expects, while the existing shell validators remain
 * the source of truth for PASS/FAIL semantics.</p>
 */
public class QABatchRunner {

    private static final Pattern ADDRESS_PATTERN = Pattern.compile("address =\\s+(\\S+)");
    private static final Pattern BLOCK_ID_PATTERN = Pattern.compile("\"blockid\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern TX_ID_PATTERN = Pattern.compile("\"txid\"\\s*:\\s*\"([^\"]+)\"");

    public static void main(String[] args) throws Exception {
        Args parsed = Args.parse(args);
        new QABatchRunner().run(parsed);
    }

    private void run(Args args) throws Exception {
        Path resultsDir = Paths.get(args.resultsDir);
        Files.createDirectories(resultsDir);

        String prefix = args.auth;
        if (args.caseFilter != null && !args.caseFilter.startsWith(prefix + "_")) {
            return;
        }

        CommandRegistry registry = buildRegistry();

        String addressText = execute(registry, args.network, false, "get-address");
        String myAddr = extractFirst(ADDRESS_PATTERN, addressText);

        String recentBlocksJson = execute(registry, args.network, true, "get-block-by-latest-num", "--count", "10");
        String blockId = extractFirst(BLOCK_ID_PATTERN, recentBlocksJson);
        String txId = extractFirst(TX_ID_PATTERN, recentBlocksJson);

        // Auth-required, no params
        runFullCase(registry, args, prefix + "_get-address", "get-address");
        runFullCase(registry, args, prefix + "_get-balance", "get-balance");
        runFullCase(registry, args, prefix + "_get-usdt-balance", "get-usdt-balance");

        // No-auth, no params
        runFullCase(registry, args, prefix + "_current-network", "current-network");
        runFullCase(registry, args, prefix + "_get-block", "get-block");
        runFullCase(registry, args, prefix + "_get-chain-parameters", "get-chain-parameters");
        runFullCase(registry, args, prefix + "_get-bandwidth-prices", "get-bandwidth-prices");
        runFullCase(registry, args, prefix + "_get-energy-prices", "get-energy-prices");
        runFullCase(registry, args, prefix + "_get-memo-fee", "get-memo-fee");
        runFullCase(registry, args, prefix + "_get-next-maintenance-time", "get-next-maintenance-time");
        runFullCase(registry, args, prefix + "_list-nodes", "list-nodes");
        runFullCase(registry, args, prefix + "_list-witnesses", "list-witnesses");
        runFullCase(registry, args, prefix + "_list-asset-issue", "list-asset-issue");
        runFullCase(registry, args, prefix + "_list-proposals", "list-proposals");
        runFullCase(registry, args, prefix + "_list-exchanges", "list-exchanges");
        runFullCase(registry, args, prefix + "_get-market-pair-list", "get-market-pair-list");

        if (myAddr != null && !myAddr.isEmpty()) {
            runFullCase(registry, args, prefix + "_get-account", "get-account", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-account-net", "get-account-net", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-account-resource", "get-account-resource", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-delegated-resource-account-index",
                    "get-delegated-resource-account-index", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-delegated-resource-account-index-v2",
                    "get-delegated-resource-account-index-v2", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-can-delegated-max-size",
                    "get-can-delegated-max-size", "--owner", myAddr, "--type", "0");
            runFullCase(registry, args, prefix + "_get-available-unfreeze-count",
                    "get-available-unfreeze-count", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-can-withdraw-unfreeze-amount",
                    "get-can-withdraw-unfreeze-amount", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-brokerage", "get-brokerage", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-reward", "get-reward", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-market-order-by-account",
                    "get-market-order-by-account", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-asset-issue-by-account",
                    "get-asset-issue-by-account", "--address", myAddr);
            runFullCase(registry, args, prefix + "_get-delegated-resource",
                    "get-delegated-resource", "--from", myAddr, "--to", myAddr);
            runFullCase(registry, args, prefix + "_get-delegated-resource-v2",
                    "get-delegated-resource-v2", "--from", myAddr, "--to", myAddr);
            runFullCase(registry, args, prefix + "_gas-free-info", "gas-free-info", "--address", myAddr);
            runFullCase(registry, args, prefix + "_gas-free-trace", "gas-free-trace", "--address", myAddr);
        }

        runFullCase(registry, args, prefix + "_get-block-by-latest-num",
                "get-block-by-latest-num", "--count", "2");
        runFullCase(registry, args, prefix + "_get-block-by-limit-next",
                "get-block-by-limit-next", "--start", "1", "--end", "3");
        runFullCase(registry, args, prefix + "_get-transaction-count-by-block-num",
                "get-transaction-count-by-block-num", "--number", "1");
        runFullCase(registry, args, prefix + "_get-block-by-id-or-num",
                "get-block-by-id-or-num", "--value", "1");

        if (blockId != null && !blockId.isEmpty()) {
            runFullCase(registry, args, prefix + "_get-block-by-id", "get-block-by-id", "--id", blockId);
        } else {
            writeSkip(args, prefix + "_get-block-by-id",
                    "no blockid available from get-block-by-latest-num --count 10");
        }

        if (txId != null && !txId.isEmpty()) {
            runFullCase(registry, args, prefix + "_get-transaction-by-id",
                    "get-transaction-by-id", "--id", txId);
            runFullCase(registry, args, prefix + "_get-transaction-info-by-id",
                    "get-transaction-info-by-id", "--id", txId);
        } else {
            writeSkip(args, prefix + "_get-transaction-by-id",
                    "no txid available from get-block-by-latest-num --count 10");
            writeSkip(args, prefix + "_get-transaction-info-by-id",
                    "no txid available from get-block-by-latest-num --count 10");
        }

        runFullCase(registry, args, prefix + "_get-account-by-id", "get-account-by-id", "--id", "testid");
        runFullCase(registry, args, prefix + "_get-asset-issue-by-id", "get-asset-issue-by-id", "--id", "1000001");
        runFullCase(registry, args, prefix + "_get-asset-issue-by-name", "get-asset-issue-by-name", "--name", "TRX");
        runFullCase(registry, args, prefix + "_get-asset-issue-list-by-name",
                "get-asset-issue-list-by-name", "--name", "TRX");
        runFullCase(registry, args, prefix + "_list-asset-issue-paginated",
                "list-asset-issue-paginated", "--offset", "0", "--limit", "5");
        runFullCase(registry, args, prefix + "_list-proposals-paginated",
                "list-proposals-paginated", "--offset", "0", "--limit", "5");
        runFullCase(registry, args, prefix + "_list-exchanges-paginated",
                "list-exchanges-paginated", "--offset", "0", "--limit", "5");

        String usdtNile = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
        runFullCase(registry, args, prefix + "_get-contract", "get-contract", "--address", usdtNile);
        runFullCase(registry, args, prefix + "_get-contract-info", "get-contract-info", "--address", usdtNile);
        runFullCase(registry, args, prefix + "_get-market-order-list-by-pair",
                "get-market-order-list-by-pair", "--sell-token", "_", "--buy-token", "1000001");
        runFullCase(registry, args, prefix + "_get-market-price-by-pair",
                "get-market-price-by-pair", "--sell-token", "_", "--buy-token", "1000001");
        runFullCase(registry, args, prefix + "_get-market-order-by-id",
                "get-market-order-by-id", "--id",
                "0000000000000000000000000000000000000000000000000000000000000001");
        runFullCase(registry, args, prefix + "_get-proposal", "get-proposal", "--id", "1");
        runFullCase(registry, args, prefix + "_get-exchange", "get-exchange", "--id", "1");
    }

    private void runFullCase(CommandRegistry registry, Args args, String label, String... commandArgs)
            throws Exception {
        if (!shouldRun(args.caseFilter, label)) {
            return;
        }

        String textOut = execute(registry, args.network, false, commandArgs);
        String jsonOut = execute(registry, args.network, true, commandArgs);
        writeFile(args.resultsDir, label + "_text.out", textOut);
        writeFile(args.resultsDir, label + "_json.out", jsonOut);
    }

    private static boolean shouldRun(String caseFilter, String label) {
        return caseFilter == null || caseFilter.isEmpty() || caseFilter.equals(label);
    }

    private static void writeSkip(Args args, String label, String reason) throws IOException {
        if (!shouldRun(args.caseFilter, label)) {
            return;
        }
        writeFile(args.resultsDir, label + ".result", "SKIP: " + reason);
    }

    private static String execute(CommandRegistry registry, String network, boolean json, String... commandArgs)
            throws Exception {
        List<String> cliArgs = new ArrayList<>();
        cliArgs.add("--network");
        cliArgs.add(network);
        if (json) {
            cliArgs.add("--output");
            cliArgs.add("json");
        }
        cliArgs.addAll(Arrays.asList(commandArgs));

        CommandCapture capture = new CommandCapture();
        capture.startCapture();
        try {
            GlobalOptions globalOpts = GlobalOptions.parse(cliArgs.toArray(new String[0]));
            StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
            runner.execute();
        } catch (Exception e) {
            // Keep behavior aligned with shell QA: capture stdout only and ignore failures.
        } finally {
            capture.stopCapture();
        }
        return capture.getStdout();
    }

    private static String extractFirst(Pattern pattern, String input) {
        if (input == null || input.isEmpty()) {
            return null;
        }
        Matcher matcher = pattern.matcher(input);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static void writeFile(String resultsDir, String fileName, String content) throws IOException {
        Path path = Paths.get(resultsDir, fileName);
        Files.write(path, content.getBytes(StandardCharsets.UTF_8));
    }

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

    private static final class Args {
        private final String network;
        private final String auth;
        private final String resultsDir;
        private final String caseFilter;

        private Args(String network, String auth, String resultsDir, String caseFilter) {
            this.network = network;
            this.auth = auth;
            this.resultsDir = resultsDir;
            this.caseFilter = caseFilter;
        }

        private static Args parse(String[] args) {
            String network = "nile";
            String auth = null;
            String resultsDir = "qa/results";
            String caseFilter = null;

            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--network":
                        network = requireValue(args, ++i, "--network");
                        break;
                    case "--auth":
                        auth = requireValue(args, ++i, "--auth");
                        break;
                    case "--results-dir":
                        resultsDir = requireValue(args, ++i, "--results-dir");
                        break;
                    case "--case":
                        caseFilter = requireValue(args, ++i, "--case");
                        break;
                    default:
                        throw new IllegalArgumentException("Unknown option: " + args[i]);
                }
            }

            if (auth == null || (!auth.equals("private-key") && !auth.equals("mnemonic"))) {
                throw new IllegalArgumentException("Missing or invalid --auth (private-key|mnemonic)");
            }

            return new Args(network, auth, resultsDir, caseFilter);
        }

        private static String requireValue(String[] args, int idx, String flag) {
            if (idx >= args.length) {
                throw new IllegalArgumentException("Missing value for " + flag);
            }
            return args[idx];
        }
    }
}
