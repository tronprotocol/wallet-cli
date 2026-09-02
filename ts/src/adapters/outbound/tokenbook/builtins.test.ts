import { describe, it, expect } from "vitest";
import { OFFICIAL_TOKENS } from "./builtins.js";
import { isEvmAddress } from "../../../domain/address/index.js";

// These are constants nobody re-derives at runtime: `tx send --token USDT` trusts the book's
// contract AND decimals without asking the chain. A mistyped address is therefore a fund-loss
// shape — and EIP-55 is what catches it, since altering one character breaks the checksum.
describe("official EVM token entries", () => {
  const evmNetworks = Object.entries(OFFICIAL_TOKENS).filter(([id]) => id.startsWith("eip155:"));

  // The selection is a filter over a namespace that has been renamed once already (`evm:` →
  // `eip155:`). An empty selection makes every case below vacuous — three it.each blocks that
  // report green while checking nothing — so assert the filter still matches before trusting it.
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

  // USDT is 6 decimals on Ethereum but 18 on BSC. Getting one wrong scales an amount by 10^12.
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

  // "official 条目按规范 id 内置（eip155:1 填 USDT / USDC；测试网留空）"
  it("ships USDT and USDC on ethereum mainnet", () => {
    expect(OFFICIAL_TOKENS["eip155:1"]?.map((t) => t.symbol)).toEqual(["USDT", "USDC"]);
  });

  it.each(["eip155:11155111", "eip155:97"])("leaves the testnet %s empty", (id) => {
    expect(OFFICIAL_TOKENS[id] ?? []).toEqual([]);
  });
});
