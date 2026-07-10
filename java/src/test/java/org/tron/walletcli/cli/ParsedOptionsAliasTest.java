package org.tron.walletcli.cli;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import org.tron.walletcli.cli.aliases.AliasEntry;
import org.tron.walletcli.cli.aliases.AliasResolver;
import org.tron.walletcli.cli.aliases.AliasStore;
import org.tron.walletserver.WalletApi;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

public class ParsedOptionsAliasTest {

    @Test
    public void contractAddressUsesTokenAliases() {
        byte[] address = WalletApi.decodeFromBase58Check("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
        AliasStore store = new AliasStore(Collections.singletonList(
                AliasEntry.token("USDT", address, 6, "builtin")));
        Map<String, String> values = new HashMap<String, String>();
        values.put("contract", "usdt");
        ParsedOptions opts = new ParsedOptions(values, new AliasResolver(store));
        assertEquals(WalletApi.encode58Check(address),
                WalletApi.encode58Check(opts.getContractAddress("contract")));
    }

    @Test
    public void accountAddressUsesAccountAliases() {
        byte[] address = WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
        AliasStore store = new AliasStore(Collections.singletonList(
                AliasEntry.account("alice", address, "user", null)));
        Map<String, String> values = new HashMap<String, String>();
        values.put("address", "alice");
        ParsedOptions opts = new ParsedOptions(values, new AliasResolver(store));
        assertEquals(WalletApi.encode58Check(address),
                WalletApi.encode58Check(opts.getAccountAddress("address")));
        assertEquals(1, opts.getResolutionLog().size());
    }

    @Test
    public void legacyGetAddressDoesNotResolveAliases() {
        byte[] address = WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
        AliasStore store = new AliasStore(Collections.singletonList(
                AliasEntry.account("alice", address, "user", null)));
        Map<String, String> values = new HashMap<String, String>();
        values.put("address", "alice");
        ParsedOptions opts = new ParsedOptions(values, new AliasResolver(store));
        try {
            opts.getAddress("address");
            fail("Expected getAddress to require a raw Base58Check address");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }

    @Test
    public void legacyGetAddressStillAcceptsRawBase58Address() {
        String raw = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
        Map<String, String> values = new HashMap<String, String>();
        values.put("address", raw);
        ParsedOptions opts = new ParsedOptions(values, new AliasResolver(AliasStore.empty()));
        assertEquals(raw, WalletApi.encode58Check(opts.getAddress("address")));
    }
}
