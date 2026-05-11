package org.tron.walletcli.cli.aliases;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class AliasEntryTest {

    private byte[] addr() {
        byte[] a = new byte[21];
        a[0] = 0x41;
        return a;
    }

    @Test
    public void nameIsUpperCasedAndTrimmed() {
        AliasEntry e = AliasEntry.token(" usdt ", addr(), 6, "builtin");
        assertEquals("USDT", e.getName());
    }

    @Test
    public void accountKeepsCaseFolded() {
        AliasEntry e = AliasEntry.account(" Alice ", addr(), "user", "hot wallet");
        assertEquals("ALICE", e.getName());
        assertEquals("hot wallet", e.getNote());
    }

    @Test
    public void addressIsCopiedDefensively() {
        byte[] a = addr();
        AliasEntry e = AliasEntry.token("USDT", a, 6, "builtin");
        a[0] = 0x00;
        assertEquals(0x41, e.getAddress()[0]);
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsWrongAddressLength() {
        AliasEntry.token("USDT", new byte[20], 6, "builtin");
    }
}
