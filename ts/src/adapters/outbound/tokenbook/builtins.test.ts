import { describe, it, expect } from "vitest";
import { OFFICIAL_TOKENS } from "./builtins.js";
import { isEvmAddress } from "../../../domain/address/index.js";
import { canonicalTokenId } from "../../../domain/token/index.js";

describe("official EVM token entries", () => {
  const evmNetworks = Object.entries(OFFICIAL_TOKENS).filter(([id]) => id.startsWith("eip155:"));

  it("selects the EVM entries it is about to validate", () => {
    expect(evmNetworks.length).toBeGreaterThan(0);
    expect(evmNetworks.some(([, tokens]) => tokens.length > 0)).toBe(true);
  });

  it.each(evmNetworks)("%s lists only valid, checksummed contracts", (_id, tokens) => {
    for (const token of tokens) {
      expect(isEvmAddress(token.id), `${token.symbol}: ${token.id}`).toBe(true);
      expect(token.kind).toBe("erc20");
    }
  });

  it.each(evmNetworks)("%s gives every token an explicit decimals", (_id, tokens) => {
    for (const token of tokens) {
      expect(Number.isInteger(token.decimals), token.symbol).toBe(true);
    }
  });

  it("lists no contract twice on one network", () => {
    for (const [id, tokens] of evmNetworks) {
      const ids = tokens.map((t) => t.id.toLowerCase());
      expect(new Set(ids).size, id).toBe(ids.length);
    }
  });

  it("ships USDT and USDC on ethereum mainnet", () => {
    expect(OFFICIAL_TOKENS["eip155:1"]?.map((t) => t.symbol)).toEqual(["USDT", "USDC"]);
  });

  it.each(["eip155:11155111", "eip155:97"])("leaves the testnet %s empty", (id) => {
    expect(OFFICIAL_TOKENS[id] ?? []).toEqual([]);
  });
});

describe("official token ids", () => {
  it.each(Object.entries(OFFICIAL_TOKENS))(
    "%s stores every id in canonical form",
    (_id, tokens) => {
      for (const token of tokens) expect(canonicalTokenId(token.kind, token.id)).toBe(token.id);
    },
  );
});
