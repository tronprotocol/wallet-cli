package org.tron.walletcli.cli.aliases;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AliasStore {

    private final Map<String, AliasEntry> entries;

    public AliasStore(Collection<AliasEntry> entries) {
        Map<String, AliasEntry> map = new LinkedHashMap<String, AliasEntry>();
        if (entries != null) {
            for (AliasEntry entry : entries) {
                if (entry != null) {
                    map.put(key(entry.getName()), entry);
                }
            }
        }
        this.entries = Collections.unmodifiableMap(map);
    }

    public static AliasStore empty() {
        return new AliasStore(Collections.<AliasEntry>emptyList());
    }

    public static AliasStore layered(AliasStore builtin, AliasStore user) {
        List<AliasEntry> result = new ArrayList<AliasEntry>();
        AliasStore builtins = builtin == null ? empty() : builtin;
        AliasStore users = user == null ? empty() : user;
        result.addAll(builtins.listAll());
        for (AliasEntry entry : users.listAll()) {
            if (!builtins.containsName(entry.getName())) {
                result.add(entry);
            }
        }
        return new AliasStore(result);
    }

    public AliasEntry find(String name, AliasType type) {
        AliasEntry entry = entries.get(key(name));
        if (entry == null) {
            return null;
        }
        return type == null || entry.getType() == type ? entry : null;
    }

    public boolean containsName(String name) {
        return entries.containsKey(key(name));
    }

    public List<AliasEntry> listAll() {
        return new ArrayList<AliasEntry>(entries.values());
    }

    public List<AliasEntry> listByType(AliasType type) {
        List<AliasEntry> result = new ArrayList<AliasEntry>();
        for (AliasEntry entry : entries.values()) {
            if (type == null || entry.getType() == type) {
                result.add(entry);
            }
        }
        return result;
    }

    private static String key(String name) {
        return name == null ? "" : name.trim().toUpperCase(Locale.ROOT);
    }
}
