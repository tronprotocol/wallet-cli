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

const market = [{ key: "sunswap.market", summary: "SunSwap queries" }];
const poolList = { capability: "sunswap.market", path: ["sunswap", "pool-list"] };

describe("CapabilityRegistry.check", () => {
  it("passes when the network supports the capability", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(MAINNET, market);
    expect(() => caps.check(poolList, network(MAINNET))).not.toThrow();
  });

  it("passes when the command declares no capability, or no network is selected", () => {
    const caps = new CapabilityRegistry(ALIASES);
    expect(() => caps.check({ path: ["wallet", "list"] }, network(NILE))).not.toThrow();
    expect(() => caps.check(poolList, undefined)).not.toThrow();
  });

  // The refusal answers "then where?", because that is the next thing the reader needs.
  it("names the one supporting network by its alias", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(MAINNET, market);
    caps.register(NILE, []);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      "sunswap pool-list is available on tron only",
    );
  });

  // Computed from registry state rather than stored on the command: a tester who opens Nile in
  // config.yaml gets a message that says so, without anyone editing a string.
  it("lists every supporting network, in registration order", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(MAINNET, market);
    caps.register(NILE, market);
    caps.register("tron:2494104990", []);
    expect(() => caps.check(poolList, network("tron:2494104990"))).toThrow(
      "sunswap pool-list is available on tron and nile only",
    );
  });

  it("reads as a sentence with three or more supporting networks", () => {
    const caps = new CapabilityRegistry({ ...ALIASES, shasta: "tron:2494104990" });
    caps.register(MAINNET, market);
    caps.register(NILE, market);
    caps.register("tron:2494104990", market);
    caps.register("eip155:1", []);
    expect(() => caps.check(poolList, network("eip155:1"))).toThrow(
      "sunswap pool-list is available on tron, nile and shasta only",
    );
  });

  it("falls back to the canonical id for a network no alias points at", () => {
    const caps = new CapabilityRegistry({});
    caps.register(MAINNET, market);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      `sunswap pool-list is available on ${MAINNET} only`,
    );
  });

  // Nothing supports it anywhere (a capability whose service is configured on no network), so
  // there is no "then where?" to answer and the generic message is the honest one.
  it("keeps the generic message when the registry knows no supporter", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(NILE, []);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      `${NILE} does not support sunswap.market`,
    );
  });

  it("raises unsupported_network_capability whichever message it picks", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(MAINNET, market);
    expect(() => caps.check(poolList, network(NILE))).toThrow(
      expect.objectContaining({ code: "unsupported_network_capability" }),
    );
  });
});

describe("CapabilityRegistry.register", () => {
  it("dedupes by key and keeps the first summary", () => {
    const caps = new CapabilityRegistry(ALIASES);
    caps.register(MAINNET, market);
    caps.register(MAINNET, [{ key: "sunswap.market", summary: "second" }]);
    expect(caps.supports(MAINNET, "sunswap.market")).toBe(true);
    expect(() => caps.check(poolList, network(NILE))).toThrow(/available on tron only/);
  });
});
