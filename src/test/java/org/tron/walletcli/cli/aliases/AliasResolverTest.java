package org.tron.walletcli.cli.aliases;

import java.util.Arrays;
import org.junit.Test;
import org.tron.walletserver.WalletApi;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class AliasResolverTest {

    private byte[] addr() {
        return WalletApi.decodeFromBase58Check("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    }

    @Test
    public void directAddressPassesThroughWithoutRecordingAlias() {
        AliasResolver resolver = new AliasResolver(AliasStore.empty());
        ResolutionResult result = resolver.resolve(
                "to", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", AliasType.ACCOUNT);
        assertNotNull(result.getAddress());
        assertEquals(0, resolver.getResolved().size());
    }

    @Test
    public void tokenAliasResolvesAndIsRecorded() {
        AliasStore store = new AliasStore(Arrays.asList(
                AliasEntry.token("USDT", addr(), 6, "builtin")));
        AliasResolver resolver = new AliasResolver(store);
        ResolutionResult result = resolver.resolve("contract", "usdt", AliasType.TOKEN);
        assertEquals("USDT", result.getName());
        assertEquals(1, resolver.getResolved().size());
    }

    @Test(expected = AliasResolutionException.class)
    public void wrongTypeDoesNotResolve() {
        AliasStore store = new AliasStore(Arrays.asList(
                AliasEntry.token("USDT", addr(), 6, "builtin")));
        new AliasResolver(store).resolve("to", "usdt", AliasType.ACCOUNT);
    }
}
