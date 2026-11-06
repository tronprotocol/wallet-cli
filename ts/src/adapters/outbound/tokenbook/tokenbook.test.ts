import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenBook } from "./index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import type { TokenEntry } from "../../../domain/types/index.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const NILE_OFFICIAL: TokenEntry[] = [
  {
    kind: "trc20",
    id: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD",
  },
  {
    kind: "trc20",
    id: "TYQF9cAeJ3Faq8QXpHxTcFco72DRCQbgFt",
    symbol: "USDD",
    decimals: 18,
    name: "Usdd Stablecoin",
  },
];
const REF = "wlt_abc.0";
const customToken: TokenEntry = {
  kind: "trc20",
  id: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
  symbol: "CUS",
  decimals: 8,
  name: "Custom",
};

function freshBook() {
  return new TokenBook(mkdtempSync(join(tmpdir(), "tb-")), new AtomicFileStore());
}

function expectCode(fn: () => unknown, code: string) {
  expect(fn).toThrowError();
  try {
    fn();
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
  }
}

describe("TokenBook", () => {
  let tb: TokenBook;
  beforeEach(() => {
    tb = freshBook();
  });

  it("official layer ships stablecoins on mainnet/nile, empty on shasta", () => {
    expect(tb.official("tron:728126428").map((t) => t.symbol)).toEqual(["USDT", "USDC", "USDD"]);
    expect(tb.official("tron:3448148188")).toEqual(NILE_OFFICIAL);
    expect(tb.official("tron:2494104990")).toEqual([]);
  });

  it("add() appends to the user layer; effective() unions official-first + tags source", () => {
    expect(tb.add("tron:3448148188", REF, customToken)).toBe("added");
    const eff = tb.effective("tron:3448148188", REF);
    expect(eff).toEqual([
      ...NILE_OFFICIAL.map((t) => ({ ...t, source: "official" })),
      { ...customToken, source: "user" },
    ]);

    const onMainnet = tb.effective("tron:728126428", REF);
    expect(onMainnet.map((t) => `${t.source}:${t.symbol}`)).toEqual([
      "official:USDT",
      "official:USDC",
      "official:USDD",
    ]);
  });

  it("add() of an official token → token_already_listed", () => {
    expectCode(
      () => tb.add("tron:728126428", REF, { kind: "trc20", id: USDT, symbol: "USDT", decimals: 6 }),
      "token_already_listed",
    );
  });

  it("add() of an existing user token refreshes metadata idempotently", () => {
    tb.add("tron:3448148188", REF, customToken);
    const action = tb.add("tron:3448148188", REF, { ...customToken, symbol: "NEW", decimals: 2 });
    expect(action).toBe("refreshed");
    const eff = tb.effective("tron:3448148188", REF).filter((t) => t.source === "user");
    expect(eff).toHaveLength(1);
    expect(eff[0]).toMatchObject({ symbol: "NEW", decimals: 2, source: "user" });
  });

  it("scope is per network+account — same token under a different account/network is separate", () => {
    tb.add("tron:3448148188", REF, customToken);
    expect(tb.user("tron:3448148188", "wlt_other.0")).toEqual([]);
    expect(tb.user("tron:2494104990", REF)).toEqual([]);
  });

  it("remove() drops a user token; removing the last one prunes the scope key", () => {
    tb.add("tron:3448148188", REF, customToken);
    const removed = tb.remove("tron:3448148188", REF, "trc20", customToken.id);
    expect(removed.symbol).toBe("CUS");
    expect(tb.user("tron:3448148188", REF)).toEqual([]);
  });

  it("remove() of an official token → token_is_official", () => {
    expectCode(() => tb.remove("tron:728126428", REF, "trc20", USDT), "token_is_official");
  });

  it("remove() of an absent token → token_not_in_book", () => {
    expectCode(
      () => tb.remove("tron:3448148188", REF, "trc20", customToken.id),
      "token_not_in_book",
    );
  });

  it("rejects an entry whose id or decimals the token book would refuse to load", () => {
    expectCode(
      () =>
        tb.add("tron:3448148188", REF, {
          kind: "trc20",
          id: "1002000",
          symbol: "TWENTY",
          decimals: 6,
        }),
      "invalid_address",
    );
    expectCode(
      () =>
        tb.add("tron:3448148188", REF, { kind: "trc10", id: "1002000", symbol: "T", decimals: 78 }),
      "invalid_node_response",
    );
    expect(tb.user("tron:3448148188", REF)).toEqual([]);
  });
});

describe("TokenBook stores EVM contracts in canonical form", () => {
  const SEPOLIA = "eip155:11155111";
  const MAINNET = "eip155:1";
  const CONTRACT = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  const token = (id: string, symbol = "TKN"): TokenEntry => ({
    kind: "erc20",
    id,
    symbol,
    decimals: 18,
  });

  it("keeps one entry for two spellings of the same contract", () => {
    const tb = freshBook();
    expect(tb.add(SEPOLIA, REF, token(CONTRACT.toLowerCase()))).toBe("added");
    expect(tb.add(SEPOLIA, REF, token(CONTRACT))).toBe("refreshed");
    expect(tb.user(SEPOLIA, REF)).toEqual([token(CONTRACT)]);
  });

  it("removes a contract given in another case", () => {
    const tb = freshBook();
    tb.add(SEPOLIA, REF, token(CONTRACT));
    expect(tb.remove(SEPOLIA, REF, "erc20", CONTRACT.toLowerCase()).id).toBe(CONTRACT);
    expect(tb.user(SEPOLIA, REF)).toEqual([]);
  });

  it("refuses a lowercase spelling of an official token", () => {
    const tb = freshBook();
    const official = tb.official(MAINNET)[0]!;
    expectCode(
      () => tb.add(MAINNET, REF, token(official.id.toLowerCase())),
      "token_already_listed",
    );
    expectCode(
      () => tb.remove(MAINNET, REF, "erc20", official.id.toLowerCase()),
      "token_is_official",
    );
  });

  it("collapses entries that load as the same contract, keeping the later fields in the earlier slot", () => {
    const root = mkdtempSync(join(tmpdir(), "tb-"));
    const other = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";
    writeFileSync(
      join(root, "tokens.json"),
      JSON.stringify({
        version: 2,
        entries: {
          [`${SEPOLIA}|${REF}`]: [
            token(CONTRACT.toLowerCase(), "OLD"),
            token(other, "OTHER"),
            token(CONTRACT, "NEW"),
          ],
        },
      }),
    );
    const tb = new TokenBook(root, new AtomicFileStore());

    expect(tb.user(SEPOLIA, REF)).toEqual([token(CONTRACT, "NEW"), token(other, "OTHER")]);
    expect(tb.effective(SEPOLIA, REF)).toHaveLength(2);
  });
});

describe("TokenBook loading applies the write rules", () => {
  it.each([
    [
      "a contract that is not an address",
      { kind: "trc20", id: "TNotAnAddress", symbol: "X", decimals: 6 },
    ],
    ["decimals out of range", { kind: "trc20", id: USDT, symbol: "X", decimals: 78 }],
    ["an unknown kind", { kind: "bep20", id: USDT, symbol: "X", decimals: 6 }],
    ["a missing symbol", { kind: "trc20", id: USDT, decimals: 6 }],
  ])("rejects %s with encoding_error", (_label, entry) => {
    const root = mkdtempSync(join(tmpdir(), "tb-"));
    writeFileSync(
      join(root, "tokens.json"),
      JSON.stringify({ version: 2, entries: { [`tron:3448148188|${REF}`]: [entry] } }),
    );
    expectCode(
      () => new TokenBook(root, new AtomicFileStore()).user("tron:3448148188", REF),
      "encoding_error",
    );
  });
});
