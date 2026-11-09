import { expect, it } from "vitest";
import { CHAIN_FAMILIES } from "../family/index.js";
import { supportsScheme, X402_FAMILIES } from "./families.js";
import { fromX402Network, toX402Network, x402NetworkFamily } from "./network-id.js";

it("covers every chain family with a distinct x402 namespace", () => {
  const namespaces = CHAIN_FAMILIES.map((family) => X402_FAMILIES[family].namespace);
  expect(new Set(namespaces).size).toBe(CHAIN_FAMILIES.length);
});

it.each(CHAIN_FAMILIES)("round-trips %s network ids through its table entry", (family) => {
  const id = toX402Network({ family, chainId: "56" });
  expect(id.startsWith(`${X402_FAMILIES[family].namespace}:`)).toBe(true);
  expect(fromX402Network(id)).toEqual({ family, chainId: "56" });
  expect(x402NetworkFamily(id)).toBe(family);
});

it("reports no family for an id outside the table", () => {
  expect(x402NetworkFamily("solana:mainnet")).toBeUndefined();
});

it("offers exact everywhere and exact_gasfree only where the table allows it", () => {
  for (const family of CHAIN_FAMILIES) {
    expect(supportsScheme(family, "exact")).toBe(true);
    expect(supportsScheme(family, "exact_gasfree")).toBe(X402_FAMILIES[family].gasfree);
    expect(supportsScheme(family, "upto")).toBe(false);
  }
});
