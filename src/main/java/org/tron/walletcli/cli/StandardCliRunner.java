package org.tron.walletcli.cli;

import org.tron.common.enums.NetType;
import org.tron.common.utils.Utils;
import org.tron.common.utils.TransactionUtils;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.walletserver.ApiClient;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class StandardCliRunner {

    private enum AutoAuthPolicy {
        NEVER,
        REQUIRE
    }

    private static final Set<String> NEVER_AUTO_AUTH_COMMANDS = new HashSet<String>(Arrays.asList(
            "register-wallet",
            "import-wallet",
            "import-wallet-by-mnemonic",
            "list-wallet",
            "set-active-wallet",
            "get-active-wallet",
            "switch-network",
            "current-network",
            "get-block",
            "get-block-by-id",
            "get-block-by-id-or-num",
            "get-block-by-latest-num",
            "get-block-by-limit-next",
            "get-transaction-by-id",
            "get-transaction-info-by-id",
            "get-transaction-count-by-block-num",
            "get-account",
            "get-account-by-id",
            "get-account-net",
            "get-account-resource",
            "get-asset-issue-by-account",
            "get-asset-issue-by-id",
            "get-asset-issue-by-name",
            "get-asset-issue-list-by-name",
            "get-chain-parameters",
            "get-bandwidth-prices",
            "get-energy-prices",
            "get-memo-fee",
            "get-next-maintenance-time",
            "get-contract",
            "get-contract-info",
            "get-delegated-resource",
            "get-delegated-resource-v2",
            "get-delegated-resource-account-index",
            "get-delegated-resource-account-index-v2",
            "get-can-delegated-max-size",
            "get-available-unfreeze-count",
            "get-can-withdraw-unfreeze-amount",
            "get-brokerage",
            "get-reward",
            "list-nodes",
            "list-witnesses",
            "list-asset-issue",
            "list-asset-issue-paginated",
            "list-proposals",
            "list-proposals-paginated",
            "get-proposal",
            "list-exchanges",
            "list-exchanges-paginated",
            "get-exchange",
            "get-market-order-by-account",
            "get-market-order-by-id",
            "get-market-order-list-by-pair",
            "get-market-pair-list",
            "get-market-price-by-pair",
            "gas-free-trace",
            "generate-address",
            "get-private-key-by-mnemonic",
            "encoding-converter",
            "address-book",
            "help"
    ));

    private final CommandRegistry registry;
    private final GlobalOptions globalOpts;
    private final OutputFormatter formatter;

    public StandardCliRunner(CommandRegistry registry, GlobalOptions globalOpts) {
        this.registry = registry;
        this.globalOpts = globalOpts;
        this.formatter = new OutputFormatter(globalOpts.getOutputMode(), globalOpts.isQuiet());
    }

    public int execute() {
        // In standard CLI mode, auto-confirm interactive prompts by feeding
        // answers into System.in:
        //   "y\n"  — permission id confirmation (default 0)
        //   "1\n"  — wallet file selection (choose first)
        //   "y\n"  — additional signing confirmations
        // Repeated to cover multiple rounds of signing prompts.
        String autoInput = "y\n1\ny\ny\n1\ny\ny\n1\ny\ny\n";
        InputStream originalIn = System.in;
        System.setIn(new ByteArrayInputStream(autoInput.getBytes()));
        boolean envPasswordInputEnabled = Utils.isEnvPasswordInputEnabled();
        Utils.setEnvPasswordInputEnabled(true);

        // In JSON mode, suppress all stray System.out/err prints from the entire
        // execution (network init, authentication, command execution) so only
        // OutputFormatter JSON output appears.
        boolean jsonMode = globalOpts.getOutputMode() == OutputFormatter.OutputMode.JSON;
        PrintStream realOut = System.out;
        PrintStream realErr = System.err;
        if (jsonMode) {
            formatter.captureStreams();
            PrintStream nullStream = new PrintStream(new OutputStream() {
                @Override public void write(int b) { }
                @Override public void write(byte[] b, int off, int len) { }
            });
            System.setOut(nullStream);
            System.setErr(nullStream);
        }

        try {
            return executeInternal(realOut);
        } catch (CliAbortException e) {
            return e.getKind() == CliAbortException.Kind.USAGE ? 2 : 1;
        } finally {
            Utils.setEnvPasswordInputEnabled(envPasswordInputEnabled);
            System.setIn(originalIn);
            TransactionUtils.clearPermissionIdOverride();
            if (jsonMode) {
                System.setOut(realOut);
                System.setErr(realErr);
            }
        }
    }

    private int executeInternal(PrintStream realOut) {
        try {
            // Apply network setting
            if (globalOpts.getNetwork() != null) {
                applyNetwork(globalOpts.getNetwork());
            }
            applyGrpcEndpointOverride();

            // Lookup command
            String cmdName = globalOpts.getCommand();
            CommandDefinition cmd = registry.lookup(cmdName);
            if (cmd == null) {
                String suggestion = registry.suggest(cmdName);
                String msg = "Unknown command: " + cmdName;
                if (suggestion != null) {
                    msg += ". Did you mean: " + suggestion + "?";
                }
                formatter.usageError(msg, null);
                return 2; // unreachable after usageError()
            }

            // Check for per-command --help (always print to real stdout)
            String[] cmdArgs = globalOpts.getCommandArgs();
            for (String arg : cmdArgs) {
                if ("--help".equals(arg) || "-h".equals(arg)) {
                    realOut.println(cmd.formatHelp());
                    return 0;
                }
            }
            // Parse command options
            ParsedOptions opts;
            try {
                opts = cmd.parseArgs(cmdArgs);
            } catch (IllegalArgumentException e) {
                formatter.usageError(e.getMessage(), cmd);
                return 2; // unreachable after usageError()
            }

            applyPermissionIdOverride(cmd, opts);

            // Create wrapper and authenticate
            WalletApiWrapper wrapper = new WalletApiWrapper();
            if (requiresAutoAuth(cmd, opts)) {
                authenticate(wrapper);
            }

            // Execute command
            cmd.getHandler().execute(opts, wrapper, formatter);
            return 0;

        } catch (CliAbortException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            formatter.usageError(e.getMessage(), null);
            return 2; // unreachable after usageError()
        } catch (Exception e) {
            formatter.error("execution_error",
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            return 1; // unreachable after error()
        }
    }

    static boolean requiresAutoAuth(CommandDefinition cmd, ParsedOptions opts) {
        return determineAutoAuthPolicy(cmd, opts) == AutoAuthPolicy.REQUIRE;
    }

    private static AutoAuthPolicy determineAutoAuthPolicy(CommandDefinition cmd, ParsedOptions opts) {
        String commandName = cmd.getName();
        if (NEVER_AUTO_AUTH_COMMANDS.contains(commandName)) {
            return AutoAuthPolicy.NEVER;
        }

        if ("get-balance".equals(commandName)) {
            return opts.has("address") ? AutoAuthPolicy.NEVER : AutoAuthPolicy.REQUIRE;
        }

        if ("get-address".equals(commandName)) {
            return AutoAuthPolicy.REQUIRE;
        }

        return AutoAuthPolicy.REQUIRE;
    }

    /**
     * Auto-login from keystore using the active wallet config.
     * Falls back to the first wallet if no active wallet is set.
     * Users must first run import-wallet or register-wallet to create a keystore.
     */
    private void authenticate(WalletApiWrapper wrapper) throws Exception {
        File walletDir = resolveWalletDir();
        if (!walletDir.exists() || !walletDir.isDirectory()) {
            formatter.info("No wallet directory found — skipping auto-login");
            return; // No wallet — commands that need auth will fail gracefully
        }
        File[] files = walletDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null || files.length == 0) {
            formatter.info("No keystore files found — skipping auto-login");
            return; // No keystore files
        }

        String envPwd = System.getenv("MASTER_PASSWORD");
        if (envPwd == null || envPwd.isEmpty()) {
            formatter.info("MASTER_PASSWORD not set — skipping auto-login");
            return; // No password — can't auto-login
        }

        File targetFile = resolveAuthenticationWalletFile(walletDir);
        if (targetFile == null) {
            formatter.info("No active wallet selected — skipping auto-login");
            return;
        }

        // Load specific wallet file and authenticate
        byte[] password = StringUtils.char2Byte(envPwd.toCharArray());
        try {
            WalletFile wf = WalletUtils.loadWalletFile(targetFile);
            wf.setSourceFile(targetFile);
            if (wf.getName() == null || wf.getName().isEmpty()) {
                wf.setName(targetFile.getName());
            }
            WalletApi walletApi = new WalletApi(wf);
            walletApi.checkPassword(password);
            walletApi.setLogin(null);
            // WalletApi stores the provided array by reference, so keep an internal
            // copy there and only clear this temporary buffer locally.
            walletApi.setUnifiedPassword(Arrays.copyOf(password, password.length));
            wrapper.setWallet(walletApi);
            formatter.info("Authenticated with wallet: " + wf.getAddress());
        } finally {
            Arrays.fill(password, (byte) 0);
        }
    }

    private File resolveWalletDir() {
        return new File(System.getProperty("user.dir"), "Wallet");
    }

    private void applyGrpcEndpointOverride() {
        String grpcEndpoint = globalOpts.getGrpcEndpoint();
        if (grpcEndpoint != null && !grpcEndpoint.isEmpty()) {
            WalletApi.updateRpcCli(new ApiClient(grpcEndpoint, grpcEndpoint));
        }
    }

    private File resolveAuthenticationWalletFile(File walletDir) throws Exception {
        String walletOverride = globalOpts.getWallet();
        if (walletOverride != null && !walletOverride.isEmpty()) {
            return resolveWalletOverride(walletDir, walletOverride);
        }

        String activeAddress = ActiveWalletConfig.getActiveAddressStrict();
        if (activeAddress == null) {
            return null;
        }

        File targetFile = findWalletFileByAddress(walletDir, activeAddress);
        if (targetFile == null) {
            throw new IllegalStateException(
                    "Active wallet keystore not found for address: " + activeAddress
                            + ". Use --wallet or set-active-wallet to select a valid wallet.");
        }
        return targetFile;
    }

    static File resolveWalletOverride(File walletDir, String walletSelection) throws Exception {
        File explicitPath = new File(walletSelection);
        if (explicitPath.isFile()) {
            return explicitPath;
        }

        File walletDirEntry = new File(walletDir, walletSelection);
        if (walletDirEntry.isFile()) {
            return walletDirEntry;
        }

        File byName = findWalletFileByName(walletDir, walletSelection);
        if (byName != null) {
            return byName;
        }

        throw new IllegalStateException("No wallet found for --wallet: " + walletSelection);
    }

    static File findWalletFileByAddress(File walletDir, String address) throws Exception {
        File[] files = walletDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) {
            return null;
        }
        for (File file : files) {
            WalletFile walletFile = WalletUtils.loadWalletFile(file);
            if (address.equals(walletFile.getAddress())) {
                return file;
            }
        }
        return null;
    }

    static File findWalletFileByName(File walletDir, String walletName) throws Exception {
        File[] files = walletDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) {
            return null;
        }

        File match = null;
        int count = 0;
        for (File file : files) {
            WalletFile walletFile = WalletUtils.loadWalletFile(file);
            String currentName = walletFile.getName();
            if (currentName == null || currentName.isEmpty()) {
                currentName = file.getName();
            }
            if (walletName.equals(currentName)) {
                match = file;
                count++;
            }
        }

        if (count > 1) {
            throw new IllegalArgumentException(
                    "Multiple wallets found with name '" + walletName + "'. Use a wallet path instead.");
        }
        return match;
    }

    private void applyNetwork(String network) {
        switch (network.toLowerCase()) {
            case "main":
                WalletApi.setCurrentNetwork(NetType.MAIN);
                WalletApi.setApiCli(WalletApi.initApiCli());
                break;
            case "nile":
                WalletApi.setCurrentNetwork(NetType.NILE);
                WalletApi.setApiCli(WalletApi.initApiCli());
                break;
            case "shasta":
                WalletApi.setCurrentNetwork(NetType.SHASTA);
                WalletApi.setApiCli(WalletApi.initApiCli());
                break;
            case "custom":
                WalletApi.setCurrentNetwork(NetType.CUSTOM);
                WalletApi.setApiCli(WalletApi.initApiCli());
                break;
            default:
                formatter.usageError("Unknown network: " + network
                        + ". Use: main, nile, shasta, custom", null);
        }
    }

    private void applyPermissionIdOverride(CommandDefinition cmd, ParsedOptions opts) {
        for (OptionDef option : cmd.getOptions()) {
            if ("permission-id".equals(option.getName())) {
                int permissionId = opts.has("permission-id") ? (int) opts.getLong("permission-id") : 0;
                TransactionUtils.setPermissionIdOverride(permissionId);
                return;
            }
        }
        TransactionUtils.clearPermissionIdOverride();
    }
}
