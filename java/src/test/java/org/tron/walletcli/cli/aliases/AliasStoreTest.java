package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

public class AliasStoreTest {

    private byte[] addr(int last) {
        byte[] a = new byte[21];
        a[0] = 0x41;
        a[20] = (byte) last;
        return a;
    }

    @Test
    public void findIsCaseInsensitiveAndTypeFiltered() {
        AliasStore store = new AliasStore(Arrays.asList(
                AliasEntry.token("USDT", addr(1), 6, "builtin")));
        assertNotNull(store.find("usdt", AliasType.TOKEN));
        assertNull(store.find("usdt", AliasType.ACCOUNT));
    }

    @Test
    public void builtinsWinWhenLayered() {
        AliasStore builtin = new AliasStore(Arrays.asList(
                AliasEntry.token("USDT", addr(1), 6, "builtin")));
        AliasStore user = new AliasStore(Arrays.asList(
                AliasEntry.account("usdt", addr(2), "user", null),
                AliasEntry.account("alice", addr(3), "user", null)));
        AliasStore layered = AliasStore.layered(builtin, user);
        assertEquals("builtin", layered.find("USDT", AliasType.TOKEN).getSource());
        assertNotNull(layered.find("alice", AliasType.ACCOUNT));
        assertEquals(2, layered.listAll().size());
    }
}
