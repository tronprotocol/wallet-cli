package org.tron.walletcli.cli;

import org.tron.common.enums.NetType;
import org.tron.keystore.StringUtils;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;

public class StandardCliRunner {

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

        try {
            // Apply network setting
            if (globalOpts.getNetwork() != null) {
                applyNetwork(globalOpts.getNetwork());
            }

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
                return 2;
            }

            // Check for per-command --help
            String[] cmdArgs = globalOpts.getCommandArgs();
            for (String arg : cmdArgs) {
                if ("--help".equals(arg) || "-h".equals(arg)) {
                    System.out.println(cmd.formatHelp());
                    return 0;
                }
            }

            // Parse command options
            ParsedOptions opts;
            try {
                opts = cmd.parseArgs(cmdArgs);
            } catch (IllegalArgumentException e) {
                formatter.usageError(e.getMessage(), cmd);
                return 2;
            }

            // Create wrapper and authenticate
            WalletApiWrapper wrapper = new WalletApiWrapper();
            authenticate(wrapper);

            // Execute command — in JSON mode, suppress stray System.out/err prints
            // from WalletApi/WalletApiWrapper so only OutputFormatter output appears
            if (globalOpts.getOutputMode() == OutputFormatter.OutputMode.JSON) {
                formatter.captureStreams();
                PrintStream realOut = System.out;
                PrintStream realErr = System.err;
                PrintStream nullStream = new PrintStream(new OutputStream() {
                    @Override public void write(int b) { }
                    @Override public void write(byte[] b, int off, int len) { }
                });
                System.setOut(nullStream);
                System.setErr(nullStream);
                try {
                    cmd.getHandler().execute(opts, wrapper, formatter);
                } finally {
                    System.setOut(realOut);
                    System.setErr(realErr);
                }
            } else {
                cmd.getHandler().execute(opts, wrapper, formatter);
            }
            return 0;

        } catch (IllegalArgumentException e) {
            formatter.usageError(e.getMessage(), null);
            return 2;
        } catch (Exception e) {
            formatter.error("execution_error",
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            return 1;
        } finally {
            System.setIn(originalIn);
        }
    }

    /**
     * Auto-login from keystore if a wallet file exists and MASTER_PASSWORD is set.
     * Users must first run import-wallet or register-wallet to create a keystore.
     */
    private void authenticate(WalletApiWrapper wrapper) throws Exception {
        File walletDir = new File("Wallet");
        if (!walletDir.exists() || !walletDir.isDirectory()) {
            return; // No wallet — commands that need auth will fail gracefully
        }
        File[] files = walletDir.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null || files.length == 0) {
            return; // No keystore files
        }

        String envPwd = System.getenv("MASTER_PASSWORD");
        if (envPwd == null || envPwd.isEmpty()) {
            return; // No password — can't auto-login
        }

        // Load wallet from keystore and verify password
        byte[] password = StringUtils.char2Byte(envPwd.toCharArray());
        WalletApi walletApi = WalletApi.loadWalletFromKeystore();
        walletApi.checkPassword(password);
        walletApi.setLogin(null);
        walletApi.setUnifiedPassword(password);
        wrapper.setWallet(walletApi);
        formatter.info("Authenticated with wallet keystore.");
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
}
