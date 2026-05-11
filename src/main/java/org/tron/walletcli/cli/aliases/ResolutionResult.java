package org.tron.walletcli.cli.aliases;

import java.util.LinkedHashMap;
import java.util.Map;
import org.tron.walletserver.WalletApi;

public final class ResolutionResult {

    private final String option;
    private final String input;
    private final byte[] address;
    private final String name;
    private final AliasType type;
    private final String source;

    public ResolutionResult(String option, String input, byte[] address,
                            String name, AliasType type, String source) {
        this.option = option;
        this.input = input;
        this.address = address == null ? null : address.clone();
        this.name = name;
        this.type = type;
        this.source = source;
    }

    public String getOption() {
        return option;
    }

    public String getInput() {
        return input;
    }

    public byte[] getAddress() {
        return address == null ? null : address.clone();
    }

    public String getAddressBase58() {
        return address == null ? null : WalletApi.encode58Check(address);
    }

    public String getName() {
        return name;
    }

    public AliasType getType() {
        return type;
    }

    public String getSource() {
        return source;
    }

    public boolean isAliasHit() {
        return name != null;
    }

    public Map<String, Object> toJsonMap() {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        map.put("option", option);
        map.put("input", input);
        map.put("address", getAddressBase58());
        if (name != null) {
            map.put("name", name);
        }
        if (type != null) {
            map.put("type", type.name());
        }
        if (source != null) {
            map.put("source", source);
        }
        return map;
    }
}
