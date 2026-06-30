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

  it("resolveDefault resolves aliases to canonical networks", () => {
    const config = ConfigLoader.load(envWithConfig("defaultNetwork: nile\n"));
    const registry = new NetworkRegistry(config);
    expect(registry.resolveDefault().id).toBe("tron:nile");
  });

  it("does not resolve hidden-family networks (EVM is not currently exposed)", () => {
    const registry = new NetworkRegistry(ConfigLoader.load(envWithConfig("")));
    expect(() => registry.resolve("base")).toThrow(/unknown network/);
  });
});

describe("NetworkRegistry.resolve case-insensitivity", () => {
  const registry = () => new NetworkRegistry(ConfigLoader.load(envWithConfig("")));

  it("resolves an alias regardless of input casing (TRON brands Nile/Shasta capitalized)", () => {
    expect(registry().resolve("Nile").id).toBe("tron:nile");
    expect(registry().resolve("NILE").id).toBe("tron:nile");
    expect(registry().resolve("TRON").id).toBe("tron:mainnet");
  });

  it("resolves a canonical id regardless of input casing", () => {
    expect(registry().resolve("TRON:NILE").id).toBe("tron:nile");
  });

  it("still rejects genuinely unknown networks", () => {
    expect(() => registry().resolve("dogechain")).toThrow(/unknown network/);
  });
});
