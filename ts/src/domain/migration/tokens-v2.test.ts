import { describe, expect, it } from "vitest";
import { TOKENS_VERSION, migrateTokensToV2 } from "./tokens-v2.js";
import type { TokenEntry, TokensFile } from "../types/token.js";

const entry: TokenEntry[] = [{ kind: "erc20", id: "0xabc", symbol: "AAA", decimals: 18 }];

describe("tokens.json v1 → v2", () => {
  // The scope key carries the network id, so an id that changed spelling orphans every entry
  // filed under the old one — silently, as an empty token list rather than an error.
  it("rewrites the network half of each scope key", () => {
    const before = {
      version: 1,
      entries: { "evm:56|wlt_a.0": entry, "tron:nile|wlt_b.0": entry },
    } as TokensFile;

    expect(migrateTokensToV2(before)).toEqual({
      version: TOKENS_VERSION,
      entries: { "eip155:56|wlt_a.0": entry, "tron:3448148188|wlt_b.0": entry },
    });
  });

  it("leaves the account half of the key untouched", () => {
    const before = { version: 1, entries: { "evm:1|wlt_x.12": entry } } as TokensFile;
    expect(Object.keys(migrateTokensToV2(before).entries)).toEqual(["eip155:1|wlt_x.12"]);
  });

  // A user-configured network this rename never knew about keeps whatever key it had.
  it("passes an unknown network id through unchanged", () => {
    const before = { version: 1, entries: { "eip155:8453|wlt_x.0": entry } } as TokensFile;
    expect(Object.keys(migrateTokensToV2(before).entries)).toEqual(["eip155:8453|wlt_x.0"]);
  });

  // The account ref is opaque; only the FIRST separator divides network from account.
  it("splits on the first separator only", () => {
    const before = { version: 1, entries: { "evm:56|wlt_a.0|extra": entry } } as TokensFile;
    expect(Object.keys(migrateTokensToV2(before).entries)).toEqual(["eip155:56|wlt_a.0|extra"]);
  });

  it("survives a document with no entries at all", () => {
    expect(migrateTokensToV2({ version: 1 } as TokensFile)).toEqual({
      version: TOKENS_VERSION,
      entries: {},
    });
  });
});
