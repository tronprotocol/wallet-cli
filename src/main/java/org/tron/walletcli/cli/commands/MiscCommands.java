package org.tron.walletcli.cli.commands;

import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletserver.WalletApi;

import java.security.SecureRandom;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

public class MiscCommands {

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerGenerateAddress(registry);
        registerHelp(registry);
    }

    private static void registerGenerateAddress(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("generate-address")
                .aliases("generateaddress")
                .description("Generate a new address offline (WARNING: output includes plaintext private key)")
                .handler((ctx, opts, wrapper, out) -> {
                    ECKey ecKey = new ECKey(new SecureRandom());
                    byte[] priKey = ecKey.getPrivKeyBytes();
                    try {
                        byte[] address = ecKey.getAddress();
                        String addressStr = WalletApi.encode58Check(address);
                        String priKeyHex = ByteArray.toHexString(priKey);
                        out.info("WARNING: The following output contains a plaintext private key. Do not log or share.");
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("address", addressStr);
                        json.put("private_key", priKeyHex);
                        json.put("warning", "plaintext_private_key");
                        out.success("Address: " + addressStr + "\nPrivate Key: " + priKeyHex, json);
                    } finally {
                        Arrays.fill(priKey, (byte) 0);
                    }
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
