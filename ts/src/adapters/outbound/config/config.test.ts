import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigLoader, NetworkRegistry } from "./index.js";

function envWithConfig(yaml: string, mode?: number): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), "wcli-config-"));
  const path = join(root, "config.yaml");
  writeFileSync(path, yaml);
  if (mode !== undefined) chmodSync(path, mode);
  return { ...process.env, WALLET_CLI_HOME: root };
}

describe("ConfigLoader defaultNetwork", () => {
  it("loads explicit defaultNetwork", () => {
    const config = ConfigLoader.load(envWithConfig("defaultNetwork: base\n"));
    expect(config.defaultNetwork).toBe("base");
  });

  it("resolveDefault resolves a canonical network id", () => {
    const config = ConfigLoader.load(envWithConfig("defaultNetwork: tron:nile\n"));
    const registry = new NetworkRegistry(config);
    expect(registry.resolveDefault().id).toBe("tron:nile");
  });

  it("does not resolve hidden-family networks (EVM is not currently exposed)", () => {
    const registry = new NetworkRegistry(ConfigLoader.load(envWithConfig("")));
    expect(() => registry.resolve("base")).toThrow(/unknown network/);
  });
});

describe("ConfigLoader waitTimeoutMs validation", () => {
  it("accepts a valid non-negative integer", () => {
    expect(ConfigLoader.load(envWithConfig("waitTimeoutMs: 5000\n")).waitTimeoutMs).toBe(5000);
    expect(ConfigLoader.load(envWithConfig("waitTimeoutMs: 0\n")).waitTimeoutMs).toBe(0);
  });

  it("ignores negative or fractional waitTimeoutMs and keeps the default", () => {
    // ConfigService rejects these on write; the loader must not accept them from a hand-edited file.
    expect(ConfigLoader.load(envWithConfig("waitTimeoutMs: -1\n")).waitTimeoutMs).toBe(60000);
    expect(ConfigLoader.load(envWithConfig("waitTimeoutMs: 1.5\n")).waitTimeoutMs).toBe(60000);
  });
});

describe("NetworkRegistry.resolve case-insensitivity", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it("resolves a canonical id regardless of input casing", () => {
    expect(registry().resolve("TRON:NILE").id).toBe("tron:nile");
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

// A broken config.yaml is the user's typo, not an internal fault — but the underlying errors quote
// file content (YAML parse) or OS detail, and a credential can sit on the very line that failed.
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
    // a directory named config.yaml — deterministic across platforms and irrespective of uid,
    // unlike chmod 000, which root would sail straight through.
    const root = mkdtempSync(join(tmpdir(), "wcli-config-"));
    mkdirSync(join(root, "config.yaml"));

    expect(() => ConfigLoader.load({ ...process.env, WALLET_CLI_HOME: root })).toThrow(
      /cannot be read/,
    );
  });
});

describe("builtin EVM networks", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  // §2.2: one L1 pair per chain. L2s are deliberately excluded — the evm-gas fee model computes
  // gasLimit x gasPrice and would systematically under-report cost on rollups.
  it.each([
    ["evm:1", "1"],
    ["evm:11155111", "11155111"],
    ["evm:56", "56"],
    ["evm:97", "97"],
  ])("resolves %s as an evm-gas network", (id, chainId) => {
    const net = registry().resolve(id);
    expect(net).toMatchObject({ id, family: "evm", chainId, feeModel: "evm-gas" });
  });

  it("ships every EVM network with a usable endpoint", () => {
    for (const id of ["evm:1", "evm:11155111", "evm:56", "evm:97"]) {
      expect(registry().resolve(id).httpEndpoint).toMatch(/^https:\/\//);
    }
  });

  it("keeps the TRON networks unchanged", () => {
    expect(registry().resolve("tron:nile")).toMatchObject({
      family: "tron",
      nativeSymbol: "TRX",
      feeModel: "tron-resource",
    });
  });
});

// ADR-0010 supersedes architecture-source-of-truth.md:499 ("aliases are not accepted as network
// selectors"). Aliases now resolve, but ONLY here — everything downstream carries the canonical id.
describe("network alias book", () => {
  const registry = (yaml = "") => new NetworkRegistry(ConfigLoader.load(envWithConfig(yaml)));

  it.each([
    ["tron", "tron:mainnet"],
    ["nile", "tron:nile"],
    ["shasta", "tron:shasta"],
    ["ethereum", "evm:1"],
    ["sepolia", "evm:11155111"],
    ["bsc", "evm:56"],
    ["bsc-testnet", "evm:97"],
  ])("resolves the builtin alias %s to %s", (alias, id) => {
    expect(registry().resolve(alias).id).toBe(id);
  });

  it("resolves an alias regardless of casing, like a canonical id", () => {
    expect(registry().resolve("SEPOLIA").id).toBe("evm:11155111");
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

  // The hazard is structural, not validated against: a canonical id can never be shadowed.
  it("prefers a canonical id over a book entry that shadows it", () => {
    const yaml = ["aliases:", "  evm:1: tron:nile"].join("\n");
    expect(registry(yaml).resolve("evm:1").id).toBe("evm:1");
  });

  it("still rejects an unknown alias", () => {
    expect(() => registry().resolve("dogechain")).toThrow(/unknown network/);
  });
});

// §2.4: config.yaml has always been edited by hand, and TRON-era users wrote endpoints under the
// short name. Not recognising an alias key is the worst failure mode available here — the file
// looks configured, the setting silently does nothing, and `--network sepolia` would resolve to
// the bogus network the alias key created instead of the real one.
describe("network keys in config.yaml are normalised to canonical ids", () => {
  const load = (yaml: string) => ConfigLoader.load(envWithConfig(yaml));

  it("applies an alias-keyed entry to the canonical network", () => {
    const config = load(
      ["networks:", "  sepolia:", "    httpEndpoint: https://mine.example"].join("\n"),
    );

    expect(config.networks["evm:11155111"]!.httpEndpoint).toBe("https://mine.example");
    expect(config.networks["sepolia"]).toBeUndefined();
  });

  it("keeps the rest of the builtin descriptor when merging an alias-keyed entry", () => {
    const config = load(
      ["networks:", "  nile:", "    httpEndpoint: https://mine.example"].join("\n"),
    );

    expect(config.networks["tron:nile"]).toMatchObject({
      id: "tron:nile",
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
      "  evm:11155111:",
      "    httpEndpoint: https://two.example",
    ].join("\n");

    expect(() => load(yaml)).toThrow(/sepolia.*evm:11155111|evm:11155111.*sepolia/);
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
  // Aliases are hand-edited (there is no `config set aliases.*`), so the only way a typo'd target
  // surfaces is at resolution. "unknown network: polygon" would send the user hunting for a
  // network they never asked for, instead of at the alias entry they got wrong.
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
    expect(config.aliases).toMatchObject({ sepolia: "evm:11155111", nile: "tron:nile" });
  });
});

// The native coin's NAME belongs to the chain, not the family: evm:1 is ETH and evm:56 is BNB,
// yet both are family `evm`. Reading it off the family table renders BNB as ETH — a wallet
// naming the wrong currency.
describe("each network declares its own native coin", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it.each([
    ["tron:mainnet", "TRX"],
    ["tron:nile", "TRX"],
    ["tron:shasta", "TRX"],
    ["evm:1", "ETH"],
    ["evm:11155111", "ETH"],
    ["evm:56", "BNB"],
    ["evm:97", "BNB"],
  ])("%s uses %s", (id, symbol) => {
    expect(registry().resolve(id).nativeSymbol).toBe(symbol);
  });

  it("distinguishes two networks of the SAME family", () => {
    const r = registry();
    expect(r.resolve("evm:1").family).toBe(r.resolve("evm:56").family);
    expect(r.resolve("evm:1").nativeSymbol).not.toBe(r.resolve("evm:56").nativeSymbol);
  });
});

// A user-added network is merged with a bare `as NetworkDescriptor` cast, so a missing required
// field used to travel until something dereferenced it — `capabilities` crashed composition with
// "Cannot read properties of undefined (reading 'map')" before any command ran, reported as a
// bare internal_error. Config problems must be reported as config problems, naming the field.
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

  // Traits are a list of extras; having none is the normal case, not an error.
  it("defaults capabilities to none rather than leaving it undefined", () => {
    expect(
      load(custom(["family: evm", 'chainId: "137"', "nativeSymbol: MATIC"])).networks["evm:137"]!
        .capabilities,
    ).toEqual([]);
  });

  it.each([
    ["family", ['chainId: "137"', "nativeSymbol: MATIC"]],
    ["chainId", ["family: evm", "nativeSymbol: MATIC"]],
    // without this a MATIC balance would silently render as ETH, the family table's value
    ["nativeSymbol", ["family: evm", 'chainId: "137"']],
  ])("refuses a definition missing %s, naming the field", (field, present) => {
    expect(() => load(custom(present))).toThrow(new RegExp(`evm:137[\\s\\S]*${field}`));
  });

  it("refuses a family it does not implement", () => {
    expect(() => load(custom(["family: solana", 'chainId: "1"', "nativeSymbol: SOL"]))).toThrow(
      /solana/,
    );
  });

  // Overriding one field of a builtin must not demand the rest be restated.
  it("lets a builtin be partially overridden", () => {
    const net = load(
      ["networks:", "  evm:11155111:", "    httpEndpoint: https://mine.example"].join("\n"),
    ).networks["evm:11155111"]!;
    expect(net).toMatchObject({ nativeSymbol: "ETH", httpEndpoint: "https://mine.example" });
  });
});
