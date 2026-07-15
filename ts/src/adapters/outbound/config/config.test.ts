import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigLoader, NetworkRegistry } from "./index.js";

function envWithConfig(yaml: string): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), "wcli-config-"));
  writeFileSync(join(root, "config.yaml"), yaml);
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
