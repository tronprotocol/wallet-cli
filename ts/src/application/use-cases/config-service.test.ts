import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "./config-service.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import type { Config } from "../../domain/types/index.js";

const effective = { timeoutMs: 60_000, waitTimeoutMs: 60_000, networks: {} } as unknown as Config;
const networks = {} as NetworkRegistry;

function service(): { svc: ConfigService; update: ReturnType<typeof vi.fn> } {
  const update = vi.fn(
    (fn: (c: unknown) => { document: unknown; result: unknown }) => fn({}).result,
  );
  const docs = { update } as unknown as ConfigDocumentRepository;
  return { svc: new ConfigService(docs), update };
}

describe("ConfigService timeoutMs validation", () => {
  it("rejects a non-positive timeoutMs (0ms bound aborts instantly)", () => {
    const { svc, update } = service();
    expect(() => svc.execute({ key: "timeoutMs", value: "0" }, effective, networks)).toThrow(
      /positive/,
    );
    expect(() => svc.execute({ key: "timeoutMs", value: "-5" }, effective, networks)).toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a positive timeoutMs", () => {
    const { svc } = service();
    expect(svc.execute({ key: "timeoutMs", value: "5000" }, effective, networks)).toMatchObject({
      key: "timeoutMs",
      value: 5000,
    });
  });
});

describe("ConfigService waitTimeoutMs", () => {
  it("shows waitTimeoutMs in the full view and single-key read", () => {
    const { svc } = service();
    expect(svc.execute({}, effective, networks)).toMatchObject({ waitTimeoutMs: 60_000 });
    expect(svc.execute({ key: "waitTimeoutMs" }, effective, networks)).toMatchObject({
      key: "waitTimeoutMs",
      value: 60_000,
    });
  });

  it("accepts 0 and positive integers, rejects negatives and non-numbers", () => {
    const { svc, update } = service();
    expect(svc.execute({ key: "waitTimeoutMs", value: "0" }, effective, networks)).toMatchObject({
      key: "waitTimeoutMs",
      value: 0,
    });
    expect(
      svc.execute({ key: "waitTimeoutMs", value: "120000" }, effective, networks),
    ).toMatchObject({
      key: "waitTimeoutMs",
      value: 120000,
    });
    expect(() => svc.execute({ key: "waitTimeoutMs", value: "-1" }, effective, networks)).toThrow(
      /non-negative/,
    );
    expect(() => svc.execute({ key: "waitTimeoutMs", value: "abc" }, effective, networks)).toThrow(
      /non-negative/,
    );
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("ConfigService TronLink credentials", () => {
  it("validates the exact public config keys and masks the secret key", () => {
    const { svc } = service();
    expect(
      svc.execute({ key: "tronlinkSecretId", value: "TEST" }, effective, networks),
    ).toMatchObject({ key: "tronlinkSecretId", value: "TEST" });
    expect(
      svc.execute({ key: "tronlinkSecretKey", value: "TESTTESTTEST" }, effective, networks),
    ).toMatchObject({ key: "tronlinkSecretKey", value: "********" });
  });

  it("never returns an effective secret key in config views", () => {
    const configured = { ...effective, tronlinkSecretKey: "secret" };
    const { svc } = service();
    expect(svc.execute({}, configured, networks)).toMatchObject({ tronlinkSecretKey: "********" });
    expect(svc.execute({ key: "tronlinkSecretKey" }, configured, networks)).toEqual({
      key: "tronlinkSecretKey",
      value: "********",
    });
  });

  it("rejects empty, oversized, and control-character credentials", () => {
    const { svc, update } = service();
    for (const value of ["", "x".repeat(257), "bad\nvalue"]) {
      expect(() => svc.execute({ key: "tronlinkChannel", value }, effective, networks)).toThrow();
    }
    expect(update).not.toHaveBeenCalled();
  });
});

describe("ConfigService GasFree credentials", () => {
  it("writes the documented flat keys and masks the API secret", () => {
    const { svc } = service();
    expect(svc.execute({ key: "gasfreeApiKey", value: "TEST" }, effective, networks)).toMatchObject(
      { key: "gasfreeApiKey", value: "TEST" },
    );
    expect(
      svc.execute({ key: "gasfreeApiSecret", value: "TESTTESTTEST" }, effective, networks),
    ).toMatchObject({ key: "gasfreeApiSecret", value: "********" });
  });

  it("never returns an effective API secret in config views", () => {
    const configured = { ...effective, gasfreeApiSecret: "secret" };
    const { svc } = service();
    expect(svc.execute({}, configured, networks)).toMatchObject({ gasfreeApiSecret: "********" });
    expect(svc.execute({ key: "gasfreeApiSecret" }, configured, networks)).toEqual({
      key: "gasfreeApiSecret",
      value: "********",
    });
  });
});

const twoNetworks = {
  timeoutMs: 60_000,
  waitTimeoutMs: 60_000,
  aliases: { nile: "tron:nile", sepolia: "evm:11155111" },
  networks: {
    "tron:nile": { id: "tron:nile", httpEndpoint: "https://nile.trongrid.io" },
    "evm:11155111": { id: "evm:11155111", httpEndpoint: "https://sepolia.example/abc123" },
  },
} as unknown as Config;

const registry = {
  resolve: (id: string) => {
    const key = { nile: "tron:nile", sepolia: "evm:11155111" }[id] ?? id;
    const net = (twoNetworks.networks as Record<string, unknown>)[key];
    if (!net) throw new Error(`unknown network: ${id}`);
    return net;
  },
} as unknown as NetworkRegistry;

// §2.4: `config networks` used to return only ids, so there was no way to confirm an endpoint
// change had taken effect.
describe("ConfigService networks view", () => {
  it("maps each canonical id to its configurable fields, endpoint trimmed to the host", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks" }, twoNetworks, registry)).toMatchObject({
      key: "networks",
      value: {
        "tron:nile": { httpEndpoint: "nile.trongrid.io" },
        // host only — an endpoint may carry an API key in its path
        "evm:11155111": { httpEndpoint: "sepolia.example" },
      },
    });
  });
});

describe("ConfigService networks.<id>.httpEndpoint", () => {
  it("writes an endpoint addressed by canonical id", () => {
    const { svc, update } = service();
    const result = svc.execute(
      { key: "networks.evm:11155111.httpEndpoint", value: "https://my-node.example/key" },
      twoNetworks,
      registry,
    );

    expect(result).toMatchObject({ key: "networks.evm:11155111.httpEndpoint" });
    expect(update).toHaveBeenCalled();
  });

  // §2.4: an alias in the key is normalised to the canonical id ON WRITE, so config.yaml can
  // never end up holding both `networks.sepolia` and `networks.evm:11155111`.
  it("normalises an alias in the key to the canonical id", () => {
    const { svc, update } = service();
    svc.execute(
      { key: "networks.sepolia.httpEndpoint", value: "https://my-node.example" },
      twoNetworks,
      registry,
    );

    const document = update.mock.calls[0]![0]({}).document as Record<string, any>;
    expect(Object.keys(document.networks)).toEqual(["evm:11155111"]);
  });

  it("rejects an unknown network in the key", () => {
    const { svc } = service();
    expect(() =>
      svc.execute(
        { key: "networks.dogechain.httpEndpoint", value: "https://x" },
        twoNetworks,
        registry,
      ),
    ).toThrow(/dogechain/);
  });

  it("rejects a non-https endpoint", () => {
    const { svc } = service();
    expect(() =>
      svc.execute(
        { key: "networks.nile.httpEndpoint", value: "ftp://nope" },
        twoNetworks,
        registry,
      ),
    ).toThrow();
  });

  it("rejects a networks sub-key other than httpEndpoint", () => {
    const { svc } = service();
    expect(() =>
      svc.execute({ key: "networks.nile.chainId", value: "9" }, twoNetworks, registry),
    ).toThrow(/httpEndpoint/);
  });
});

// The alias book has no other visibility surface: there is no `config set aliases.*`, so without
// this a user must open config.yaml to find out what a short name resolves to.
describe("ConfigService alias book view", () => {
  it("exposes the book as a read-only key", () => {
    const { svc } = service();
    expect(svc.execute({ key: "aliases" }, twoNetworks, registry)).toMatchObject({
      key: "aliases",
      value: { nile: "tron:nile", sepolia: "evm:11155111" },
    });
  });

  it("includes the book in the whole-config view", () => {
    const { svc } = service();
    expect(svc.execute({}, twoNetworks, registry)).toMatchObject({
      aliases: { nile: "tron:nile" },
    });
  });

  it("refuses to write it", () => {
    const { svc, update } = service();
    expect(() => svc.execute({ key: "aliases", value: "x" }, twoNetworks, registry)).toThrow(
      /read-only/,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

// `config` advertises itself as "read or set", but any nested key was routed unconditionally to
// the write path, so reading one failed with "needs a value".
describe("ConfigService reads a nested network key", () => {
  it("returns the endpoint instead of demanding a value", () => {
    const { svc } = service();
    expect(
      svc.execute({ key: "networks.evm:11155111.httpEndpoint" }, twoNetworks, registry),
    ).toEqual({
      key: "networks.evm:11155111.httpEndpoint",
      value: "https://sepolia.example/abc123",
    });
  });

  it("resolves an alias in the key when reading, exactly as when writing", () => {
    const { svc } = service();
    expect(
      svc.execute({ key: "networks.sepolia.httpEndpoint" }, twoNetworks, registry),
    ).toMatchObject({ key: "networks.evm:11155111.httpEndpoint" });
  });

  it("reads back what was just written", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks.nile.httpEndpoint" }, twoNetworks, registry)).toMatchObject(
      { value: "https://nile.trongrid.io" },
    );
  });

  it("still rejects an unwritable sub-key when reading", () => {
    const { svc } = service();
    expect(() => svc.execute({ key: "networks.nile.chainId" }, twoNetworks, registry)).toThrow(
      /httpEndpoint/,
    );
  });
});

// §2.4 (revised): `config` shows what a user can SET. A network therefore renders as an object of
// its configurable fields — endpoint plus the API-key pair — not as a bare endpoint string, so a
// new configurable field appears everywhere at once instead of needing a display site per view.
const keyedNetworks = {
  timeoutMs: 60_000,
  waitTimeoutMs: 60_000,
  aliases: { nile: "tron:nile", sepolia: "evm:11155111" },
  networks: {
    "tron:nile": {
      id: "tron:nile",
      httpEndpoint: "https://nile.trongrid.io",
      apiKeyHeader: "TRON-PRO-API-KEY",
      apiKey: "topsecret",
    },
    "evm:11155111": { id: "evm:11155111", httpEndpoint: "https://sepolia.example/abc123" },
  },
} as unknown as Config;

const keyedRegistry = {
  resolve: (id: string) => {
    const key = { nile: "tron:nile", sepolia: "evm:11155111" }[id] ?? id;
    const net = (keyedNetworks.networks as Record<string, unknown>)[key];
    if (!net) throw new Error(`unknown network: ${id}`);
    return net;
  },
} as unknown as NetworkRegistry;

describe("ConfigService network subtree read", () => {
  it("reads one network as its configurable fields", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks.tron:nile" }, keyedNetworks, keyedRegistry)).toEqual({
      key: "networks.tron:nile",
      value: {
        httpEndpoint: "https://nile.trongrid.io",
        apiKeyHeader: "TRON-PRO-API-KEY",
        apiKey: "********",
      },
    });
  });

  // Naming ONE network is as deliberate an act as naming its endpoint leaf, so it reveals the
  // full URL; the breadth-first listings below stay trimmed to the host.
  it("gives the full endpoint URL when a single network is named", () => {
    const { svc } = service();
    expect(
      svc.execute({ key: "networks.evm:11155111" }, keyedNetworks, keyedRegistry),
    ).toMatchObject({ value: { httpEndpoint: "https://sepolia.example/abc123" } });
  });

  it("resolves an alias to the canonical id, exactly as the leaf read does", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks.sepolia" }, keyedNetworks, keyedRegistry)).toMatchObject({
      key: "networks.evm:11155111",
    });
  });

  it("omits fields the network has not configured", () => {
    const { svc } = service();
    const value = (
      svc.execute({ key: "networks.evm:11155111" }, keyedNetworks, keyedRegistry) as {
        value: Record<string, unknown>;
      }
    ).value;
    expect(Object.keys(value)).toEqual(["httpEndpoint"]);
  });

  it("rejects an unknown network", () => {
    const { svc } = service();
    expect(() => svc.execute({ key: "networks.dogechain" }, keyedNetworks, keyedRegistry)).toThrow(
      /dogechain/,
    );
  });
});

describe("ConfigService network listings keep endpoints host-only", () => {
  it("nests each network under its id in the networks view", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks" }, keyedNetworks, keyedRegistry)).toMatchObject({
      key: "networks",
      value: {
        "tron:nile": {
          httpEndpoint: "nile.trongrid.io",
          apiKeyHeader: "TRON-PRO-API-KEY",
          apiKey: "********",
        },
        "evm:11155111": { httpEndpoint: "sepolia.example" },
      },
    });
  });

  it("nests them the same way in the whole-config view", () => {
    const { svc } = service();
    expect(svc.execute({}, keyedNetworks, keyedRegistry)).toMatchObject({
      networks: { "tron:nile": { httpEndpoint: "nile.trongrid.io" } },
    });
  });
});

// An RPC API key is a credential: it must never come back out of the config surface, at any depth.
describe("ConfigService apiKey is write-only", () => {
  it("masks it in the leaf read", () => {
    const { svc } = service();
    expect(svc.execute({ key: "networks.nile.apiKey" }, keyedNetworks, keyedRegistry)).toEqual({
      key: "networks.tron:nile.apiKey",
      value: "********",
    });
  });

  it("masks it when the whole config is dumped", () => {
    const { svc } = service();
    expect(JSON.stringify(svc.execute({}, keyedNetworks, keyedRegistry))).not.toContain(
      "topsecret",
    );
  });
});

describe("ConfigService writes the API-key pair", () => {
  it("writes apiKeyHeader under the canonical id", () => {
    const { svc, update } = service();
    expect(
      svc.execute(
        { key: "networks.nile.apiKeyHeader", value: "TRON-PRO-API-KEY" },
        keyedNetworks,
        keyedRegistry,
      ),
    ).toMatchObject({ key: "networks.tron:nile.apiKeyHeader", value: "TRON-PRO-API-KEY" });
    const document = update.mock.calls[0]![0]({}).document as Record<string, any>;
    expect(document.networks["tron:nile"]).toEqual({ apiKeyHeader: "TRON-PRO-API-KEY" });
  });

  it("never echoes the apiKey it just wrote", () => {
    const { svc, update } = service();
    expect(
      svc.execute(
        { key: "networks.nile.apiKey", value: "topsecret" },
        keyedNetworks,
        keyedRegistry,
      ),
    ).toMatchObject({ key: "networks.tron:nile.apiKey", value: "********", input: "********" });
    const document = update.mock.calls[0]![0]({}).document as Record<string, any>;
    expect(document.networks["tron:nile"].apiKey).toBe("topsecret");
  });

  // A header NAME travels into an HTTP request line; a newline in it would be header injection.
  it("rejects a header name that is not an HTTP token", () => {
    const { svc, update } = service();
    for (const bad of ["X-Key: injected", "X-Key\nHost: evil", "", "X Key"]) {
      expect(() =>
        svc.execute(
          { key: "networks.nile.apiKeyHeader", value: bad },
          keyedNetworks,
          keyedRegistry,
        ),
      ).toThrow();
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an apiKey with control characters", () => {
    const { svc } = service();
    expect(() =>
      svc.execute({ key: "networks.nile.apiKey", value: "abc\ndef" }, keyedNetworks, keyedRegistry),
    ).toThrow();
  });

  it("still rejects a sub-key outside the configurable set", () => {
    const { svc } = service();
    expect(() =>
      svc.execute({ key: "networks.nile.chainId", value: "9" }, keyedNetworks, keyedRegistry),
    ).toThrow(/apiKeyHeader/);
  });
});
