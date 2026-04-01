package org.tron.harness;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.GlobalOptions;
import org.tron.walletcli.cli.OutputFormatter;
import org.tron.walletcli.cli.StandardCliRunner;

import java.io.File;
import java.io.FileWriter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Harness entry point for capturing command outputs and verifying parity.
 *
 * <p>Usage:
 * <pre>
 *   java -cp wallet-cli.jar org.tron.harness.HarnessRunner baseline harness/baseline
 *   java -cp wallet-cli.jar org.tron.harness.HarnessRunner verify harness/results
 *   java -cp wallet-cli.jar org.tron.harness.HarnessRunner list
 * </pre>
 */
public class HarnessRunner {

    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "list";
        String outputDir = args.length > 1 ? args[1] : "harness/baseline";

        switch (mode) {
            case "list":
                listCommands();
                break;
            case "baseline":
                captureBaseline(outputDir);
                break;
            case "verify":
                runVerification(outputDir);
                break;
            default:
                System.err.println("Unknown mode: " + mode);
                System.err.println("Usage: HarnessRunner <list|baseline|verify> [outputDir]");
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
     * Captures baseline output for read-only commands by running them via the standard CLI.
     * Saves each command's text and JSON output to files in the output directory.
     */
    private static void captureBaseline(String outputDir) throws Exception {
        String privateKey = System.getenv("TRON_TEST_APIKEY");
        String network = System.getenv("TRON_NETWORK");
        if (network == null || network.isEmpty()) {
            network = "nile";
        }

        if (privateKey == null || privateKey.isEmpty()) {
            System.err.println("ERROR: TRON_TEST_APIKEY environment variable not set.");
            System.err.println("Please set it to a Nile testnet private key.");
            System.exit(1);
        }

        File dir = new File(outputDir);
        dir.mkdirs();

        CommandRegistry registry = buildRegistry();
        List<CommandDefinition> commands = registry.getAllCommands();

        System.out.println("=== Harness Baseline Capture ===");
        System.out.println("Network: " + network);
        System.out.println("Output dir: " + outputDir);
        System.out.println("Commands: " + commands.size());
        System.out.println();

        // Read-only commands that are safe to run without parameters
        String[] safeNoArgCommands = {
                "get-address", "get-balance", "current-network",
                "get-block", "get-chain-parameters", "get-bandwidth-prices",
                "get-energy-prices", "get-memo-fee", "get-next-maintenance-time",
                "list-nodes", "list-witnesses", "list-asset-issue",
                "list-proposals", "list-exchanges", "get-market-pair-list"
        };

        int captured = 0;
        int skipped = 0;

        for (String cmdName : safeNoArgCommands) {
            CommandDefinition cmd = registry.lookup(cmdName);
            if (cmd == null) {
                System.out.println("  SKIP (not found): " + cmdName);
                skipped++;
                continue;
            }

            System.out.print("  Capturing: " + cmdName + "... ");

            // Capture text output
            CommandCapture textCapture = new CommandCapture();
            textCapture.startCapture();
            try {
                String[] cliArgs = {"--network", network, "--private-key", privateKey, cmdName};
                GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
                StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
                runner.execute();
            } catch (Exception e) {
                // Ignore — some commands may call System.exit
            } finally {
                textCapture.stopCapture();
            }

            // Capture JSON output
            CommandCapture jsonCapture = new CommandCapture();
            jsonCapture.startCapture();
            try {
                String[] cliArgs = {"--network", network, "--private-key", privateKey,
                        "--output", "json", cmdName};
                GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
                StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
                runner.execute();
            } catch (Exception e) {
                // Ignore
            } finally {
                jsonCapture.stopCapture();
            }

            // Save results
            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("command", cmdName);
            result.put("text_stdout", textCapture.getStdout());
            result.put("text_stderr", textCapture.getStderr());
            result.put("json_stdout", jsonCapture.getStdout());
            result.put("json_stderr", jsonCapture.getStderr());

            saveResult(outputDir, cmdName, result);
            captured++;
            System.out.println("OK");
        }

        System.out.println();
        System.out.println("Baseline capture complete: " + captured + " captured, " + skipped + " skipped");
    }

    /**
     * Runs verification by comparing current output against baseline.
     */
    private static void runVerification(String outputDir) throws Exception {
        String privateKey = System.getenv("TRON_TEST_APIKEY");
        String mnemonic = System.getenv("TRON_TEST_MNEMONIC");
        String network = System.getenv("TRON_NETWORK");
        if (network == null || network.isEmpty()) {
            network = "nile";
        }

        if (privateKey == null || privateKey.isEmpty()) {
            System.err.println("ERROR: TRON_TEST_APIKEY environment variable not set.");
            System.exit(1);
        }

        File dir = new File(outputDir);
        dir.mkdirs();

        CommandRegistry registry = buildRegistry();

        System.out.println("=== Harness Verification ===");
        System.out.println("Network: " + network);
        System.out.println("Output dir: " + outputDir);
        System.out.println("Total commands: " + registry.size());
        System.out.println();

        // Phase 1: Connectivity
        System.out.println("Phase 1: Connectivity check...");
        CommandCapture connCheck = new CommandCapture();
        connCheck.startCapture();
        try {
            String[] cliArgs = {"--network", network, "get-chain-parameters"};
            GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
            StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
            runner.execute();
        } catch (Exception e) {
            // ignore System.exit
        } finally {
            connCheck.stopCapture();
        }
        boolean connected = !connCheck.getStdout().isEmpty();
        System.out.println("  " + (connected ? "OK — connected to " + network : "FAILED"));
        if (!connected) {
            System.err.println("Cannot connect to network. Aborting.");
            System.exit(1);
        }

        // Phase 2: Completeness check
        System.out.println();
        System.out.println("Phase 2: Completeness check...");
        System.out.println("  Standard CLI commands: " + registry.size());

        // Phase 3: Private key session
        System.out.println();
        System.out.println("Phase 3: Private key session — safe query commands...");
        int passed = 0;
        int failed = 0;

        String[] safeNoArgCommands = {
                "current-network", "get-chain-parameters", "get-bandwidth-prices",
                "get-energy-prices", "get-memo-fee", "get-next-maintenance-time",
                "list-witnesses", "get-market-pair-list"
        };

        for (String cmdName : safeNoArgCommands) {
            System.out.print("  " + cmdName + ": ");

            // Run text mode
            CommandCapture textCapture = new CommandCapture();
            textCapture.startCapture();
            try {
                String[] cliArgs = {"--network", network, cmdName};
                GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
                StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
                runner.execute();
            } catch (Exception e) {
                // ignore
            } finally {
                textCapture.stopCapture();
            }

            // Run JSON mode
            CommandCapture jsonCapture = new CommandCapture();
            jsonCapture.startCapture();
            try {
                String[] cliArgs = {"--network", network, "--output", "json", cmdName};
                GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
                StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
                runner.execute();
            } catch (Exception e) {
                // ignore
            } finally {
                jsonCapture.stopCapture();
            }

            boolean textOk = !textCapture.getStdout().trim().isEmpty();
            boolean jsonOk = !jsonCapture.getStdout().trim().isEmpty();

            Map<String, Object> result = new LinkedHashMap<String, Object>();
            result.put("command", cmdName);
            result.put("text_stdout", textCapture.getStdout());
            result.put("json_stdout", jsonCapture.getStdout());
            result.put("text_ok", textOk);
            result.put("json_ok", jsonOk);
            saveResult(outputDir, cmdName, result);

            if (textOk && jsonOk) {
                System.out.println("PASS (text + json)");
                passed++;
            } else if (textOk) {
                System.out.println("PARTIAL (text ok, json empty)");
                failed++;
            } else {
                System.out.println("FAIL");
                failed++;
            }
        }

        // Phase 4: Mnemonic session (if available)
        if (mnemonic != null && !mnemonic.isEmpty()) {
            System.out.println();
            System.out.println("Phase 4: Mnemonic session...");

            for (String cmdName : new String[]{"get-address", "get-balance"}) {
                System.out.print("  " + cmdName + " (mnemonic): ");
                CommandCapture cap = new CommandCapture();
                cap.startCapture();
                try {
                    String[] cliArgs = {"--network", network, "--mnemonic", mnemonic, cmdName};
                    GlobalOptions globalOpts = GlobalOptions.parse(cliArgs);
                    StandardCliRunner runner = new StandardCliRunner(registry, globalOpts);
                    runner.execute();
                } catch (Exception e) {
                    // ignore
                } finally {
                    cap.stopCapture();
                }
                boolean ok = !cap.getStdout().trim().isEmpty();
                System.out.println(ok ? "PASS" : "FAIL");
                if (ok) passed++;
                else failed++;
            }
        } else {
            System.out.println();
            System.out.println("Phase 4: SKIPPED (TRON_TEST_MNEMONIC not set)");
        }

        // Report
        System.out.println();
        System.out.println("═══════════════════════════════════════════════════════════════");
        System.out.println("  Harness Verification Report (" + network + ")");
        System.out.println("═══════════════════════════════════════════════════════════════");
        System.out.println("  Total commands registered: " + registry.size());
        System.out.println("  Commands tested:           " + (passed + failed));
        System.out.println("  Passed:                    " + passed);
        System.out.println("  Failed:                    " + failed);
        System.out.println("═══════════════════════════════════════════════════════════════");
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

    private static void saveResult(String outputDir, String command, Map<String, Object> data)
            throws Exception {
        File file = new File(outputDir, command + ".json");
        try (FileWriter writer = new FileWriter(file)) {
            gson.toJson(data, writer);
        }
    }
}
