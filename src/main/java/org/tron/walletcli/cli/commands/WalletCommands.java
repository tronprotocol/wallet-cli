package org.tron.walletcli.cli.commands;

import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;

import java.util.Arrays;
import java.util.List;

public class WalletCommands {

    public static void register(CommandRegistry registry) {
        registerLogin(registry);
        registerLogout(registry);
        registerRegisterWallet(registry);
        registerImportWallet(registry);
        registerImportWalletByMnemonic(registry);
        registerChangePassword(registry);
        registerBackupWallet(registry);
        registerBackupWallet2Base64(registry);
        registerExportWalletMnemonic(registry);
        registerClearWalletKeystore(registry);
        registerResetWallet(registry);
        registerModifyWalletName(registry);
        registerSwitchNetwork(registry);
        registerLock(registry);
        registerUnlock(registry);
        registerGenerateSubAccount(registry);
    }

    private static void registerLogin(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("login")
                .aliases("login")
                .description("Login to a wallet (uses MASTER_PASSWORD env var in non-interactive mode)")
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.login(null);
                    out.result(result, "Login successful !!", "Login failed !!");
                })
                .build());
    }

    private static void registerLogout(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("logout")
                .aliases("logout")
                .description("Logout from current wallet")
                .handler((opts, wrapper, out) -> {
                    wrapper.logout();
                    out.result(true, "Logout successful !!", "Logout failed !!");
                })
                .build());
    }

    private static void registerRegisterWallet(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("register-wallet")
                .aliases("registerwallet")
                .description("Create a new wallet")
                .option("words", "Mnemonic word count (12 or 24, default: 12)", false, OptionDef.Type.LONG)
                .handler((opts, wrapper, out) -> {
                    int wordCount = opts.has("words") ? (int) opts.getLong("words") : 12;
                    // RegisterWallet requires password via MASTER_PASSWORD or interactive
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable for non-interactive wallet creation");
                        return;
                    }
                    char[] password = envPassword.toCharArray();
                    String keystoreName = wrapper.registerWallet(password, wordCount);
                    if (keystoreName != null) {
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
                .description("Import a wallet by private key")
                .option("private-key", "Private key hex string", true)
                .handler((opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable for non-interactive import");
                        return;
                    }
                    char[] password = envPassword.toCharArray();
                    byte[] priKey = org.tron.common.utils.ByteArray.fromHexString(opts.getString("private-key"));
                    String keystoreName = wrapper.importWallet(password, priKey, null);
                    if (keystoreName != null) {
                        out.raw("Import a wallet successful, keystore file name is " + keystoreName);
                    } else {
                        out.error("import_failed", "Import wallet failed");
                    }
                })
                .build());
    }

    private static void registerImportWalletByMnemonic(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("import-wallet-by-mnemonic")
                .aliases("importwalletbymnemonic")
                .description("Import a wallet by mnemonic phrase")
                .option("mnemonic", "Mnemonic words (space-separated)", true)
                .handler((opts, wrapper, out) -> {
                    String envPassword = System.getenv("MASTER_PASSWORD");
                    if (envPassword == null || envPassword.isEmpty()) {
                        out.error("auth_required",
                                "Set MASTER_PASSWORD environment variable for non-interactive import");
                        return;
                    }
                    byte[] passwd = org.tron.keystore.StringUtils.char2Byte(envPassword.toCharArray());
                    String mnemonicStr = opts.getString("mnemonic");
                    List<String> words = Arrays.asList(mnemonicStr.split("\\s+"));
                    boolean result = wrapper.importWalletByMnemonic(words, passwd);
                    out.result(result,
                            "ImportWalletByMnemonic successful !!",
                            "ImportWalletByMnemonic failed !!");
                })
                .build());
    }

    private static void registerChangePassword(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("change-password")
                .aliases("changepassword")
                .description("Change wallet password")
                .option("old-password", "Current password", true)
                .option("new-password", "New password", true)
                .handler((opts, wrapper, out) -> {
                    char[] oldPwd = opts.getString("old-password").toCharArray();
                    char[] newPwd = opts.getString("new-password").toCharArray();
                    boolean result = wrapper.changePassword(oldPwd, newPwd);
                    out.result(result,
                            "ChangePassword successful !!",
                            "ChangePassword failed !!");
                })
                .build());
    }

    private static void registerBackupWallet(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("backup-wallet")
                .aliases("backupwallet")
                .description("Backup wallet (export private key)")
                .handler((opts, wrapper, out) -> {
                    // BackupWallet requires interactive password - delegates to MASTER_PASSWORD
                    out.error("not_implemented",
                            "backup-wallet via standard CLI: use --interactive mode or use --private-key for auth");
                })
                .build());
    }

    private static void registerBackupWallet2Base64(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("backup-wallet-to-base64")
                .aliases("backupwallet2base64")
                .description("Backup wallet to Base64 string")
                .handler((opts, wrapper, out) -> {
                    out.error("not_implemented",
                            "backup-wallet-to-base64 via standard CLI: use --interactive mode");
                })
                .build());
    }

    private static void registerExportWalletMnemonic(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("export-wallet-mnemonic")
                .aliases("exportwalletmnemonic")
                .description("Export wallet mnemonic phrase")
                .handler((opts, wrapper, out) -> {
                    out.error("not_implemented",
                            "export-wallet-mnemonic via standard CLI: use --interactive mode");
                })
                .build());
    }

    private static void registerClearWalletKeystore(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .name("clear-wallet-keystore")
                .aliases("clearwalletkeystore")
                .description("Clear wallet keystore files")
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.clearWalletKeystore();
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
                .handler((opts, wrapper, out) -> {
                    boolean result = wrapper.resetWallet();
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
}
