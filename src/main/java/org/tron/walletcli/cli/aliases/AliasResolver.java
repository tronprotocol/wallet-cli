package org.tron.walletcli.cli.aliases;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.bouncycastle.util.encoders.Hex;
import org.tron.walletserver.WalletApi;

public final class AliasResolver {

    public interface Listener {
        void resolved(ResolutionResult result);
    }

    private final AliasStore store;
    private final Listener listener;
    private final List<ResolutionResult> resolved = new ArrayList<ResolutionResult>();

    public AliasResolver(AliasStore store) {
        this(store, null);
    }

    public AliasResolver(AliasStore store, Listener listener) {
        this.store = store == null ? AliasStore.empty() : store;
        this.listener = listener;
    }

    public ResolutionResult resolve(String option, String input, AliasType expectedType) {
        if (input == null) {
            throw new AliasResolutionException("Missing required option: --" + option);
        }
        byte[] direct = decodeAddress(input);
        if (direct != null) {
            return new ResolutionResult(option, input, direct, null, null, null);
        }

        AliasEntry entry = store.find(input, expectedType);
        if (entry == null) {
            throw new AliasResolutionException("Invalid TRON address or unknown "
                    + expectedTypeName(expectedType) + " alias for --" + option + ": " + input);
        }
        ResolutionResult result = new ResolutionResult(
                option, input, entry.getAddress(), entry.getName(), entry.getType(), entry.getSource());
        resolved.add(result);
        if (listener != null) {
            listener.resolved(result);
        }
        return result;
    }

    public List<ResolutionResult> getResolved() {
        return Collections.unmodifiableList(resolved);
    }

    public AliasStore getStore() {
        return store;
    }

    public static byte[] decodeAddress(String input) {
        String t = input == null ? null : input.trim();
        if (t == null || t.isEmpty()) {
            return null;
        }
        byte[] base58;
        try {
            base58 = WalletApi.decodeFromBase58Check(t);
        } catch (RuntimeException e) {
            base58 = null;
        }
        if (base58 != null) {
            return base58;
        }
        String hex = null;
        if (t.matches("41[0-9a-fA-F]{40}")) {
            hex = t;
        } else if (t.matches("0x[0-9a-fA-F]{40}")) {
            hex = "41" + t.substring(2);
        }
        if (hex == null) {
            return null;
        }
        byte[] decoded = Hex.decode(hex);
        return decoded.length == 21 ? decoded : null;
    }

    private static String expectedTypeName(AliasType expectedType) {
        if (expectedType == AliasType.TOKEN) {
            return "token";
        }
        if (expectedType == AliasType.ACCOUNT) {
            return "account";
        }
        return "address";
    }
}
