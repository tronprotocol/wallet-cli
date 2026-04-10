package org.tron.walletcli.cli;

import org.tron.common.enums.NetType;
import org.tron.common.utils.TransactionUtils;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletFile;
import org.tron.walletserver.ApiClient;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;

import java.io.File;
import java.io.PrintStream;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

public class StandardCliRunner {

    interface MasterPasswordProvider {
        String get();
    }

    private final CommandRegistry registry;
    private final GlobalOptions globalOpts;
    private final OutputFormatter formatter;
    private final MasterPasswordProvider masterPasswordProvider;

    public StandardCliRunner(CommandRegistry registry, GlobalOptions globalOpts) {
        this(registry, globalOpts, System.out, System.err);
    }

    StandardCliRunner(CommandRegistry registry, GlobalOptions globalOpts,
                      PrintStream out, PrintStream err) {
        this(registry, globalOpts, out, err, () -> System.getenv("MASTER_PASSWORD"));
    }

    StandardCliRunner(CommandRegistry registry, GlobalOptions globalOpts,
                      MasterPasswordProvider masterPasswordProvider) {
        this(registry, globalOpts, System.out, System.err, masterPasswordProvider);
    }

    StandardCliRunner(CommandRegistry registry, GlobalOptions globalOpts,
                      PrintStream out, PrintStream err,
                      MasterPasswordProvider masterPasswordProvider) {
        this.registry = registry;
        this.globalOpts = globalOpts;
        this.formatter = new OutputFormatter(globalOpts.getOutputMode(), globalOpts.isQuiet(), out, err);
        this.masterPasswordProvider = masterPasswordProvider;
    }

    public int execute() {
        try {
            return executeInternal();
        } catch (CliAbortException e) {
            formatter.flush();
            return e.getKind() == CliAbortException.Kind.USAGE ? 2 : 1;
        } finally {
            TransactionUtils.clearPermissionIdOverride();
        }
    }

    private int executeInternal() {
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

            // Check for per-command --help
            String[] cmdArgs = globalOpts.getCommandArgs();
            if (hasStandaloneCommandHelpToken(cmd, cmdArgs)) {
                formatter.help(cmd.formatHelp());
                formatter.flush();
                return 0;
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
            CommandContext ctx = CommandContext.fromGlobalOptions(globalOpts);

            // Create wrapper and authenticate
            WalletApiWrapper wrapper = new WalletApiWrapper();
            if (requiresAutoAuth(cmd, opts)) {
                ctx = ctx.withResolvedAuthWalletFile(authenticate(wrapper));
            }

            // Execute command
            cmd.getHandler().execute(ctx, opts, wrapper, formatter);
            if (!formatter.hasOutcome()) {
                formatter.error("execution_error",
                        "Command completed without emitting an outcome");
            }
            formatter.flush();
            return 0;

        } catch (CliAbortException e) {
            formatter.flush();
            throw e;
        } catch (CommandErrorException e) {
            formatter.error(e.getCode(), e.getMessage());
            return 1; // unreachable after error()
        } catch (CliUsageException e) {
            formatter.usageError(e.getMessage(), null);
            return 2; // unreachable after usageError()
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
        return cmd.resolveAuthPolicy(opts) == CommandDefinition.AuthPolicy.REQUIRE;
    }

    /**
     * Auto-login from the resolved keystore target for wallet-authenticated standard CLI commands.
     */
    private File authenticate(WalletApiWrapper wrapper) throws Exception {
        File targetFile = resolveAuthenticationWalletFile();
        String envPwd = masterPasswordProvider.get();
        if (envPwd == null || envPwd.isEmpty()) {
            throw new IllegalStateException("MASTER_PASSWORD is required for wallet-authenticated commands");
        }

        // Load specific wallet file and authenticate
        byte[] password = StringUtils.char2Byte(envPwd.toCharArray());
        try {
            WalletFile wf = org.tron.keystore.WalletUtils.loadWalletFile(targetFile);
            wf.setSourceFile(targetFile);
            if (wf.getName() == null || wf.getName().isEmpty()) {
                wf.setName(targetFile.getName());
            }
            WalletApi walletApi = new WalletApi(wf);
            boolean passwordValid;
            try {
                passwordValid = walletApi.checkPassword(password);
            } catch (Exception e) {
                throw new IllegalStateException("Invalid MASTER_PASSWORD for wallet: " + wf.getAddress(), e);
            }
            if (!passwordValid) {
                throw new IllegalStateException("Invalid MASTER_PASSWORD for wallet: " + wf.getAddress());
            }
            walletApi.setLogin(null);
            // WalletApi stores the provided array by reference, so keep an internal
            // copy there and only clear this temporary buffer locally.
            walletApi.setUnifiedPassword(Arrays.copyOf(password, password.length));
            wrapper.setWallet(walletApi);
            formatter.info("Authenticated with wallet: " + wf.getAddress());
            return targetFile;
        } finally {
            Arrays.fill(password, (byte) 0);
        }
    }

    private void applyGrpcEndpointOverride() {
        String grpcEndpoint = globalOpts.getGrpcEndpoint();
        if (grpcEndpoint != null && !grpcEndpoint.isEmpty()) {
            WalletApi.updateRpcCli(new ApiClient(grpcEndpoint, grpcEndpoint));
        }
    }

    private File resolveAuthenticationWalletFile() throws Exception {
        File walletDir = ActiveWalletConfig.getWalletDir();
        String walletOverride = globalOpts.getWallet();
        if (walletOverride != null && !walletOverride.isEmpty()) {
            return ActiveWalletConfig.resolveWalletOverrideStrict(walletDir, walletOverride);
        }

        File targetFile = ActiveWalletConfig.resolveActiveWalletFileStrict(walletDir);
        if (targetFile == null) {
            throw new IllegalStateException(
                    "No active wallet selected. Use --wallet or set-active-wallet to choose a wallet.");
        }
        return targetFile;
    }

    static File resolveWalletOverride(File walletDir, String walletSelection) throws Exception {
        return ActiveWalletConfig.resolveWalletOverrideStrict(walletDir, walletSelection);
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

    private static boolean hasStandaloneCommandHelpToken(CommandDefinition cmd, String[] cmdArgs) {
        Map<String, OptionDef> optionsByName = new LinkedHashMap<String, OptionDef>();
        for (OptionDef option : cmd.getOptions()) {
            optionsByName.put(option.getName(), option);
        }

        for (int i = 0; i < cmdArgs.length; i++) {
            String token = cmdArgs[i];
            if ("--help".equals(token) || "-h".equals(token)) {
                return true;
            }

            if ("-m".equals(token)) {
                continue;
            }

            if (!token.startsWith("--")) {
                continue;
            }

            String optionName = parseLongOptionName(token);
            OptionDef option = optionsByName.get(optionName);
            if (option != null && option.getType() != OptionDef.Type.BOOLEAN && !token.contains("=")) {
                i++;
            }
        }
        return false;
    }

    private static String parseLongOptionName(String token) {
        int equalsIndex = token.indexOf('=');
        return equalsIndex >= 0 ? token.substring(2, equalsIndex) : token.substring(2);
    }
}
