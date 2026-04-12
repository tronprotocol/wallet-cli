package org.tron.walletcli.cli.commands;

import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.keystore.Wallet;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletserver.WalletApi;

import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
public class WalletCommands {

    private static final String PRIVATE_KEY_ENV = "TRON_PRIVATE_KEY";
    private static final String MNEMONIC_ENV = "TRON_MNEMONIC";

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerRegisterWallet(registry);
        registerImportWallet(registry);
        registerImportWalletByMnemonic(registry);
        registerListWallet(registry);
        registerSetActiveWallet(registry);
        registerGetActiveWallet(registry);
        registerChangePassword(registry);
        registerClearWalletKeystore(registry);
        registerResetWallet(registry);
        registerModifyWalletName(registry);
        registerSwitchNetwork(registry);
        registerLock(registry);
        registerUnlock(registry);
        registerGenerateSubAccount(registry);
    }

    private static void registerRegisterWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("register-wallet")
                .aliases("registerwallet")
                .description("Create a new wallet")
                .option("words", "Mnemonic word count (12 or 24, default: 12)", false, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    int wordCount = opts.has("words") ? (int) opts.getLong("words") : 12;
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("missing_env",
                                "Set MASTER_PASSWORD environment variable for non-interactive wallet creation");
                        return;
                    }
                    char[] password = envPassword.toCharArray();
                    try {
                        String keystoreName = wrapper.registerWallet(password, wordCount);
                        if (keystoreName != null) {
                            // Auto-set as active wallet
                            String address = keystoreName.replace(".json", "");
                            ActiveWalletConfig.setActiveAddress(address);
                            Map<String, Object> json = new LinkedHashMap<String, Object>();
                            json.put("keystore", keystoreName);
                            json.put("address", address);
                            out.success("Register a wallet successful, keystore file name is " + keystoreName, json);
                        } else {
                            out.error("register_failed", "Register wallet failed");
                        }
                    } finally {
                        org.tron.keystore.StringUtils.clear(password);
                    }
                })
                .build());
    }

    private static void registerImportWallet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("import-wallet")
                .aliases("importwallet")
                .description("Import a wallet by private key from " + PRIVATE_KEY_ENV
                        + " (uses MASTER_PASSWORD env for encryption)")
                .option("name", "Wallet name (default: mywallet)", false)
                .handler((ctx, opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("missing_env",
                                "Set MASTER_PASSWORD environment variable");
                        return;
                    }
                    String privateKeyHex = System.getenv(PRIVATE_KEY_ENV);
                    if (privateKeyHex == null || privateKeyHex.isEmpty()) {
                        out.usageError("import-wallet requires " + PRIVATE_KEY_ENV + " in standard CLI mode.", null);
                        return;
                    }
                    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(
                            envPassword.toCharArray());
                    byte[] priKey = ByteArray.fromHexString(privateKeyHex);
                    try {
                        String walletName = opts.has("name") ? opts.getString("name") : "mywallet";

                        ECKey ecKey = ECKey.fromPrivate(priKey);
                        WalletFile walletFile = Wallet.createStandard(passwd, ecKey);
                        walletFile.setName(walletName);
                        String keystoreName = WalletApi.store2Keystore(walletFile);
                        String address = WalletApi.encode58Check(ecKey.getAddress());

                        // Auto-set as active wallet
                        ActiveWalletConfig.setActiveAddress(walletFile.getAddress());

                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("keystore", keystoreName);
                        json.put("address", address);
                        out.success("Import wallet successful, keystore: " + keystoreName, json);
                    } finally {
                        Arrays.fill(priKey, (byte) 0);
                        Arrays.fill(passwd, (byte) 0);
                    }
                })
                .build());
    }

    private static void registerImportWalletByMnemonic(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("import-wallet-by-mnemonic")
                .aliases("importwalletbymnemonic")
                .description("Import a wallet by mnemonic phrase from " + MNEMONIC_ENV
                        + " (uses MASTER_PASSWORD env for encryption)")
                .option("name", "Wallet name (default: mywallet)", false)
                .handler((ctx, opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("missing_env",
                                "Set MASTER_PASSWORD environment variable");
                        return;
                    }
                    String mnemonic = System.getenv(MNEMONIC_ENV);
                    if (mnemonic == null || mnemonic.trim().isEmpty()) {
                        out.usageError("import-wallet-by-mnemonic requires " + MNEMONIC_ENV
                                + " in standard CLI mode.", null);
                        return;
                    }
                    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(
                            envPassword.toCharArray());
                    List<String> words = Arrays.asList(
                            mnemonic.trim().split("\\s+"));
                    String walletName = opts.has("name") ? opts.getString("name") : "mywallet";
                    byte[] priKey = null;
                    try {
                        priKey = MnemonicUtils.getPrivateKeyFromMnemonic(words);
                        ECKey ecKey = ECKey.fromPrivate(priKey);
                        WalletFile walletFile = Wallet.createStandard(passwd, ecKey);
                        walletFile.setName(walletName);
                        String keystoreName = WalletApi.store2Keystore(walletFile);
                        String address = WalletApi.encode58Check(ecKey.getAddress());

                        // Auto-set as active wallet
                        ActiveWalletConfig.setActiveAddress(walletFile.getAddress());

                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("keystore", keystoreName);
                        json.put("address", address);
                        out.success("Import wallet by mnemonic successful, keystore: " + keystoreName, json);
                    } finally {
                        if (priKey != null) {
                            Arrays.fill(priKey, (byte) 0);
                        }
                        Arrays.fill(passwd, (byte) 0);
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
                        out.error("no_wallets", "No wallet directory found");
                        return;
                    }
                    File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
                    if (files == null || files.length == 0) {
                        out.error("no_wallets", "No wallet files found");
                        return;
                    }

                    String activeAddress = ActiveWalletConfig.getActiveAddressLenient();
                    List<Map<String, Object>> wallets = new ArrayList<Map<String, Object>>();

                    for (File f : files) {
                        WalletFile wf = WalletUtils.loadWalletFile(f);
                        String walletName = wf.getName();
                        if (walletName == null || walletName.isEmpty()) {
                            walletName = f.getName();
                        }
                        String address = wf.getAddress();
                        boolean isActive = address != null && address.equals(activeAddress);

                        Map<String, Object> entry = new LinkedHashMap<String, Object>();
                        entry.put("wallet-name", walletName);
                        entry.put("wallet-address", address);
                        entry.put("is-active", isActive);
                        wallets.add(entry);
                    }

                    // Text output
                    StringBuilder text = new StringBuilder();
                    text.append(String.format("%-30s %-42s %-8s", "Name", "Address", "Active"));
                    text.append("\n");
                    for (Map<String, Object> w : wallets) {
                        text.append(String.format("%-30s %-42s %-8s",
                                w.get("wallet-name"),
                                w.get("wallet-address"),
                                (Boolean) w.get("is-active") ? "*" : ""));
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
                        walletFile = ActiveWalletConfig.findWalletFileByAddress(
                                opts.getString("address"));
                        if (walletFile == null) {
                            out.error("not_found",
                                    "No wallet found with address: " + opts.getString("address"));
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

                    WalletFile wf = WalletUtils.loadWalletFile(walletFile);
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

                    WalletFile wf = WalletUtils.loadWalletFile(walletFile);
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

    private static final String OLD_PASSWORD_ENV = "TRON_OLD_PASSWORD";
    private static final String NEW_PASSWORD_ENV = "TRON_NEW_PASSWORD";

    private static void registerChangePassword(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("change-password")
                .aliases("changepassword")
                .description("Change the password of a wallet keystore"
                        + " (uses " + OLD_PASSWORD_ENV + " and " + NEW_PASSWORD_ENV + " env vars)")
                .option("address", "Wallet address (Base58Check)", false)
                .option("name", "Wallet name", false)
                .handler((ctx, opts, wrapper, out) -> {
                    String oldPwd = System.getenv(OLD_PASSWORD_ENV);
                    if (oldPwd == null || oldPwd.isEmpty()) {
                        out.error("missing_env",
                                "Set " + OLD_PASSWORD_ENV + " environment variable");
                        return;
                    }
                    String newPwd = System.getenv(NEW_PASSWORD_ENV);
                    if (newPwd == null || newPwd.isEmpty()) {
                        out.error("missing_env",
                                "Set " + NEW_PASSWORD_ENV + " environment variable");
                        return;
                    }

                    String walletOverride = ctx.getWalletOverride();
                    boolean hasAddress = opts.has("address");
                    boolean hasName = opts.has("name");
                    if (walletOverride != null && (hasAddress || hasName)) {
                        out.usageError(
                                "Provide either global --wallet or command-local --address/--name, not both", null);
                        return;
                    }
                    if (hasAddress && hasName) {
                        out.usageError(
                                "Provide either --address or --name, not both", null);
                        return;
                    }

                    File targetWalletFile;
                    try {
                        targetWalletFile = resolveWalletFileForNonInteractiveCommand(
                                walletOverride,
                                hasAddress ? opts.getString("address") : null,
                                hasName ? opts.getString("name") : null);
                    } catch (IllegalArgumentException e) {
                        out.error("ambiguous_name", e.getMessage());
                        return;
                    }

                    if (targetWalletFile == null) {
                        out.error("not_found", "No wallet found to change password");
                        return;
                    }

                    boolean result = wrapper.changePassword(
                            oldPwd.toCharArray(),
                            newPwd.toCharArray(),
                            targetWalletFile);
                    CommandSupport.emitBooleanResult(out, result,
                            "ChangePassword successful !!",
                            "ChangePassword failed !!");
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
                        ActiveWalletConfig.clear();
                    }
                    CommandSupport.emitBooleanResult(out, true,
                            "ClearWalletKeystore successful !!",
                            "ClearWalletKeystore failed !!");
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
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("mode", "dry-run");
                        json.put("required_confirm", RESET_CONFIRM_TOKEN);
                        json.put("files", allFiles);
                        out.success("Dry-run: " + allFiles.size() + " file(s) would be deleted."
                                + " Re-run with --confirm " + RESET_CONFIRM_TOKEN + " to proceed.", json);
                        return;
                    }
                    if (!RESET_CONFIRM_TOKEN.equals(confirm)) {
                        out.usageError("reset-wallet --confirm value must be exactly: "
                                + RESET_CONFIRM_TOKEN, null);
                        return;
                    }
                    wrapper.resetWalletForCli(true);
                    ActiveWalletConfig.clear();
                    CommandSupport.emitBooleanResult(out, true,
                            "ResetWallet successful !!", "ResetWallet failed !!");
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

                    boolean result = wrapper.modifyWalletName(opts.getString("name"));
                    CommandSupport.emitBooleanResult(out, result,
                            "ModifyWalletName successful !!",
                            "ModifyWalletName failed !!");
                })
                .build());
    }

    private static void registerSwitchNetwork(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("switch-network")
                .aliases("switchnetwork")
                .description("Switch to a different network")
                .option("network", "Network (main/nile/shasta/custom)", true)
                .option("full-node", "Custom full node endpoint", false)
                .option("solidity-node", "Custom solidity node endpoint", false)
                .handler((ctx, opts, wrapper, out) -> {
                    String network = opts.getString("network");
                    String fullNode = opts.has("full-node") ? opts.getString("full-node") : null;
                    String solidityNode = opts.has("solidity-node") ? opts.getString("solidity-node") : null;
                    wrapper.switchNetworkForCli(network, fullNode, solidityNode);
                    CommandSupport.emitBooleanResult(out, true,
                            "SwitchNetwork successful !!",
                            "SwitchNetwork failed !!");
                })
                .build());
    }

    private static void registerLock(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("lock")
                .aliases("lock")
                .description("Lock the wallet")
                .handler((ctx, opts, wrapper, out) -> {

                    boolean result = wrapper.lock();
                    CommandSupport.emitBooleanResult(out, result,
                            "Lock successful !!", "Lock failed !!");
                })
                .build());
    }

    private static void registerUnlock(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("unlock")
                .aliases("unlock")
                .description("Unlock the wallet for a duration")
                .option("duration", "Duration in seconds", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long duration = opts.getLong("duration");
                    wrapper.unlockOrThrow(duration);
                    out.successMessage("Unlock successful !!");
                })
                .build());
    }

    private static void registerGenerateSubAccount(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("generate-sub-account")
                .aliases("generatesubaccount")
                .description("Generate a sub-account from mnemonic")
                .handler((ctx, opts, wrapper, out) -> {
                    wrapper.generateSubAccountOrThrow();
                    out.successMessage("GenerateSubAccount successful !!");
                })
                .build());
    }

    private static File resolveWalletFileForNonInteractiveCommand(
            String walletOverride, String address, String name)
            throws Exception {
        if (walletOverride != null) {
            return ActiveWalletConfig.resolveWalletOverrideStrict(walletOverride);
        }
        if (address != null) {
            return ActiveWalletConfig.findWalletFileByAddress(address);
        }
        if (name != null) {
            return ActiveWalletConfig.findWalletFileByName(name);
        }

        String activeAddress = ActiveWalletConfig.getActiveAddressStrict();
        if (activeAddress != null) {
            File activeFile = ActiveWalletConfig.findWalletFileByAddress(activeAddress);
            if (activeFile != null) {
                return activeFile;
            }
            throw new IllegalStateException(
                    "Active wallet keystore not found for address: " + activeAddress
                            + ". Use --address, --name, or set-active-wallet.");
        }
        return null;
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
            logger.warn("Could not read active wallet config after wallet deletion: {}", e.getMessage());
            return false;
        }
    }
}
