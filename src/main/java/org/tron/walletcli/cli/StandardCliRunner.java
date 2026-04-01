package org.tron.walletcli.cli;

import org.tron.common.crypto.ECKey;
import org.tron.common.enums.NetType;
import org.tron.common.utils.ByteArray;
import org.tron.keystore.Wallet;
import org.tron.keystore.WalletFile;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.walletcli.WalletApiWrapper;
import org.tron.walletserver.WalletApi;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.util.Arrays;
import java.util.List;

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

    private void authenticate(WalletApiWrapper wrapper) throws Exception {
        if (globalOpts.getPrivateKey() != null) {
            authenticateWithKey(ByteArray.fromHexString(globalOpts.getPrivateKey()), wrapper);
            formatter.info("Authenticated with private key.");
        } else if (globalOpts.getMnemonic() != null) {
            String mnemonicStr = globalOpts.getMnemonic();
            List<String> words = Arrays.asList(mnemonicStr.split("\\s+"));
            byte[] privateKeyBytes = MnemonicUtils.getPrivateKeyFromMnemonic(words);
            authenticateWithKey(privateKeyBytes, wrapper);
            Arrays.fill(privateKeyBytes, (byte) 0);
            formatter.info("Authenticated with mnemonic.");
        } else if (globalOpts.getWallet() != null) {
            formatter.info("Loading wallet: " + globalOpts.getWallet());
            wrapper.login(null);
        }
        // No auth specified — some commands (queries with address param) may work without login
    }

    /**
     * Creates a WalletApi from a raw private key, stores a keystore file so that
     * the signing flow can locate it, and sets the unified password so the signing
     * flow doesn't prompt interactively.
     */
    private void authenticateWithKey(byte[] privateKeyBytes, WalletApiWrapper wrapper) throws Exception {
        // Use MASTER_PASSWORD if available, otherwise a default
        String envPwd = System.getenv("MASTER_PASSWORD");
        byte[] password = (envPwd != null && !envPwd.isEmpty())
                ? envPwd.getBytes() : "cli-temp-password1A".getBytes();

        ECKey ecKey = ECKey.fromPrivate(privateKeyBytes);
        WalletFile walletFile = Wallet.createStandard(password, ecKey);

        // Clean Wallet/ directory so only this keystore exists.
        // This ensures selectWalletFileE() picks it automatically without interactive prompt.
        File walletDir = new File("Wallet");
        if (walletDir.exists() && walletDir.isDirectory()) {
            File[] existing = walletDir.listFiles();
            if (existing != null) {
                for (File f : existing) {
                    f.delete();
                }
            }
        }

        // Store keystore file to disk so signTransaction -> selectWalletFileE() can find it
        WalletApi.store2Keystore(walletFile);

        WalletApi walletApi = new WalletApi(walletFile);
        walletApi.setLogin(null);
        // Set unified password so signing uses it directly without interactive prompt
        walletApi.setUnifiedPassword(password);
        wrapper.setWallet(walletApi);
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
