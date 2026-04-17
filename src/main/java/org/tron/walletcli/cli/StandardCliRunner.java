package org.tron.walletcli.cli;

import org.tron.common.enums.NetType;
import org.tron.common.utils.TransactionUtils;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletFile;
import org.tron.walletserver.ApiClient;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;
import org.apache.commons.lang3.tuple.Pair;

import java.io.File;
import java.io.PrintStream;
import java.util.Arrays;

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
            resolveConnection(globalOpts.getNetwork(), globalOpts.getGrpcEndpoint());

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
            if (hasStandaloneCommandHelpToken(cmdArgs)) {
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

            CommandContext ctx = CommandContext.fromGlobalOptions(globalOpts, masterPasswordProvider);

            // Create wrapper and authenticate
            WalletApiWrapper wrapper = new WalletApiWrapper();
            try {
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
            } finally {
                wrapper.cleanup();
            }

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
        char[] charPassword = envPwd.toCharArray();
        byte[] password = StringUtils.char2Byte(charPassword);
        StringUtils.clear(charPassword);
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

    private void resolveConnection(String networkFlag, String grpcEndpoint) {
        if (networkFlag == null && grpcEndpoint == null) {
            return;
        }

        if (networkFlag != null && grpcEndpoint == null
                && "custom".equalsIgnoreCase(networkFlag)) {
            formatter.usageError(
                    "--network custom requires --grpc-endpoint", null);
        }

        // --network only (main/nile/shasta)
        if (networkFlag != null && grpcEndpoint == null) {
            NetType net = parseNetType(networkFlag);
            String fn = net.getGrpc().getFullNode();
            String sn = net.getGrpc().getSolidityNode();
            WalletApi.updateRpcCli(new ApiClient(fn, sn, false, false));
            WalletApi.setCurrentNetwork(net);
            WalletApi.setCustomNodes(Pair.of(Pair.of(fn, false), Pair.of(sn, false)));
            return;
        }

        // --grpc-endpoint present (with or without --network)
        // grpcEndpoint format is not validated here; malformed values (empty, non-host:port)
        // produce a gRPC-level error. No validation until a canonical format is decided
        // (grpc:// vs bare host:port vs ip:port).
        NetType detected = detectNetworkFromEndpoint(grpcEndpoint);

        if (networkFlag != null && detected != null) {
            NetType flagNet = parseNetType(networkFlag);
            if (flagNet != detected) {
                formatter.usageError(
                        "--grpc-endpoint " + grpcEndpoint + " belongs to "
                                + detected.name() + " but --network is " + flagNet.name(), null);
            }
        }

        NetType resolved;
        if (detected != null) {
            resolved = detected;
        } else if (networkFlag != null) {
            resolved = parseNetType(networkFlag);
        } else {
            resolved = NetType.CUSTOM;
        }

        String solidityNode;
        boolean emptySolidity;
        if (resolved != NetType.CUSTOM) {
            solidityNode = resolved.getGrpc().getSolidityNode();
            emptySolidity = false;
        } else {
            solidityNode = grpcEndpoint;
            emptySolidity = true;
        }

        WalletApi.updateRpcCli(new ApiClient(grpcEndpoint, solidityNode, false, emptySolidity));
        WalletApi.setCurrentNetwork(resolved);
        WalletApi.setCustomNodes(Pair.of(
                Pair.of(grpcEndpoint, false),
                Pair.of(solidityNode, emptySolidity)));
    }

    private File resolveAuthenticationWalletFile() throws Exception {
        File walletDir = ActiveWalletConfig.getWalletDir();
        String walletOverride = globalOpts.getWallet();
        if (walletOverride != null && !walletOverride.isEmpty()) {
            return ActiveWalletConfig.resolveWalletOverrideStrict(walletDir, walletOverride);
        }

        return ActiveWalletConfig.resolveActiveWalletFileStrict(walletDir);
    }

    static File resolveWalletOverride(File walletDir, String walletSelection) throws Exception {
        return ActiveWalletConfig.resolveWalletOverrideStrict(walletDir, walletSelection);
    }

    private NetType parseNetType(String network) {
        switch (network.toLowerCase()) {
            case "main":   return NetType.MAIN;
            case "nile":   return NetType.NILE;
            case "shasta": return NetType.SHASTA;
            case "custom": return NetType.CUSTOM;
            default:
                formatter.usageError("Unknown network: " + network
                        + ". Use: main, nile, shasta, custom", null);
                return null; // unreachable after usageError()
        }
    }

    private static NetType detectNetworkFromEndpoint(String endpoint) {
        for (NetType net : new NetType[]{NetType.MAIN, NetType.NILE, NetType.SHASTA}) {
            if (endpoint.equals(net.getGrpc().getFullNode())
                    || endpoint.equals(net.getGrpc().getSolidityNode())) {
                return net;
            }
        }
        return null;
    }

    // Intentional: --help anywhere in args triggers help, matching curl/kubectl/docker conventions.
    // The command parser already rejects --help as an option value (--prefix heuristic), so it's always user intent.
    private static boolean hasStandaloneCommandHelpToken(String[] cmdArgs) {
        for (String token : cmdArgs) {
            if ("--help".equals(token) || "-h".equals(token)) {
                return true;
            }
        }
        return false;
    }
}
