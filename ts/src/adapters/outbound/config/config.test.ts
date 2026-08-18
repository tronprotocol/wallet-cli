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

  it("rejects network aliases", () => {
    expect(() => registry().resolve("nile")).toThrow(/unknown network/);
    expect(() => registry().resolve("tron")).toThrow(/unknown network/);
  });

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
