package org.tron.walletcli.cli.commands;

import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletserver.WalletApi;

import java.security.SecureRandom;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MiscCommands {

    private static final String MNEMONIC_ENV = "TRON_MNEMONIC";

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerGenerateAddress(registry);
        registerGetPrivateKeyByMnemonic(registry);
        registerEncodingConverter(registry);
        registerAddressBook(registry);
        registerViewTransactionHistory(registry);
        registerViewBackupRecords(registry);
        registerHelp(registry);
    }

    private static void registerGenerateAddress(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("generate-address")
                .aliases("generateaddress")
                .description("Generate a new address offline")
                .handler((ctx, opts, wrapper, out) -> {
                    ECKey ecKey = new ECKey(new SecureRandom());
                    byte[] priKey = ecKey.getPrivKeyBytes();
                    try {
                        byte[] address = ecKey.getAddress();
                        String addressStr = WalletApi.encode58Check(address);
                        String priKeyHex = ByteArray.toHexString(priKey);
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("address", addressStr);
                        json.put("private_key", priKeyHex);
                        out.success("Address: " + addressStr + "\nPrivate Key: " + priKeyHex, json);
                    } finally {
                        Arrays.fill(priKey, (byte) 0);
                    }
                })
                .build());
    }

    private static void registerGetPrivateKeyByMnemonic(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-private-key-by-mnemonic")
                .aliases("getprivatekeybymnemonic")
                .description("Derive private key from mnemonic phrase in " + MNEMONIC_ENV)
                .handler((ctx, opts, wrapper, out) -> {
                    String mnemonicStr = System.getenv(MNEMONIC_ENV);
                    if (mnemonicStr == null || mnemonicStr.trim().isEmpty()) {
                        out.usageError("get-private-key-by-mnemonic requires " + MNEMONIC_ENV
                                + " in standard CLI mode.", null);
                    }
                    List<String> words = Arrays.asList(mnemonicStr.trim().split("\\s+"));
                    byte[] priKey = MnemonicUtils.getPrivateKeyFromMnemonic(words);
                    try {
                        String priKeyHex = ByteArray.toHexString(priKey);
                        ECKey ecKey = ECKey.fromPrivate(priKey);
                        String address = WalletApi.encode58Check(ecKey.getAddress());
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("private_key", priKeyHex);
                        json.put("address", address);
                        out.success("Private Key: " + priKeyHex + "\nAddress: " + address, json);
                    } finally {
                        Arrays.fill(priKey, (byte) 0);
                    }
                })
                .build());
    }

    private static void registerEncodingConverter(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("encoding-converter")
                .aliases("encodingconverter")
                .description("Convert between encoding formats")
                .handler((ctx, opts, wrapper, out) -> {
                    CommandSupport.rejectUnsupportedStandardCliCommand(out, "encoding-converter");
                })
                .build());
    }

    private static void registerAddressBook(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("address-book")
                .aliases("addressbook")
                .description("Manage address book")
                .handler((ctx, opts, wrapper, out) -> {
                    CommandSupport.rejectUnsupportedStandardCliCommand(out, "address-book");
                })
                .build());
    }

    private static void registerViewTransactionHistory(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("view-transaction-history")
                .aliases("viewtransactionhistory")
                .description("View transaction history")
                .handler((ctx, opts, wrapper, out) -> {
                    CommandSupport.rejectUnsupportedStandardCliCommand(out, "view-transaction-history");
                })
                .build());
    }

    private static void registerViewBackupRecords(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("view-backup-records")
                .aliases("viewbackuprecords")
                .description("View backup records")
                .handler((ctx, opts, wrapper, out) -> {
                    CommandSupport.rejectUnsupportedStandardCliCommand(out, "view-backup-records");
                })
                .build());
    }

    private static void registerHelp(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("help")
                .aliases("help")
                .description("Show help information")
                .option("command", "Command to show help for", false)
                .handler((ctx, opts, wrapper, out) -> {
                    // Help is handled by the runner level --help flag
                    // This registers the command so it appears in the command list
                    out.successMessage(
                            "Use 'wallet-cli --help' for global help or 'wallet-cli <command> --help' for command help.");
                })
                .build());
    }
}
