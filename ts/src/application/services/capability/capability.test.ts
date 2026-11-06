import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "./index.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const MAINNET = "tron:728126428";
const NILE = "tron:3448148188";
const ALIASES = { tron: MAINNET, "tron:mainnet": MAINNET, nile: NILE, "tron:nile": NILE };

const network = (id: string): NetworkDescriptor =>
  ({
    id,
    family: "tron",
    chainId: id.split(":")[1],
    nativeSymbol: "TRX",
    capabilities: [],
  }) as NetworkDescriptor;

// A capability without a predicate is supported wherever it is registered.
const market = ["demo.market"];
const poolList = { capability: "demo.market", path: ["sunswap", "pool-list"] };

describe("CapabilityRegistry.check", () => {
  it("passes when the network supports the capability", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), market);
    expect(() => caps.check(poolList, network(MAINNET))).not.toThrow();
  });

  it("passes when the command declares no capability, or no network is selected", () => {
    const caps = new CapabilityRegistry(ALIASES);
    expect(() => caps.check({ path: ["wallet", "list"] }, network(NILE))).not.toThrow();
    expect(() => caps.check(poolList, undefined)).not.toThrow();
  });

  it("names the one supporting network by its alias", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), market);
    caps.register(network(NILE), []);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      "sunswap pool-list is available on tron only",
    );
  });

  it("lists every supporting network, in registration order", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), market);
    caps.register(network(NILE), market);
    caps.register(network("tron:2494104990"), []);
    expect(() => caps.check(poolList, network("tron:2494104990"))).toThrow(
      "sunswap pool-list is available on tron and nile only",
    );
  });

  it("reads as a sentence with three or more supporting networks", () => {
    const caps = new CapabilityRegistry({ ...ALIASES, shasta: "tron:2494104990" });
    caps.register(network(MAINNET), market);
    caps.register(network(NILE), market);
    caps.register(network("tron:2494104990"), market);
    caps.register(network("eip155:1"), []);
    expect(() => caps.check(poolList, network("eip155:1"))).toThrow(
      "sunswap pool-list is available on tron, nile and shasta only",
    );
  });

  it("falls back to the canonical id for a network no alias points at", () => {
    const caps = new CapabilityRegistry({});
    caps.register(network(MAINNET), market);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      `sunswap pool-list is available on ${MAINNET} only`,
    );
  });

  it("keeps the generic message when the registry knows no supporter", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(NILE), []);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      `${NILE} does not support demo.market`,
    );
  });

  it("raises unsupported_network_capability whichever message it picks", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), market);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      expect.objectContaining({ code: "unsupported_network_capability" }),
    );
  });
});

describe("CapabilityRegistry.register", () => {
  it("records the predicate result once per key", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), ["demo.market", "gasfree.info"]);
    caps.register(network(MAINNET), ["demo.market"]);
    expect(caps.support(MAINNET, "demo.market")).toBe("supported");
    // The bare descriptor has no GasFree service configured.
    expect(caps.support(MAINNET, "gasfree.info")).toBe("unsupported");
    expect(caps.support(NILE, "demo.market")).toBe("unsupported");
  });

  it("reports every registered network for discovery", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(network(MAINNET), market);
    caps.register(network(NILE), []);
    expect(caps.supportByNetwork("demo.market")).toEqual([
      { network: MAINNET, family: "tron", support: "supported" },
      { network: NILE, family: "tron", support: "unsupported" },
    ]);
  });
});
