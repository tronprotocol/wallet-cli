package org.tron.walletcli.cli.aliases;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Arrays;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.tron.common.enums.NetType;
import org.tron.walletserver.WalletApi;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class AliasStoreLoaderTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private String originalUserDir;
    private AliasStoreLoader loader;

    @Before
    public void setUp() {
        originalUserDir = System.getProperty("user.dir");
        System.setProperty("user.dir", temp.getRoot().getAbsolutePath());
        loader = new AliasStoreLoader();
    }

    @After
    public void tearDown() {
        System.setProperty("user.dir", originalUserDir);
    }

    @Test
    public void builtinMainContainsUSDT() throws Exception {
        AliasStore store = loader.loadBuiltin(NetType.MAIN);
        AliasEntry usdt = store.find("USDT", AliasType.TOKEN);
        assertNotNull(usdt);
        assertEquals("builtin", usdt.getSource());
        assertEquals(6, usdt.getDecimals());
    }

    @Test
    public void missingUserFileLoadsAsEmpty() throws Exception {
        assertEquals(0, loader.loadUser(NetType.SHASTA).listAll().size());
    }

    @Test
    public void saveAndLoadUserFileRoundTrips() throws Exception {
        AliasEntry alice = AliasEntry.account("alice", address(), "user", "hot");
        loader.saveUser(NetType.SHASTA, Arrays.asList(alice));

        AliasEntry loaded = loader.loadUser(NetType.SHASTA).find("ALICE", AliasType.ACCOUNT);
        assertNotNull(loaded);
        assertEquals("hot", loaded.getNote());
        assertEquals(WalletApi.encode58Check(address()), WalletApi.encode58Check(loaded.getAddress()));
    }

    @Test
    public void malformedEntriesAreSkipped() throws Exception {
        writeUserFile(NetType.SHASTA, "{ \"entries\": ["
                + "{\"name\":\"OK\",\"type\":\"TOKEN\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\",\"decimals\":6},"
                + "{\"name\":\"1bad\",\"type\":\"TOKEN\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
                + "{\"name\":\"trx\",\"type\":\"ACCOUNT\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
                + "{\"name\":\"NoType\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
                + "{\"name\":\"BadType\",\"type\":\"NFT\",\"address\":\"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t\"},"
                + "{\"name\":\"BadAddr\",\"type\":\"TOKEN\",\"address\":\"not-base58\"}"
                + "] }");

        AliasStore store = loader.loadUser(NetType.SHASTA);

        assertNotNull(store.find("OK", AliasType.TOKEN));
        assertNull(store.find("1bad", AliasType.TOKEN));
        assertNull(store.find("trx", AliasType.ACCOUNT));
        assertNull(store.find("NoType", AliasType.TOKEN));
        assertNull(store.find("BadType", AliasType.TOKEN));
        assertNull(store.find("BadAddr", AliasType.TOKEN));
        assertEquals(1, store.listAll().size());
    }

    @Test
    public void malformedUserFileLoadsAsEmpty() throws Exception {
        writeUserFile(NetType.SHASTA, "{ broken json");

        AliasStore store = loader.loadUser(NetType.SHASTA);

        assertEquals(0, store.listAll().size());
    }

    @Test
    public void malformedUserFileThrowsForStrictLoad() throws Exception {
        writeUserFile(NetType.SHASTA, "{ broken json");

        try {
            loader.loadUserOrThrow(NetType.SHASTA);
            fail("Expected malformed user alias file to fail strict load");
        } catch (IOException e) {
            assertNotNull(e.getMessage());
        }
    }

    @Test
    public void layeredLoadKeepsBuiltinsAuthoritative() throws Exception {
        writeUserFile(NetType.MAIN, "{ \"entries\": ["
                + "{\"name\":\"USDT\",\"type\":\"ACCOUNT\",\"address\":\"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL\"},"
                + "{\"name\":\"ALICE\",\"type\":\"ACCOUNT\",\"address\":\"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL\"}"
                + "] }");

        AliasStore store = loader.loadLayered(NetType.MAIN);

        AliasEntry usdt = store.find("USDT", AliasType.TOKEN);
        assertNotNull(usdt);
        assertEquals("builtin", usdt.getSource());
        assertNull(store.find("USDT", AliasType.ACCOUNT));
        assertNotNull(store.find("ALICE", AliasType.ACCOUNT));
    }

    private byte[] address() {
        return WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
    }

    private void writeUserFile(NetType network, String json) throws IOException {
        File file = loader.userFile(network);
        File dir = file.getParentFile();
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Could not create alias directory: " + dir);
        }
        FileWriter writer = new FileWriter(file);
        try {
            writer.write(json);
        } finally {
            writer.close();
        }
    }
}
