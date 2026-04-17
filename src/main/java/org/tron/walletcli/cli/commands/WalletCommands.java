package org.tron.walletcli.cli.commands;

import org.tron.keystore.WalletFile;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.keystore.WalletUtils;
import org.tron.ledger.LedgerFileUtil;
import org.tron.walletcli.WalletApiWrapper.CliWalletCreationResult;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletserver.WalletApi;


import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class WalletCommands {

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerRegisterWallet(registry);
        registerListWallet(registry);
        registerSetActiveWallet(registry);
        registerGetActiveWallet(registry);
        registerClearWalletKeystore(registry);
        registerResetWallet(registry);
        registerModifyWalletName(registry);
        registerGenerateSubAccount(registry);
    }

    private static void registerRegisterWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("register-wallet")
                .aliases("registerwallet")
                .description("Create a new wallet")
                .option("name", "Wallet name", true)
                .option("words", "Mnemonic word count (12 or 24, default: 12)", false, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    int wordCount = opts.has("words") ? opts.getInt("words") : 12;
                    if (!MnemonicUtils.inputMnemonicWordsNumberCheck(wordCount)) {
                        out.usageError("Mnemonic word count must be 12 or 24, got: " + wordCount, null);
                        return;
                    }
                    String envPassword = ctx.getMasterPassword();
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("execution_error",
                                "Set MASTER_PASSWORD environment variable for non-interactive wallet creation");
                        return;
                    }
                    char[] password = envPassword.toCharArray();
                    try {
                        CliWalletCreationResult result = wrapper.registerWalletForCli(
                                password, wordCount, opts.getString("name"));
                        ActiveWalletConfig.setActiveAddress(result.getAddress());
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("keystore", result.getKeystoreName());
                        json.put("address", result.getAddress());
                        json.put("wallet_name", result.getWalletName());
                        json.put("mnemonic_keystore", result.getMnemonicKeystoreName());
                        out.success("Register a wallet successful, keystore file name is "
                                + result.getKeystoreName(), json);
                    } finally {
                        org.tron.keystore.StringUtils.clear(password);
                    }
                })
                .build());
    }

    private static void registerListWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-wallet")
                .aliases("listwallet")
                .description("List all wallets with active status")
                .handler((ctx, opts, wrapper, out) -> {
                    File dir = ActiveWalletConfig.getWalletDir();
                    if (!dir.exists() || !dir.isDirectory()) {
                        out.success("No wallets found.", Collections.emptyList());
                        return;
                    }
                    File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
                    if (files == null || files.length == 0) {
                        out.success("No wallets found.", Collections.emptyList());
                        return;
                    }

                    String activeAddress = ActiveWalletConfig.getActiveAddressLenient();
                    List<Map<String, Object>> wallets = new ArrayList<Map<String, Object>>();

                    for (File f : files) {
                        Map<String, Object> entry = new LinkedHashMap<String, Object>();
                        try {
                            WalletFile wf = WalletUtils.loadWalletFile(f);
                            String walletName = wf.getName();
                            if (walletName == null || walletName.isEmpty()) {
                                walletName = f.getName();
                            }
                            String address = wf.getAddress();
                            boolean isActive = address != null && address.equals(activeAddress);
                            entry.put("wallet-name", walletName);
                            entry.put("wallet-address", address);
                            entry.put("is-active", isActive);
                        } catch (Exception e) {
                            entry.put("wallet-name", f.getName());
                            entry.put("wallet-address", null);
                            entry.put("is-active", false);
                            entry.put("error", "corrupt keystore: " + e.getMessage());
                        }
                        wallets.add(entry);
                    }

                    // Text output
                    StringBuilder text = new StringBuilder();
                    text.append(String.format("%-30s %-42s %-8s", "Name", "Address", "Active"));
                    text.append("\n");
                    for (Map<String, Object> w : wallets) {
                        if (w.containsKey("error")) {
                            text.append(String.format("%-30s %-42s %-8s",
                                    w.get("wallet-name"), "[ERROR]", w.get("error")));
                        } else {
                            text.append(String.format("%-30s %-42s %-8s",
                                    w.get("wallet-name"),
                                    w.get("wallet-address"),
                                    (Boolean) w.get("is-active") ? "*" : ""));
                        }
                        text.append("\n");
                    }

                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("wallets", wallets);
                    out.success(text.toString().trim(), json);
                })
                .build());
    }

    private static void registerSetActiveWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("set-active-wallet")
                .aliases("setactivewallet")
                .description("Set the active wallet by address or name")
                .option("address", "Wallet address (Base58Check)", false)
                .option("name", "Wallet name", false)
                .handler((ctx, opts, wrapper, out) -> {
                    boolean hasAddress = opts.has("address");
                    boolean hasName = opts.has("name");

                    if (!hasAddress && !hasName) {
                        out.usageError(
                                "Provide --address or --name to identify the wallet", null);
                        return;
                    }
                    if (hasAddress && hasName) {
                        out.usageError(
                                "Provide either --address or --name, not both", null);
                        return;
                    }

                    File walletFile;
                    if (hasAddress) {
                        String addr = opts.getString("address");
                        byte[] decoded;
                        try {
                            decoded = WalletApi.decodeFromBase58Check(addr);
                        } catch (IllegalArgumentException e) {
                            out.usageError("Invalid TRON address for --address: " + addr, null);
                            return;
                        }
                        if (decoded == null) {
                            out.usageError("Invalid TRON address for --address: " + addr, null);
                            return;
                        }
                        walletFile = ActiveWalletConfig.findWalletFileByAddress(addr);
                        if (walletFile == null) {
                            out.error("not_found", "No wallet found with address: " + addr);
                            return;
                        }
                    } else {
                        try {
                            walletFile = ActiveWalletConfig.findWalletFileByName(
                                    opts.getString("name"));
                        } catch (IllegalArgumentException e) {
                            out.error("ambiguous_name", e.getMessage());
                            return;
                        }
                        if (walletFile == null) {
                            out.error("not_found",
                                    "No wallet found with name: " + opts.getString("name"));
                            return;
                        }
                    }

                    WalletFile wf;
                    try {
                        wf = WalletUtils.loadWalletFile(walletFile);
                    } catch (Exception e) {
                        out.error("keystore_read_error", "Could not read keystore: " + e.getMessage());
                        return;
                    }
                    ActiveWalletConfig.setActiveAddress(wf.getAddress());

                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("wallet-address", wf.getAddress());
                    out.success("Active wallet set to: " + wf.getAddress(), json);
                })
                .build());
    }

    private static void registerGetActiveWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-active-wallet")
                .aliases("getactivewallet")
                .description("Get the current active wallet")
                .handler((ctx, opts, wrapper, out) -> {
                    String activeAddress = ActiveWalletConfig.getActiveAddressStrict();
                    if (activeAddress == null) {
                        out.error("no_active_wallet", "No active wallet set");
                        return;
                    }

                    File walletFile = ActiveWalletConfig.findWalletFileByAddress(activeAddress);
                    if (walletFile == null) {
                        out.error("wallet_not_found",
                                "Active wallet keystore not found for address: " + activeAddress);
                        return;
                    }

                    WalletFile wf;
                    try {
                        wf = WalletUtils.loadWalletFile(walletFile);
                    } catch (Exception e) {
                        out.error("keystore_read_error", "Could not read keystore: " + e.getMessage());
                        return;
                    }
                    String walletName = wf.getName();
                    if (walletName == null || walletName.isEmpty()) {
                        walletName = walletFile.getName();
                    }

                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("wallet-name", walletName);
                    json.put("wallet-address", wf.getAddress());
                    out.success("Active wallet: " + walletName + " (" + wf.getAddress() + ")", json);
                })
                .build());
    }

    private static void registerClearWalletKeystore(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("clear-wallet-keystore")
                .aliases("clearwalletkeystore")
                .description("Clear wallet keystore files")
                .option("force", "Skip interactive confirmation", false, OptionDef.Type.BOOLEAN)
                .handler((ctx, opts, wrapper, out) -> {
                    boolean force = opts.getBoolean("force");
                    CommandSupport.requireForce(out, "clear-wallet-keystore", force);

                    File targetWalletFile = ctx.getResolvedAuthWalletFile();
                    boolean clearActive = shouldClearActiveWalletForDeletedTarget(targetWalletFile);
                    wrapper.clearWalletKeystoreForCli(force, targetWalletFile);
                    if (clearActive) {
                        if (!ActiveWalletConfig.clear()) {
                            out.info("Warning: Failed to delete active wallet config");
                        }
                    }
                    CommandSupport.emitSuccess(out,
                            "ClearWalletKeystore successful !!");
                })
                .build());
    }

    private static final String RESET_CONFIRM_TOKEN = "delete-all-wallets";

    private static void registerResetWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("reset-wallet")
                .aliases("resetwallet")
                .description("Reset wallet to initial state (requires --confirm " + RESET_CONFIRM_TOKEN + ")")
                .option("confirm", "Confirmation token: " + RESET_CONFIRM_TOKEN, false)
                .handler((ctx, opts, wrapper, out) -> {
                    String confirm = opts.has("confirm") ? opts.getString("confirm") : null;
                    if (confirm == null) {
                        // Dry-run: list files that would be deleted
                        List<String> walletFiles = WalletUtils.getStoreFileNames("", "Wallet");
                        List<String> mnemonicFiles = WalletUtils.getStoreFileNames("", "Mnemonic");
                        List<String> allFiles = new ArrayList<>(walletFiles);
                        if (mnemonicFiles != null && !mnemonicFiles.isEmpty()) {
                            allFiles.addAll(mnemonicFiles);
                        }

                        List<String> ledgerFiles = new ArrayList<>();
                        File ledgerDir = new File(LedgerFileUtil.LEDGER_DIR_NAME);
                        if (ledgerDir.exists() && ledgerDir.isDirectory()) {
                            File[] entries = ledgerDir.listFiles();
                            if (entries != null) {
                                for (File entry : entries) {
                                    ledgerFiles.add(entry.getPath());
                                }
                            }
                        }

                        List<String> configFiles = new ArrayList<>();
                        File activeConfig = new File(ActiveWalletConfig.getWalletDir(), ".active-wallet");
                        if (activeConfig.exists()) {
                            configFiles.add(activeConfig.getPath());
                        }

                        int totalCount = allFiles.size() + ledgerFiles.size() + configFiles.size();
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("mode", "dry-run");
                        json.put("required_confirm", RESET_CONFIRM_TOKEN);
                        json.put("files", allFiles);
                        json.put("ledger_files", ledgerFiles);
                        json.put("config_files", configFiles);
                        out.success("Dry-run: " + totalCount + " file(s) would be deleted."
                                + " Re-run with --confirm " + RESET_CONFIRM_TOKEN + " to proceed.", json);
                        return;
                    }
                    if (!RESET_CONFIRM_TOKEN.equals(confirm)) {
                        out.usageError("reset-wallet --confirm value must be exactly: "
                                + RESET_CONFIRM_TOKEN, null);
                        return;
                    }
                    wrapper.resetWalletForCli(true);
                    if (!ActiveWalletConfig.clear()) {
                        out.info("Warning: Failed to delete active wallet config");
                    }
                    CommandSupport.emitSuccess(out,
                            "ResetWallet successful !!");
                })
                .build());
    }

    private static void registerModifyWalletName(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("modify-wallet-name")
                .aliases("modifywalletname")
                .description("Modify wallet display name")
                .option("name", "New wallet name", true)
                .handler((ctx, opts, wrapper, out) -> {

                    wrapper.modifyWalletNameForCli(opts.getString("name"));
                    CommandSupport.emitSuccess(out,
                            "ModifyWalletName successful !!");
                })
                .build());
    }

    private static void registerGenerateSubAccount(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("generate-sub-account")
                .aliases("generatesubaccount")
                .description("Generate a sub-account from mnemonic")
                .option("index", "Derivation path index (0-99)", true, OptionDef.Type.LONG)
                .option("name", "Wallet name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    int index = opts.getInt("index");
                    CliWalletCreationResult result = wrapper.generateSubAccountForCli(
                            index, opts.getString("name"));
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("keystore", result.getKeystoreName());
                    json.put("address", result.getAddress());
                    json.put("wallet_name", result.getWalletName());
                    json.put("path", result.getPath());
                    json.put("mnemonic_keystore", result.getMnemonicKeystoreName());
                    out.success("GenerateSubAccount successful !!", json);
                })
                .build());
    }

    private static boolean shouldClearActiveWalletForDeletedTarget(File targetWalletFile) {
        if (targetWalletFile == null) {
            return false;
        }
        try {
            File activeWalletFile = ActiveWalletConfig.resolveActiveWalletFileStrict();
            if (activeWalletFile == null) {
                return false;
            }
            return activeWalletFile.getCanonicalFile().equals(targetWalletFile.getCanonicalFile());
        } catch (Exception e) {
            // Acceptable: resolveActiveWalletFileStrict throws IOException for both "no active
            // wallet configured" and genuine I/O errors. Catching broadly is safe here — this is
            // a best-effort cleanup check, and returning false simply skips the cleanup, which is
            // the conservative default. A narrower catch would add complexity with no practical gain.
            return false;
        }
    }
}
