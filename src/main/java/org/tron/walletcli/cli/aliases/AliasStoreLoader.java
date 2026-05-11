package org.tron.walletcli.cli.aliases;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.tron.common.enums.NetType;
import org.tron.common.utils.FilePermissionUtils;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletserver.WalletApi;

public final class AliasStoreLoader {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public AliasStore loadLayered(NetType network) throws IOException {
        AliasStore builtin = loadBuiltin(network);
        AliasStore user = loadUser(network);
        return AliasStore.layered(builtin, user);
    }

    public AliasStore loadBuiltin(NetType network) throws IOException {
        String resource = "/aliases/" + networkName(network) + ".json";
        InputStream in = null;
        try {
            in = AliasStoreLoader.class.getResourceAsStream(resource);
            if (in == null) {
                return AliasStore.empty();
            }
            return readStore(new InputStreamReader(in, StandardCharsets.UTF_8), "builtin");
        } catch (IOException e) {
            warnFailed("load builtin alias list " + resource, e);
            return AliasStore.empty();
        } catch (RuntimeException e) {
            warnFailed("load builtin alias list " + resource, e);
            return AliasStore.empty();
        } finally {
            if (in != null) {
                closeQuietly(in, "close builtin alias list " + resource);
            }
        }
    }

    public AliasStore loadUser(NetType network) throws IOException {
        File file = userFile(network);
        if (!file.exists()) {
            return AliasStore.empty();
        }
        Reader reader = null;
        try {
            reader = new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8);
            return readStore(reader, "user");
        } catch (IOException e) {
            warnFailed("read user alias file " + file.getPath(), e);
            return AliasStore.empty();
        } catch (RuntimeException e) {
            warnFailed("read user alias file " + file.getPath(), e);
            return AliasStore.empty();
        } finally {
            if (reader != null) {
                closeQuietly(reader, "close user alias file " + file.getPath());
            }
        }
    }

    public void saveUser(NetType network, List<AliasEntry> entries) throws IOException {
        File file = userFile(network);
        File dir = file.getParentFile();
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Could not create alias directory: " + dir.getPath());
        }
        FilePermissionUtils.setOwnerOnlyDirectory(dir.toPath());
        AliasFile aliasFile = new AliasFile();
        aliasFile.entries = new ArrayList<AliasJsonEntry>();
        for (AliasEntry entry : entries) {
            aliasFile.entries.add(AliasJsonEntry.from(entry));
        }

        File tmp = new File(dir, file.getName() + ".tmp");
        Writer writer = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8);
        try {
            GSON.toJson(aliasFile, writer);
        } finally {
            writer.close();
        }
        try {
            Files.move(tmp.toPath(), file.toPath(),
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
        FilePermissionUtils.setOwnerOnlyFile(file.toPath());
    }

    public File userFile(NetType network) {
        return new File(new File(ActiveWalletConfig.getWalletDir(), "aliases"),
                networkName(network) + ".json");
    }

    public String networkName(NetType network) {
        NetType net = network == null ? WalletApi.getCurrentNetwork() : network;
        if (net == null) {
            net = NetType.MAIN;
        }
        return net.name().toLowerCase(Locale.ROOT);
    }

    private AliasStore readStore(Reader reader, String source) throws IOException {
        AliasFile file;
        try {
            file = GSON.fromJson(reader, AliasFile.class);
        } catch (JsonSyntaxException e) {
            throw new IOException("Could not read " + source + " aliases: " + e.getMessage(), e);
        }

        List<AliasEntry> entries = new ArrayList<AliasEntry>();
        if (file != null && file.entries != null) {
            for (AliasJsonEntry json : file.entries) {
                AliasEntry entry = parseEntry(json, source);
                if (entry != null) {
                    entries.add(entry);
                }
            }
        }
        return new AliasStore(entries);
    }

    private AliasEntry parseEntry(AliasJsonEntry json, String source) {
        if (json == null) {
            return null;
        }
        if (json.name == null || json.type == null || json.address == null) {
            warnSkipping("alias entry missing name/type/address");
            return null;
        }
        try {
            AliasValidation.requireValidName(json.name);
            AliasType type = AliasType.parse(json.type);
            byte[] address = AliasResolver.decodeAddress(json.address);
            if (address == null) {
                warnSkipping("alias " + json.name + " - invalid address: " + json.address);
                return null;
            }
            if (type == AliasType.TOKEN) {
                return AliasEntry.token(json.name, address, json.decimals, source);
            }
            return AliasEntry.account(json.name, address, source, json.note);
        } catch (IllegalArgumentException e) {
            warnSkipping("alias " + json.name + " - " + e.getMessage());
            return null;
        }
    }

    private void warnSkipping(String message) {
        System.err.println("warn: skipping " + message);
    }

    private void warnFailed(String action, Exception e) {
        System.err.println("warn: failed to " + action + ": " + e.getMessage());
    }

    private void closeQuietly(java.io.Closeable closeable, String action) {
        try {
            closeable.close();
        } catch (IOException e) {
            warnFailed(action, e);
        }
    }

    static final class AliasFile {
        List<AliasJsonEntry> entries;
    }

    static final class AliasJsonEntry {
        String name;
        String type;
        String address;
        int decimals;
        String note;

        static AliasJsonEntry from(AliasEntry entry) {
            AliasJsonEntry json = new AliasJsonEntry();
            json.name = entry.getName();
            json.type = entry.getType().name();
            json.address = WalletApi.encode58Check(entry.getAddress());
            if (entry.getType() == AliasType.TOKEN) {
                json.decimals = entry.getDecimals();
            }
            if (entry.getNote() != null) {
                json.note = entry.getNote();
            }
            return json;
        }
    }
}
