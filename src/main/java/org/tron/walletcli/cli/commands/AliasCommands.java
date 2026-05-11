package org.tron.walletcli.cli.commands;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.tron.common.enums.NetType;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletcli.cli.aliases.AliasEntry;
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasStore;
import org.tron.walletcli.cli.aliases.AliasStoreLoader;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.AliasValidation;
import org.tron.walletcli.cli.aliases.ResolutionResult;
import org.tron.walletserver.WalletApi;

public class AliasCommands {

    public static void register(CommandRegistry registry) {
        registerAdd(registry);
        registerRemove(registry);
        registerList(registry);
        registerResolve(registry);
    }

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    private static void registerAdd(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("alias-add")
                .description("Add an account or token alias")
                .option("name", "Alias name", true)
                .option("type", "Alias type: ACCOUNT or TOKEN", true)
                .option("address", "TRON address", true)
                .option("decimals", "Token decimals", false, OptionDef.Type.LONG)
                .option("note", "Account note", false)
                .handler((ctx, opts, wrapper, out) -> {
                    AliasStoreLoader loader = new AliasStoreLoader();
                    NetType network = WalletApi.getCurrentNetwork();
                    String name = opts.getString("name");
                    AliasValidation.requireValidName(name);
                    AliasType type = AliasType.parse(opts.getString("type"));
                    byte[] address = AliasResolver.decodeAddress(opts.getString("address"));
                    if (address == null) {
                        out.usageError("Invalid TRON address for --address: "
                                + opts.getString("address"), null);
                        return;
                    }
                    if (type == AliasType.TOKEN && opts.has("note")) {
                        out.error("invalid_option",
                                "--note is only valid for ACCOUNT aliases (got --type TOKEN)");
                        return;
                    }
                    if (type == AliasType.ACCOUNT && opts.has("decimals")) {
                        out.error("invalid_option",
                                "--decimals is only valid for TOKEN aliases (got --type ACCOUNT)");
                        return;
                    }

                    AliasStore builtin = loader.loadBuiltin(network);
                    if (builtin.containsName(name)) {
                        out.usageError("Alias '" + name + "' is built in on "
                                + loader.networkName(network) + " and cannot be overridden", null);
                        return;
                    }
                    AliasStore user = loader.loadUser(network);
                    if (user.containsName(name)) {
                        out.usageError("Alias already exists: " + name
                                + ". Use alias-remove first to replace it.", null);
                        return;
                    }

                    List<AliasEntry> entries = user.listAll();
                    AliasEntry entry = type == AliasType.TOKEN
                            ? AliasEntry.token(name, address,
                                    opts.has("decimals") ? opts.getInt("decimals") : 0, "user")
                            : AliasEntry.account(name, address, "user", opts.getString("note"));
                    entries.add(entry);
                    loader.saveUser(network, entries);
                    out.success("Alias added: " + entry.getName(), aliasData(entry));
                })
                .build());
    }

    private static void registerRemove(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("alias-remove")
                .description("Remove a user alias")
                .option("name", "Alias name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    AliasStoreLoader loader = new AliasStoreLoader();
                    NetType network = WalletApi.getCurrentNetwork();
                    String name = opts.getString("name");
                    AliasStore builtin = loader.loadBuiltin(network);
                    if (builtin.containsName(name)) {
                        out.usageError("Alias '" + name + "' is built in on "
                                + loader.networkName(network) + " and cannot be removed", null);
                        return;
                    }

                    AliasStore user = loader.loadUser(network);
                    List<AliasEntry> kept = new ArrayList<AliasEntry>();
                    boolean removed = false;
                    for (AliasEntry entry : user.listAll()) {
                        if (entry.getName().equalsIgnoreCase(name)) {
                            removed = true;
                        } else {
                            kept.add(entry);
                        }
                    }
                    if (!removed) {
                        out.error("not_found", "Alias not found: " + name);
                        return;
                    }
                    loader.saveUser(network, kept);
                    out.successMessage("Alias removed: " + name);
                })
                .build());
    }

    private static void registerList(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("alias-list")
                .description("List aliases for the current network")
                .option("type", "Filter type: ACCOUNT or TOKEN", false)
                .handler((ctx, opts, wrapper, out) -> {
                    AliasStoreLoader loader = new AliasStoreLoader();
                    AliasType type = opts.has("type") ? AliasType.parse(opts.getString("type")) : null;
                    AliasStore store = loader.loadLayered(WalletApi.getCurrentNetwork());
                    List<AliasEntry> entries = store.listByType(type);
                    List<Map<String, Object>> rows = new ArrayList<Map<String, Object>>();
                    StringBuilder text = new StringBuilder();
                    text.append(String.format("%-32s %-8s %-42s %-8s", "Name", "Type", "Address", "Source"));
                    for (AliasEntry entry : entries) {
                        rows.add(aliasData(entry));
                        text.append("\n").append(String.format("%-32s %-8s %-42s %-8s",
                                entry.getName(), entry.getType().name(),
                                WalletApi.encode58Check(entry.getAddress()), entry.getSource()));
                    }
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("aliases", rows);
                    out.success(entries.isEmpty() ? "No aliases found." : text.toString(), json);
                })
                .build());
    }

    private static void registerResolve(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("alias-resolve")
                .description("Resolve an alias or address")
                .option("name", "Alias name or address", true)
                .option("type", "Expected type: ACCOUNT or TOKEN", false)
                .handler((ctx, opts, wrapper, out) -> {
                    AliasType type = opts.has("type") ? AliasType.parse(opts.getString("type")) : null;
                    AliasResolver resolver = ctx.getAliasResolver() != null
                            ? ctx.getAliasResolver()
                            : new AliasResolver(new AliasStoreLoader().loadLayered(WalletApi.getCurrentNetwork()));
                    ResolutionResult result = resolver.resolve("name", opts.getString("name"), type);
                    out.success("Resolved: " + result.getAddressBase58(), result.toJsonMap());
                })
                .build());
    }

    private static Map<String, Object> aliasData(AliasEntry entry) {
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        data.put("name", entry.getName());
        data.put("type", entry.getType().name());
        data.put("address", WalletApi.encode58Check(entry.getAddress()));
        data.put("source", entry.getSource());
        if (entry.getType() == AliasType.TOKEN) {
            data.put("decimals", entry.getDecimals());
        }
        if (entry.getNote() != null) {
            data.put("note", entry.getNote());
        }
        return data;
    }
}
