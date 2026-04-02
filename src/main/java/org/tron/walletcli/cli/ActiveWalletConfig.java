package org.tron.walletcli.cli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;

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

    /**
     * Get the active wallet address, or null if not set.
     */
    public static String getActiveAddress() {
        File configFile = new File(WALLET_DIR, CONFIG_FILE);
        if (!configFile.exists()) {
            return null;
        }
        try (FileReader reader = new FileReader(configFile)) {
            Map map = gson.fromJson(reader, Map.class);
            if (map != null && map.containsKey("address")) {
                return (String) map.get("address");
            }
        } catch (Exception e) {
            // Corrupted config — treat as unset
        }
        return null;
    }

    /**
     * Set the active wallet address.
     */
    public static void setActiveAddress(String address) throws IOException {
        File dir = new File(WALLET_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        File configFile = new File(WALLET_DIR, CONFIG_FILE);
        Map<String, String> data = new LinkedHashMap<String, String>();
        data.put("address", address);
        try (FileWriter writer = new FileWriter(configFile)) {
            gson.toJson(data, writer);
        }
    }

    /**
     * Clear the active wallet config.
     */
    public static void clear() {
        File configFile = new File(WALLET_DIR, CONFIG_FILE);
        if (configFile.exists()) {
            configFile.delete();
        }
    }

    /**
     * Find a keystore file by wallet address (Base58Check format).
     * Returns null if not found.
     */
    public static File findWalletFileByAddress(String address) throws IOException {
        File dir = new File(WALLET_DIR);
        if (!dir.exists() || !dir.isDirectory()) {
            return null;
        }
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) {
            return null;
        }
        for (File f : files) {
            WalletFile wf = WalletUtils.loadWalletFile(f);
            if (address.equals(wf.getAddress())) {
                return f;
            }
        }
        return null;
    }

    /**
     * Find a keystore file by wallet name.
     * Returns null if not found, throws if multiple matches.
     */
    public static File findWalletFileByName(String name) throws IOException {
        File dir = new File(WALLET_DIR);
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
            WalletFile wf = WalletUtils.loadWalletFile(f);
            String walletName = wf.getName();
            if (walletName == null) {
                walletName = f.getName();
            }
            if (name.equals(walletName)) {
                match = f;
                count++;
            }
        }
        if (count > 1) {
            throw new IllegalArgumentException(
                    "Multiple wallets found with name '" + name + "'. Use --address instead.");
        }
        return match;
    }
}
