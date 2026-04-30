package org.tron.walletcli.cli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.tron.common.utils.FilePermissionUtils;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.walletserver.WalletApi;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Manages the active wallet configuration stored in Wallet/.active-wallet.
 */
public class ActiveWalletConfig {

    private static final String WALLET_DIR = "Wallet";
    private static final String CONFIG_FILE = ".active-wallet";
    private static final Gson gson = new GsonBuilder().setPrettyPrinting().create();

    public static File getWalletDir() {
        return new File(System.getProperty("user.dir"), WALLET_DIR);
    }

    /**
     * Get the active wallet address for inspection/recovery style commands.
     *
     * <p>This method is intentionally lenient: malformed or unreadable config is
     * treated as "unset". Standard CLI auth paths must use the strict APIs.
     */
    public static String getActiveAddressLenient() {
        File configFile = new File(getWalletDir(), CONFIG_FILE);
        if (!configFile.exists()) {
            return null;
        }
        try {
            return readActiveAddressFromFile(configFile);
        } catch (Exception e) {
            // Corrupted config — treat as unset
        }
        return null;
    }

    /**
     * Get the active wallet address, or null if not set.
     * Throws if the config exists but cannot be read or validated.
     */
    public static String getActiveAddressStrict() throws IOException {
        File configFile = new File(getWalletDir(), CONFIG_FILE);
        if (!configFile.exists()) {
            return null;
        }
        return readActiveAddressFromFile(configFile);
    }

    /**
     * Set the active wallet address.
     */
    public static void setActiveAddress(String address) throws IOException {
        if (address == null || WalletApi.decodeFromBase58Check(address) == null) {
            throw new IllegalArgumentException("Invalid Base58Check address: " + address);
        }
        File dir = getWalletDir();
        if (!dir.exists()) {
            dir.mkdirs();
        }
        FilePermissionUtils.setOwnerOnlyDirectory(dir.toPath());
        File configFile = new File(dir, CONFIG_FILE);
        Map<String, String> data = new LinkedHashMap<String, String>();
        data.put("address", address);
        try (FileWriter writer = new FileWriter(configFile)) {
            gson.toJson(data, writer);
        }
        FilePermissionUtils.setOwnerOnlyFile(configFile.toPath());
    }

    /**
     * Clear the active wallet config.
     */
    public static boolean clear() {
        return clearConfigFile(new File(getWalletDir(), CONFIG_FILE));
    }

    /**
     * Find a keystore file by wallet address (Base58Check format).
     * Returns null if not found.
     */
    public static File findWalletFileByAddress(String address) throws IOException {
        File dir = getWalletDir();
        return findWalletFileByAddress(dir, address);
    }

    static File findWalletFileByAddress(File dir, String address) throws IOException {
        if (!dir.exists() || !dir.isDirectory()) {
            return null;
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return null;
        }
        for (File f : files) {
            try {
                WalletFile wf = WalletUtils.loadWalletFile(f);
                if (address.equals(wf.getAddress())) {
                    return f;
                }
            } catch (Exception e) {
                // Broad catch: Gson/BouncyCastle throw assorted unchecked exceptions for malformed content
                // Silently skip — callers get a clear error from strict resolution if wallet not found
            }
        }
        return null;
    }

    /**
     * Find a keystore file by wallet name.
     * Returns null if not found, throws if multiple matches.
     */
    public static File findWalletFileByName(String name) throws IOException {
        File dir = getWalletDir();
        return findWalletFileByName(dir, name);
    }

    static File findWalletFileByName(File dir, String name) throws IOException {
        if (!dir.exists() || !dir.isDirectory()) {
            return null;
        }
        File[] files = dir.listFiles((d, n) -> n.endsWith(".json"));
        if (files == null) {
            return null;
        }
        File match = null;
        int count = 0;
        for (File f : files) {
            try {
                WalletFile wf = WalletUtils.loadWalletFile(f);
                String walletName = wf.getName();
                if (walletName == null) {
                    walletName = f.getName();
                }
                if (name.equals(walletName)) {
                    match = f;
                    count++;
                }
            } catch (Exception e) {
                // Broad catch: Gson/BouncyCastle throw assorted unchecked exceptions for malformed content
                // Silently skip — callers get a clear error from strict resolution if wallet not found
            }
        }
        if (count > 1) {
            throw new IllegalArgumentException(
                    "Multiple wallets found with name '" + name + "'. Use --address instead.");
        }
        return match;
    }

    public static File resolveWalletOverrideStrict(String walletSelection) throws IOException {
        return resolveWalletOverrideStrict(getWalletDir(), walletSelection);
    }

    static File resolveWalletOverrideStrict(File walletDir, String walletSelection) throws IOException {
        if (walletSelection == null || walletSelection.trim().isEmpty()) {
            throw new IOException("Wallet selection must not be empty");
        }

        boolean looksLikePath = new File(walletSelection).isAbsolute()
                || walletSelection.contains("/")
                || walletSelection.contains("\\");
        if (looksLikePath) {
            File canonical = new File(walletSelection).getCanonicalFile();
            if (!canonical.isFile()) {
                throw new IOException("Wallet file not found: " + walletSelection);
            }
            if (!canonical.getName().endsWith(".json")) {
                throw new IOException("Wallet file must be a .json keystore: " + walletSelection);
            }
            return canonical;
        }

        if (!walletDir.exists() || !walletDir.isDirectory()) {
            throw new IOException("Wallet directory not found: " + walletDir.getPath());
        }

        File walletDirEntry = new File(walletDir, walletSelection);
        if (walletDirEntry.isFile()) {
            if (!walletDirEntry.getName().endsWith(".json")) {
                throw new IOException("Wallet file must be a .json keystore: " + walletSelection);
            }
            return walletDirEntry;
        }

        File byName = findWalletFileByName(walletDir, walletSelection);
        if (byName != null) {
            return byName;
        }

        throw new IOException("No wallet found for --wallet: " + walletSelection);
    }

    public static File resolveActiveWalletFileStrict() throws IOException {
        return resolveActiveWalletFileStrict(getWalletDir());
    }

    static File resolveActiveWalletFileStrict(File walletDir) throws IOException {
        if (!walletDir.exists() || !walletDir.isDirectory()) {
            throw new IOException("Wallet directory not found: " + walletDir.getPath());
        }
        File configFile = new File(walletDir, CONFIG_FILE);
        if (!configFile.exists()) {
            throw new IOException("No active wallet configured. Use set-active-wallet first.");
        }
        String activeAddress = readActiveAddressFromFile(configFile);
        if (activeAddress == null) {
            throw new IOException("No active wallet configured. Use set-active-wallet first.");
        }

        File targetFile = findWalletFileByAddress(walletDir, activeAddress);
        if (targetFile == null) {
            throw new IOException(
                    "Active wallet keystore not found for address: " + activeAddress
                            + ". Use --wallet or set-active-wallet to select a valid wallet.");
        }
        return targetFile;
    }

    static String readActiveAddressFromFile(File configFile) throws IOException {
        try (FileReader reader = new FileReader(configFile)) {
            Map<String, Object> map = gson.fromJson(reader, Map.class);
            if (map == null || !map.containsKey("address")) {
                throw new IOException("Active wallet config is missing the address field");
            }
            Object address = map.get("address");
            if (!(address instanceof String) || ((String) address).trim().isEmpty()) {
                throw new IOException("Active wallet config contains an invalid address value");
            }
            return (String) address;
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("Could not read active wallet config: " + e.getMessage(), e);
        }
    }

    static boolean clearConfigFile(File configFile) {
        if (configFile.exists() && !configFile.delete()) {
            return false;
        }
        return true;
    }
}
