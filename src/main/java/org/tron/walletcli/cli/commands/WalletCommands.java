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

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class WalletCommands {

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
        registry.add(CommandDefinition.builder()
                .name("register-wallet")
                .aliases("registerwallet")
                .description("Create a new wallet")
                .option("words", "Mnemonic word count (12 or 24, default: 12)", false, OptionDef.Type.LONG)
                .handler((opts, wrapper, out) -> {
                    int wordCount = opts.has("words") ? (int) opts.getLong("words") : 12;
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable for non-interactive wallet creation");
                        return;
                    }
                    char[] password = envPassword.toCharArray();
                    String keystoreName = wrapper.registerWallet(password, wordCount);
                    if (keystoreName != null) {
                        // Auto-set as active wallet
                        String address = keystoreName.replace(".json", "");
                        ActiveWalletConfig.setActiveAddress(address);
                        out.raw("Register a wallet successful, keystore file name is " + keystoreName);
                    } else {
                        out.error("register_failed", "Register wallet failed");
                    }
                })
                .build());
    }

    private static void registerImportWallet(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("import-wallet")
                .aliases("importwallet")
                .description("Import a wallet by private key (uses MASTER_PASSWORD env for encryption)")
                .option("private-key", "Private key hex string", true)
                .option("name", "Wallet name (default: mywallet)", false)
                .handler((opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable");
                        return;
                    }
                    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(
                            envPassword.toCharArray());
                    byte[] priKey = ByteArray.fromHexString(opts.getString("private-key"));
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
                })
                .build());
    }

    private static void registerImportWalletByMnemonic(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("import-wallet-by-mnemonic")
                .aliases("importwalletbymnemonic")
                .description("Import a wallet by mnemonic phrase (uses MASTER_PASSWORD env for encryption)")
                .option("mnemonic", "Mnemonic words (space-separated)", true)
                .option("name", "Wallet name (default: mywallet)", false)
                .handler((opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable");
                        return;
                    }
                    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(
                            envPassword.toCharArray());
                    List<String> words = Arrays.asList(
                            opts.getString("mnemonic").split("\\s+"));
                    String walletName = opts.has("name") ? opts.getString("name") : "mywallet";

                    byte[] priKey = MnemonicUtils.getPrivateKeyFromMnemonic(words);
                    ECKey ecKey = ECKey.fromPrivate(priKey);
                    WalletFile walletFile = Wallet.createStandard(passwd, ecKey);
                    walletFile.setName(walletName);
                    String keystoreName = WalletApi.store2Keystore(walletFile);
                    String address = WalletApi.encode58Check(ecKey.getAddress());
                    Arrays.fill(priKey, (byte) 0);

                    // Auto-set as active wallet
                    ActiveWalletConfig.setActiveAddress(walletFile.getAddress());

                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("keystore", keystoreName);
                    json.put("address", address);
                    out.success("Import wallet by mnemonic successful, keystore: " + keystoreName, json);
                })
                .build());
    }

    private static void registerListWallet(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("list-wallet")
                .aliases("listwallet")
                .description("List all wallets with active status")
                .handler((opts, wrapper, out) -> {
                    File dir = new File("Wallet");
                    if (!dir.exists() || !dir.isDirectory()) {
                        out.error("no_wallets", "No wallet directory found");
                        return;
                    }
                    File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
                    if (files == null || files.length == 0) {
                        out.error("no_wallets", "No wallet files found");
                        return;
                    }

                    String activeAddress = ActiveWalletConfig.getActiveAddress();
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
        registry.add(CommandDefinition.builder()
                .name("set-active-wallet")
                .aliases("setactivewallet")
                .description("Set the active wallet by address or name")
                .option("address", "Wallet address (Base58Check)", false)
                .option("name", "Wallet name", false)
                .handler((opts, wrapper, out) -> {
                    boolean hasAddress = opts.has("address");
                    boolean hasName = opts.has("name");

                    if (!hasAddress && !hasName) {
                        out.error("missing_option",
                                "Provide --address or --name to identify the wallet");
                        return;
                    }
                    if (hasAddress && hasName) {
                        out.error("invalid_options",
                                "Provide either --address or --name, not both");
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
        registry.add(CommandDefinition.builder()
                .name("get-active-wallet")
                .aliases("getactivewallet")
                .description("Get the current active wallet")
                .handler((opts, wrapper, out) -> {
                    String activeAddress = ActiveWalletConfig.getActiveAddress();
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

    private static void registerChangePassword(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("change-password")
                .aliases("changepassword")
                .description("Change the password of a wallet keystore")
                .option("old-password", "Current keystore password", true)
                .option("new-password", "New keystore password", true)
                .option("address", "Wallet address (Base58Check)", false)
                .option("name", "Wallet name", false)
                .handler((opts, wrapper, out) -> {
                    boolean hasAddress = opts.has("address");
                    boolean hasName = opts.has("name");
                    if (hasAddress && hasName) {
                        out.error("invalid_options",
                                "Provide either --address or --name, not both");
                        return;
                    }

                    File targetWalletFile;
                    try {
                        targetWalletFile = resolveWalletFileForNonInteractiveCommand(
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
                            opts.getString("old-password").toCharArray(),
                            opts.getString("new-password").toCharArray(),
                            targetWalletFile);
                    out.result(result,
                            "ChangePassword successful !!",
                            "ChangePassword failed !!");
                })
                .build());
    }

    private static void registerClearWalletKeystore(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("clear-wallet-keystore")
                .aliases("clearwalletkeystore")
                .description("Clear wallet keystore files")
                .option("force", "Skip interactive confirmation", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    ActiveWalletConfig.clear();
                    boolean result = wrapper.clearWalletKeystore(opts.getBoolean("force"));
                    out.result(result,
                            "ClearWalletKeystore successful !!",
                            "ClearWalletKeystore failed !!");
                })
                .build());
    }

    private static void registerResetWallet(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("reset-wallet")
                .aliases("resetwallet")
                .description("Reset wallet to initial state")
                .option("force", "Skip interactive confirmation", false, OptionDef.Type.BOOLEAN)
                .handler((opts, wrapper, out) -> {
                    ActiveWalletConfig.clear();
                    boolean result = wrapper.resetWallet(opts.getBoolean("force"));
                    out.result(result, "ResetWallet successful !!", "ResetWallet failed !!");
                })
                .build());
    }

    private static void registerModifyWalletName(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("modify-wallet-name")
                .aliases("modifywalletname")
                .description("Modify wallet display name")
                .option("name", "New wallet name", true)
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.modifyWalletName(opts.getString("name"));
                    out.result(result,
                            "ModifyWalletName successful !!",
                            "ModifyWalletName failed !!");
                })
                .build());
    }

    private static void registerSwitchNetwork(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("switch-network")
                .aliases("switchnetwork")
                .description("Switch to a different network")
                .option("network", "Network (main/nile/shasta/custom)", true)
                .option("full-node", "Custom full node endpoint", false)
                .option("solidity-node", "Custom solidity node endpoint", false)
                .handler((opts, wrapper, out) -> {
                    String network = opts.getString("network");
                    String fullNode = opts.has("full-node") ? opts.getString("full-node") : null;
                    String solidityNode = opts.has("solidity-node") ? opts.getString("solidity-node") : null;
                    boolean result = wrapper.switchNetwork(network, fullNode, solidityNode);
                    out.result(result,
                            "SwitchNetwork successful !!",
                            "SwitchNetwork failed !!");
                })
                .build());
    }

    private static void registerLock(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("lock")
                .aliases("lock")
                .description("Lock the wallet")
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.lock();
                    out.result(result, "Lock successful !!", "Lock failed !!");
                })
                .build());
    }

    private static void registerUnlock(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("unlock")
                .aliases("unlock")
                .description("Unlock the wallet for a duration")
                .option("duration", "Duration in seconds", true, OptionDef.Type.LONG)
                .handler((opts, wrapper, out) -> {
                    long duration = opts.getLong("duration");
                    boolean result = wrapper.unlock(duration);
                    out.result(result, "Unlock successful !!", "Unlock failed !!");
                })
                .build());
    }

    private static void registerGenerateSubAccount(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("generate-sub-account")
                .aliases("generatesubaccount")
                .description("Generate a sub-account from mnemonic")
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.generateSubAccount();
                    out.result(result,
                            "GenerateSubAccount successful !!",
                            "GenerateSubAccount failed !!");
                })
                .build());
    }

    private static File resolveWalletFileForNonInteractiveCommand(String address, String name)
            throws Exception {
        if (address != null) {
            return ActiveWalletConfig.findWalletFileByAddress(address);
        }
        if (name != null) {
            return ActiveWalletConfig.findWalletFileByName(name);
        }

        String activeAddress = ActiveWalletConfig.getActiveAddress();
        if (activeAddress != null) {
            File activeFile = ActiveWalletConfig.findWalletFileByAddress(activeAddress);
            if (activeFile != null) {
                return activeFile;
            }
        }

        File dir = new File("Wallet");
        if (!dir.exists() || !dir.isDirectory()) {
            return null;
        }
        File[] files = dir.listFiles((d, fileName) -> fileName.endsWith(".json"));
        if (files == null || files.length == 0) {
            return null;
        }
        return files[0];
    }
}
