import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenBook } from "./index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import type { TokenEntry } from "../../../domain/types/index.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // official mainnet
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
  id: "TCustomContractXXXXXXXXXXXXXXXXXXXX",
  symbol: "CUS",
  decimals: 8,
  name: "Custom",
};

function freshBook() {
  return new TokenBook(mkdtempSync(join(tmpdir(), "tb-")), new AtomicFileStore());
}

/** assert fn throws a CliError carrying the given .code (the message doesn't echo the code). */
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

  it("user entries override duplicate-id collisions only within their own kind", () => {
    // a trc10 with the same numeric-ish id as a trc20 stays distinct (dedup is kind+id)
    tb.add("tron:3448148188", REF, { kind: "trc10", id: "1002000", symbol: "TEN", decimals: 0 });
    tb.add("tron:3448148188", REF, { kind: "trc20", id: "1002000", symbol: "TWENTY", decimals: 6 });
    expect(tb.user("tron:3448148188", REF)).toHaveLength(2);
  });
});
