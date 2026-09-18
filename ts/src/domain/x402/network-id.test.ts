import { describe, it, expect } from "vitest";
import { fromX402Network, toX402Network } from "./network-id.js";

// The full builtin set, as a literal table. A domain test may not import BUILTIN_NETWORKS
// (that lives in an outbound adapter), and a hand-written table is also the clearer contract:
// these exact pairs are what the migration relies on.
const PAIRS: Array<[{ family: "tron" | "evm"; chainId: string }, string]> = [
  [{ family: "tron", chainId: "728126428" }, "tron:0x2b6653dc"],
  [{ family: "tron", chainId: "3448148188" }, "tron:0xcd8690dc"],
  [{ family: "tron", chainId: "2494104990" }, "tron:0x94a9059e"],
  [{ family: "evm", chainId: "1" }, "eip155:1"],
  [{ family: "evm", chainId: "11155111" }, "eip155:11155111"],
  [{ family: "evm", chainId: "56" }, "eip155:56"],
  [{ family: "evm", chainId: "97" }, "eip155:97"],
];

describe("toX402Network", () => {
  it.each(PAIRS)("renders %j as its x402 id", (network, id) => {
    expect(toX402Network(network)).toBe(id);
  });
});

describe("fromX402Network", () => {
  it.each(PAIRS)("parses the x402 id back into %j", (network, id) => {
    expect(fromX402Network(id)).toEqual(network);
  });

  it("accepts an id whose case differs", () => {
    expect(fromX402Network("TRON:0x2B6653DC")).toEqual({ family: "tron", chainId: "728126428" });
  });

  it("rejects an unknown namespace", () => {
    expect(() => fromX402Network("solana:mainnet")).toThrow(
      expect.objectContaining({ code: "unsupported_network" }),
    );
  });

  it("rejects a malformed reference", () => {
    expect(() => fromX402Network("eip155:mainnet")).toThrow(
      expect.objectContaining({ code: "unsupported_network" }),
    );
  });
});
