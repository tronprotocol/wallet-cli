import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigLoader, NetworkRegistry } from "./index.js";
import { CONFIG_DEFAULTS } from "../../../application/contracts/config-defaults.js";

function envWithConfig(yaml: string, mode?: number): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), "wcli-config-"));
  const path = join(root, "config.yaml");
  writeFileSync(path, yaml);
  if (mode !== undefined) chmodSync(path, mode);
  return { ...process.env, WALLET_CLI_HOME: root };
}

describe("ConfigLoader defaults", () => {
  it("applies the application defaults when config.yaml sets none", () => {
    const config = ConfigLoader.load(envWithConfig(""));
    expect({
      defaultNetwork: config.defaultNetwork,
      defaultOutput: config.defaultOutput,
      timeoutMs: config.timeoutMs,
    }).toEqual(CONFIG_DEFAULTS);
  });
});

describe("ConfigLoader defaultNetwork", () => {
  it("loads explicit defaultNetwork", () => {
    const config = ConfigLoader.load(envWithConfig("defaultNetwork: base\n"));
    expect(config.defaultNetwork).toBe("base");
  });

  it("resolveDefault resolves a canonical network id", () => {
    const config = ConfigLoader.load(envWithConfig("defaultNetwork: tron:3448148188\n"));
    const registry = new NetworkRegistry(config);
    expect(registry.resolveDefault().id).toBe("tron:3448148188");
  });

  it("rejects a name that is in neither the builtin table nor the alias book", () => {
    const registry = new NetworkRegistry(ConfigLoader.load(envWithConfig("")));
    expect(() => registry.resolve("not-a-network")).toThrow(/unknown network/);
  });
});

describe("ConfigLoader waitTimeoutMs", () => {
  it("loads a file that still sets the removed key and ignores it", () => {
    const config = ConfigLoader.load(envWithConfig("waitTimeoutMs: 5000\ntimeoutMs: 1500\n"));
    expect(config.timeoutMs).toBe(1500);
    expect(config).not.toHaveProperty("waitTimeoutMs");
  });
});

describe("NetworkRegistry.resolve case-insensitivity", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it("resolves a canonical id regardless of input casing", () => {
    expect(registry().resolve("TRON:NILE").id).toBe("tron:3448148188");
  });

  it("still rejects genuinely unknown networks", () => {
    expect(() => registry().resolve("dogechain")).toThrow(/unknown network/);
  });
});

describe("ConfigLoader TronLink credentials", () => {
  const credentials = [
    "tronlinkSecretId: TEST",
    "tronlinkSecretKey: TESTTESTTEST",
    "tronlinkChannel: test",
    "",
  ].join("\n");

  it("loads credentials only from a private config file", () => {
    expect(ConfigLoader.load(envWithConfig(credentials, 0o600))).toMatchObject({
      tronlinkSecretId: "TEST",
      tronlinkSecretKey: "TESTTESTTEST",
      tronlinkChannel: "test",
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects credentials in a group/world-readable file",
    () => {
      expect(() => ConfigLoader.load(envWithConfig(credentials, 0o644))).toThrow(/mode 0600/);
    },
  );
});

describe("ConfigLoader GasFree credentials", () => {
  const credentials = ["gasfreeApiKey: TEST", "gasfreeApiSecret: TESTTESTTEST", ""].join("\n");

  it("loads credentials only from a private config file", () => {
    expect(ConfigLoader.load(envWithConfig(credentials, 0o600))).toMatchObject({
      gasfreeApiKey: "TEST",
      gasfreeApiSecret: "TESTTESTTEST",
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects credentials in a group/world-readable file",
    () => {
      expect(() => ConfigLoader.load(envWithConfig(credentials, 0o644))).toThrow(/mode 0600/);
    },
  );
});

describe("ConfigLoader B.AI configuration", () => {
  const configured = ["baiApiKey: bai_test_secret", ""].join("\n");

  it("loads the B.AI key only from a private config file", () => {
    expect(ConfigLoader.load(envWithConfig(configured, 0o600))).toMatchObject({
      baiApiKey: "bai_test_secret",
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects a B.AI key in a group/world-readable file",
    () => {
      expect(() => ConfigLoader.load(envWithConfig(configured, 0o644))).toThrow(/mode 0600/);
    },
  );
});

describe("ConfigLoader unreadable/malformed config", () => {
  it("classifies malformed YAML without echoing the file content", () => {
    const env = envWithConfig(
      [
        'gasfreeApiSecret: "SUPERSECRET123"',
        'defaultNetwork: "unterminated',
        "  bad: [1,2",
        "",
      ].join("\n"),
      0o600,
    );

    let thrown: unknown;
    try {
      ConfigLoader.load(env);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "invalid_config", kind: "usage" });
    expect((thrown as Error).message).toMatch(/not valid YAML/);
    expect((thrown as Error).message).not.toContain("SUPERSECRET123");
    expect((thrown as Error).message).not.toContain("bad: [1,2");
  });

  it("classifies a config path that cannot be read as a file", () => {
    // A directory stays unreadable as a file even when tests run as root.
    const root = mkdtempSync(join(tmpdir(), "wcli-config-"));
    mkdirSync(join(root, "config.yaml"));

    expect(() => ConfigLoader.load({ ...process.env, WALLET_CLI_HOME: root })).toThrow(
      /cannot be read/,
    );
  });
});

describe("builtin EVM networks", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it.each([
    ["eip155:1", "1"],
    ["eip155:11155111", "11155111"],
    ["eip155:56", "56"],
    ["eip155:97", "97"],
    ["eip155:8453", "8453"],
    ["eip155:84532", "84532"],
  ])("resolves %s as an evm-gas network", (id, chainId) => {
    const net = registry().resolve(id);
    expect(net).toMatchObject({ id, family: "evm", chainId, feeModel: "evm-gas" });
  });

  it("ships every EVM network with a usable endpoint", () => {
    for (const id of [
      "eip155:1",
      "eip155:11155111",
      "eip155:56",
      "eip155:97",
      "eip155:8453",
      "eip155:84532",
    ]) {
      expect(registry().resolve(id).httpEndpoint).toMatch(/^https:\/\//);
    }
  });

  it("pairs Base mainnet with its builtin testnet and alias", () => {
    const testnet = registry().resolve("base-sepolia");
    expect(testnet).toMatchObject({
      id: "eip155:84532",
      chainId: "84532",
      testnet: true,
      httpEndpoint: "https://sepolia.base.org",
    });
    expect(registry().resolve("base").testnet).not.toBe(true);
  });

  it("keeps the TRON networks unchanged", () => {
    expect(registry().resolve("tron:3448148188")).toMatchObject({
      family: "tron",
      nativeSymbol: "TRX",
      feeModel: "tron-resource",
    });
  });
});

describe("network alias book", () => {
  const registry = (yaml = "") => new NetworkRegistry(ConfigLoader.load(envWithConfig(yaml)));

  it.each([
    ["tron", "tron:728126428"],
    ["nile", "tron:3448148188"],
    ["shasta", "tron:2494104990"],
    ["ethereum", "eip155:1"],
    ["sepolia", "eip155:11155111"],
    ["bsc", "eip155:56"],
    ["bsc-testnet", "eip155:97"],
  ])("resolves the builtin alias %s to %s", (alias, id) => {
    expect(registry().resolve(alias).id).toBe(id);
  });

  it("resolves an alias regardless of casing, like a canonical id", () => {
    expect(registry().resolve("SEPOLIA").id).toBe("eip155:11155111");
  });

  it("has no `evm` alias — EVM is not a chain, so it has no mainnet to claim the family name", () => {
    expect(() => registry().resolve("evm")).toThrow(/unknown network/);
  });

  it("lets a user add an alias for a network they configured", () => {
    const yaml = [
      "networks:",
      "  evm:137:",
      "    family: evm",
      '    chainId: "137"',
      "    nativeSymbol: MATIC",
      "    httpEndpoint: https://polygon.example",
      "aliases:",
      "  polygon: evm:137",
    ].join("\n");
    expect(registry(yaml).resolve("polygon").id).toBe("evm:137");
  });

  it("prefers a canonical id over a book entry that shadows it", () => {
    const yaml = ["aliases:", "  eip155:1: tron:3448148188"].join("\n");
    expect(registry(yaml).resolve("eip155:1").id).toBe("eip155:1");
  });

  it("still rejects an unknown alias", () => {
    expect(() => registry().resolve("dogechain")).toThrow(/unknown network/);
  });
});

describe("network keys in config.yaml are normalised to canonical ids", () => {
  const load = (yaml: string) => ConfigLoader.load(envWithConfig(yaml));

  it("applies an alias-keyed entry to the canonical network", () => {
    const config = load(
      ["networks:", "  sepolia:", "    httpEndpoint: https://mine.example"].join("\n"),
    );

    expect(config.networks["eip155:11155111"]!.httpEndpoint).toBe("https://mine.example");
    expect(config.networks["sepolia"]).toBeUndefined();
  });

  it("keeps the rest of the builtin descriptor when merging an alias-keyed entry", () => {
    const config = load(
      ["networks:", "  nile:", "    httpEndpoint: https://mine.example"].join("\n"),
    );

    expect(config.networks["tron:3448148188"]).toMatchObject({
      id: "tron:3448148188",
      family: "tron",
      nativeSymbol: "TRX",
      httpEndpoint: "https://mine.example",
    });
  });

  it("refuses a file that configures one network under both names", () => {
    const yaml = [
      "networks:",
      "  sepolia:",
      "    httpEndpoint: https://one.example",
      "  eip155:11155111:",
      "    httpEndpoint: https://two.example",
    ].join("\n");

    expect(() => load(yaml)).toThrow(/sepolia.*eip155:11155111|eip155:11155111.*sepolia/);
  });

  it("leaves an unrecognised key alone so a user-defined network still works", () => {
    const config = load(
      [
        "networks:",
        "  evm:137:",
        "    family: evm",
        '    chainId: "137"',
        "    nativeSymbol: MATIC",
      ].join("\n"),
    );

    expect(config.networks["evm:137"]).toMatchObject({ id: "evm:137", family: "evm" });
  });
});

describe("a dangling alias reports what it points at", () => {
  it("names the alias AND its unresolvable target", () => {
    const registry = new NetworkRegistry(
      ConfigLoader.load(envWithConfig(["aliases:", "  polygon: evm:99999"].join("\n"))),
    );

    expect(() => registry.resolve("polygon")).toThrow(/polygon.*evm:99999/);
  });

  it("still reports a plain unknown name without inventing a target", () => {
    const registry = new NetworkRegistry(ConfigLoader.load(envWithConfig("")));
    expect(() => registry.resolve("dogechain")).toThrow(/unknown network: dogechain/);
  });
});

describe("the effective config exposes the alias book", () => {
  it("lists aliases so a user can see what a short name resolves to", () => {
    const config = ConfigLoader.load(envWithConfig(""));
    expect(config.aliases).toMatchObject({ sepolia: "eip155:11155111", nile: "tron:3448148188" });
  });
});

describe("each network declares its own native coin", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it.each([
    ["tron:728126428", "TRX"],
    ["tron:3448148188", "TRX"],
    ["tron:2494104990", "TRX"],
    ["eip155:1", "ETH"],
    ["eip155:11155111", "ETH"],
    ["eip155:56", "BNB"],
    ["eip155:97", "BNB"],
  ])("%s uses %s", (id, symbol) => {
    expect(registry().resolve(id).nativeSymbol).toBe(symbol);
  });

  it("distinguishes two networks of the SAME family", () => {
    const r = registry();
    expect(r.resolve("eip155:1").family).toBe(r.resolve("eip155:56").family);
    expect(r.resolve("eip155:1").nativeSymbol).not.toBe(r.resolve("eip155:56").nativeSymbol);
  });
});

describe("a hand-added network is validated at load", () => {
  const load = (yaml: string) => ConfigLoader.load(envWithConfig(yaml));
  const custom = (extra: string[]) =>
    ["networks:", "  evm:137:", ...extra.map((l) => `    ${l}`)].join("\n");

  it("accepts a complete definition", () => {
    const net = load(custom(["family: evm", 'chainId: "137"', "nativeSymbol: MATIC"])).networks[
      "evm:137"
    ]!;
    expect(net).toMatchObject({ family: "evm", chainId: "137", nativeSymbol: "MATIC" });
  });

  it("defaults capabilities to none rather than leaving it undefined", () => {
    expect(
      load(custom(["family: evm", 'chainId: "137"', "nativeSymbol: MATIC"])).networks["evm:137"]!
        .capabilities,
    ).toEqual([]);
  });

  it.each([
    ["family", ['chainId: "137"', "nativeSymbol: MATIC"]],
    ["chainId", ["family: evm", "nativeSymbol: MATIC"]],
    ["nativeSymbol", ["family: evm", 'chainId: "137"']],
  ])("refuses a definition missing %s, naming the field", (field, present) => {
    expect(() => load(custom(present))).toThrow(new RegExp(`evm:137[\\s\\S]*${field}`));
  });

  it("refuses a family it does not implement", () => {
    expect(() => load(custom(["family: solana", 'chainId: "1"', "nativeSymbol: SOL"]))).toThrow(
      /solana/,
    );
  });

  it("lets a builtin be partially overridden", () => {
    const net = load(
      ["networks:", "  eip155:11155111:", "    httpEndpoint: https://mine.example"].join("\n"),
    ).networks["eip155:11155111"]!;
    expect(net).toMatchObject({ nativeSymbol: "ETH", httpEndpoint: "https://mine.example" });
  });
});

describe("ConfigLoader network API key", () => {
  const withKey = [
    "networks:",
    "  tron:3448148188:",
    "    httpEndpoint: https://nile.trongrid.io",
    "    apiKeyHeader: TRON-PRO-API-KEY",
    "    apiKey: TESTTESTTEST",
    "",
  ].join("\n");

  it("loads the pair from a private config file", () => {
    const config = ConfigLoader.load(envWithConfig(withKey, 0o600));
    expect(config.networks["tron:3448148188"]).toMatchObject({
      apiKeyHeader: "TRON-PRO-API-KEY",
      apiKey: "TESTTESTTEST",
    });
  });

  it.runIf(process.platform !== "win32")(
    "rejects a network API key in a group/world-readable file",
    () => {
      expect(() => ConfigLoader.load(envWithConfig(withKey, 0o644))).toThrow(/mode 0600/);
    },
  );

  it("leaves a file without any credential unrestricted", () => {
    const noKey = ["networks:", "  tron:3448148188:", "    apiKeyHeader: X-Api-Key", ""].join("\n");
    expect(() => ConfigLoader.load(envWithConfig(noKey, 0o644))).not.toThrow();
  });
});

describe("alias targets are normalised to canonical ids", () => {
  it("follows a target that is itself an alias", () => {
    const config = ConfigLoader.load(envWithConfig("aliases:\n  mynile: nile\n"));
    expect(config.aliases.mynile).toBe("tron:3448148188");
    expect(new NetworkRegistry(config).resolve("mynile").id).toBe("tron:3448148188");
  });

  it("leaves a target that is already canonical alone", () => {
    const config = ConfigLoader.load(envWithConfig("aliases:\n  mynile: tron:3448148188\n"));
    expect(config.aliases.mynile).toBe("tron:3448148188");
  });

  it("does not let a config entry keyed on a canonical id redirect a builtin alias", () => {
    const config = ConfigLoader.load(
      envWithConfig("aliases:\n  tron:3448148188: tron:728126428\n"),
    );
    expect(config.aliases.nile).toBe("tron:3448148188");
    expect(new NetworkRegistry(config).resolve("nile").id).toBe("tron:3448148188");
    expect(new NetworkRegistry(config).resolve("tron:nile").id).toBe("tron:3448148188");
  });
});

describe("ConfigLoader sunswap network block", () => {
  const tronNetwork = (config: ReturnType<typeof ConfigLoader.load>, id: string) =>
    config.networks[id] as {
      sunswap?: { marketApiBaseUrl?: string; routerApiBaseUrl?: string; liquidity?: boolean };
      sunpump?: { curve?: boolean; apiBaseUrl?: string };
    };

  it("ships the market API on mainnet and nowhere else", () => {
    const config = ConfigLoader.load(envWithConfig(""));
    expect(tronNetwork(config, "tron:728126428").sunswap?.marketApiBaseUrl).toBe(
      "https://open.sun.io",
    );
    expect(tronNetwork(config, "tron:3448148188").sunswap?.marketApiBaseUrl).toBeUndefined();
    expect(tronNetwork(config, "tron:2494104990").sunswap).toBeUndefined();
  });

  it("lets config.yaml add the market API to another network", () => {
    const config = ConfigLoader.load(
      envWithConfig(
        "networks:\n  nile:\n    sunswap:\n      marketApiBaseUrl: https://nile.example.test\n",
      ),
    );
    expect(tronNetwork(config, "tron:3448148188").sunswap?.marketApiBaseUrl).toBe(
      "https://nile.example.test",
    );
  });

  it("merges the user's sunswap and sunpump fields over the builtin blocks", () => {
    const config = ConfigLoader.load(
      envWithConfig(
        "networks:\n  tron:\n    sunswap:\n      routerApiBaseUrl: https://router.example.test\n    sunpump:\n      curve: false\n  nile:\n    sunswap:\n      routerApiBaseUrl: https://router.example.test\n",
      ),
    );
    expect(tronNetwork(config, "tron:728126428").sunswap).toEqual({
      marketApiBaseUrl: "https://open.sun.io",
      routerApiBaseUrl: "https://router.example.test",
      liquidity: true,
    });
    expect(tronNetwork(config, "tron:728126428").sunpump).toEqual({
      curve: false,
      apiBaseUrl: "https://api-v2.sunpump.meme/pump-api",
    });
    expect(tronNetwork(config, "tron:3448148188").sunswap).toEqual({
      routerApiBaseUrl: "https://router.example.test",
      liquidity: true,
    });
  });

  it("rejects a base URL that is not http(s)", () => {
    expect(() =>
      ConfigLoader.load(
        envWithConfig("networks:\n  tron:\n    sunswap:\n      marketApiBaseUrl: open.sun.io\n"),
      ),
    ).toThrow(/invalid sunswap\.marketApiBaseUrl/);
    expect(() =>
      ConfigLoader.load(
        envWithConfig(
          "networks:\n  tron:\n    sunswap:\n      routerApiBaseUrl: ftp://open.sun.io\n",
        ),
      ),
    ).toThrow(/invalid sunswap\.routerApiBaseUrl/);
  });

  it("rejects a switch that is not true or false", () => {
    expect(() =>
      ConfigLoader.load(
        envWithConfig("networks:\n  nile:\n    sunswap:\n      liquidity: 'yes'\n"),
      ),
    ).toThrow(/invalid sunswap\.liquidity: expected true or false/);
    expect(() =>
      ConfigLoader.load(envWithConfig("networks:\n  nile:\n    sunpump:\n      curve: 1\n")),
    ).toThrow(/invalid sunpump\.curve: expected true or false/);
  });

  it("rejects a sunpump base URL that is not http(s)", () => {
    expect(() =>
      ConfigLoader.load(
        envWithConfig("networks:\n  tron:\n    sunpump:\n      apiBaseUrl: htp://x\n"),
      ),
    ).toThrow(/invalid sunpump\.apiBaseUrl/);
  });

  it("rejects the retired address fields, naming the switch that replaces each", () => {
    expect(() =>
      ConfigLoader.load(
        envWithConfig(
          "networks:\n  nile:\n    sunswap:\n      contracts:\n        v2Router: TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy\n",
        ),
      ),
    ).toThrow(/sunswap\.contracts, which is no longer read: .*sunswap\.liquidity: true/);
    expect(() =>
      ConfigLoader.load(
        envWithConfig(
          "networks:\n  nile:\n    sunpump:\n      launchpad: TLtTyEwqacNKc5CHLunKvxmqLB336R4Lrm\n",
        ),
      ),
    ).toThrow(/sunpump\.launchpad, which is no longer read: .*sunpump\.curve: true/);
  });

  it("accepts a well-formed block", () => {
    const config = ConfigLoader.load(
      envWithConfig(
        "networks:\n  nile:\n    sunswap:\n      routerApiBaseUrl: https://router.example.test\n      liquidity: true\n    sunpump:\n      curve: true\n",
      ),
    );
    expect(tronNetwork(config, "tron:3448148188").sunswap).toEqual({
      routerApiBaseUrl: "https://router.example.test",
      liquidity: true,
    });
    expect(tronNetwork(config, "tron:3448148188").sunpump).toEqual({ curve: true });
  });

  it("ships liquidity on both TRON networks, and the market API on mainnet only", () => {
    const config = ConfigLoader.load(envWithConfig(""));
    const mainnet = tronNetwork(config, "tron:728126428").sunswap;
    const nile = tronNetwork(config, "tron:3448148188").sunswap;
    expect(mainnet?.liquidity).toBe(true);
    expect(nile).toEqual({ liquidity: true });
  });

  it("ships no SunPump block on Nile", () => {
    const config = ConfigLoader.load(envWithConfig(""));
    expect(tronNetwork(config, "tron:3448148188").sunpump).toBeUndefined();
    expect(tronNetwork(config, "tron:728126428").sunpump?.curve).toBe(true);
  });

  it("rejects a sunswap block that is not a mapping", () => {
    expect(() =>
      ConfigLoader.load(envWithConfig("networks:\n  tron:\n    sunswap: https://open.sun.io\n")),
    ).toThrow(/invalid sunswap/);
  });

  it("rejects an empty sunswap or sunpump key over a builtin block", () => {
    expect(() => ConfigLoader.load(envWithConfig("networks:\n  nile:\n    sunswap:\n"))).toThrow(
      /invalid sunswap/,
    );
    expect(() => ConfigLoader.load(envWithConfig("networks:\n  tron:\n    sunpump:\n"))).toThrow(
      /invalid sunpump/,
    );
  });

  it("turns a builtin feature off only with an explicit false", () => {
    const config = ConfigLoader.load(
      envWithConfig("networks:\n  nile:\n    sunswap:\n      liquidity: false\n"),
    );
    expect(tronNetwork(config, "tron:3448148188").sunswap).toEqual({ liquidity: false });
  });

  it("keeps the builtin block when the user's block is an empty mapping", () => {
    const config = ConfigLoader.load(envWithConfig("networks:\n  tron:\n    sunswap: {}\n"));
    expect(tronNetwork(config, "tron:728126428").sunswap).toEqual({
      marketApiBaseUrl: "https://open.sun.io",
      routerApiBaseUrl: "https://open.sun.io/apiv2/quote/swap",
      liquidity: true,
    });
  });

  it("takes the user's block as written on a network with no builtin one", () => {
    const config = ConfigLoader.load(
      envWithConfig(
        "networks:\n  shasta:\n    sunswap:\n      liquidity: true\n    sunpump:\n      curve: true\n",
      ),
    );
    expect(tronNetwork(config, "tron:2494104990").sunswap).toEqual({ liquidity: true });
    expect(tronNetwork(config, "tron:2494104990").sunpump).toEqual({ curve: true });
  });

  it("merges under a canonical id key the same as under an alias", () => {
    const config = ConfigLoader.load(
      envWithConfig(
        'networks:\n  "tron:3448148188":\n    sunswap:\n      routerApiBaseUrl: https://router.example.test\n',
      ),
    );
    expect(tronNetwork(config, "tron:3448148188").sunswap).toEqual({
      routerApiBaseUrl: "https://router.example.test",
      liquidity: true,
    });
  });

  it("still refuses a retired field merged over a builtin block", () => {
    expect(() =>
      ConfigLoader.load(
        envWithConfig(
          "networks:\n  tron:\n    sunpump:\n      launchpad: TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw\n",
        ),
      ),
    ).toThrow(/sunpump\.launchpad, which is no longer read/);
  });

  it("leaves the builtin blocks untouched for the next load", () => {
    ConfigLoader.load(
      envWithConfig(
        "networks:\n  tron:\n    sunswap:\n      liquidity: false\n    sunpump:\n      curve: false\n",
      ),
    );
    const config = ConfigLoader.load(envWithConfig(""));
    expect(tronNetwork(config, "tron:728126428").sunswap?.liquidity).toBe(true);
    expect(tronNetwork(config, "tron:728126428").sunpump?.curve).toBe(true);
  });
});

describe("ConfigLoader permission check covers every credential key", () => {
  it.each([
    "tronlinkSecretId",
    "tronlinkSecretKey",
    "gasfreeApiKey",
    "gasfreeApiSecret",
    "baiApiKey",
  ])("refuses a group-readable file that holds only %s", (key) => {
    expect(() => ConfigLoader.load(envWithConfig(`${key}: fake-credential\n`, 0o644))).toThrowError(
      expect.objectContaining({ code: "insecure_config" }),
    );
  });

  it("refuses a group-readable file that holds only a network apiKey", () => {
    const yaml = "networks:\n  tron:3448148188:\n    apiKey: fake-credential\n";
    expect(() => ConfigLoader.load(envWithConfig(yaml, 0o644))).toThrowError(
      expect.objectContaining({ code: "insecure_config" }),
    );
  });
});

describe("ConfigLoader applies the config set rules", () => {
  it.each(["-1", "0.5", ".inf", "'5000'", "2147483648"])(
    "ignores timeoutMs %s and keeps the default",
    (v) => {
      expect(ConfigLoader.load(envWithConfig(`timeoutMs: ${v}\n`)).timeoutMs).toBe(90000);
    },
  );

  it.each([0, 1, 1500, 2147483647])("keeps a valid timeoutMs %s", (v) => {
    expect(ConfigLoader.load(envWithConfig(`timeoutMs: ${v}\n`)).timeoutMs).toBe(v);
  });

  it.each([
    ["httpEndpoint", "ftp://node.invalid"],
    ["apiKeyHeader", "X-Key: injected"],
  ])("rejects a network %s that config set would refuse", (field, value) => {
    const yaml = `networks:\n  tron:3448148188:\n    ${field}: "${value}"\n`;
    expect(() => ConfigLoader.load(envWithConfig(yaml))).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("rejects a network apiKey with control characters without echoing it", () => {
    const yaml = 'networks:\n  tron:3448148188:\n    apiKey: "fake\\u0001key"\n';
    let error: unknown;
    try {
      ConfigLoader.load(envWithConfig(yaml, 0o600));
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ code: "invalid_value" });
    expect(String((error as Error).message)).not.toContain("fake");
  });

  it("trims a hand-edited header name as config set does", () => {
    const yaml = 'networks:\n  tron:3448148188:\n    apiKeyHeader: " X-Key "\n';
    const config = ConfigLoader.load(envWithConfig(yaml));
    expect(config.networks["tron:3448148188"]!.apiKeyHeader).toBe("X-Key");
  });
});
