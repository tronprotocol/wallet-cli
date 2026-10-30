import { describe, expect, it } from "vitest";
import type { TokenEntry } from "../types/index.js";
import { effectiveTokens, withoutUserToken, withUserToken } from "./book.js";

const USDT: TokenEntry = {
  kind: "trc20",
  id: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  symbol: "USDT",
  decimals: 6,
};
const WIN: TokenEntry = {
  kind: "trc20",
  id: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
  symbol: "WIN",
  decimals: 6,
};
const TRC10: TokenEntry = { kind: "trc10", id: "1002000", symbol: "BTT", decimals: 6 };

describe("effectiveTokens", () => {
  it("lists official tokens first and hides a user entry for an official token", () => {
    expect(effectiveTokens([USDT], [{ ...USDT, symbol: "FAKE" }, WIN])).toEqual([
      { ...USDT, source: "official" },
      { ...WIN, source: "user" },
    ]);
  });
});

describe("withUserToken", () => {
  it("appends a new token", () => {
    expect(withUserToken([USDT], [TRC10], WIN, "nile")).toEqual({
      tokens: [TRC10, WIN],
      action: "added",
    });
  });

  it("refreshes the stored entry in place", () => {
    const refreshed = { ...TRC10, symbol: "BTTOLD" };
    expect(withUserToken([], [TRC10, WIN], refreshed, "nile")).toEqual({
      tokens: [refreshed, WIN],
      action: "refreshed",
    });
  });

  it("refuses an official token", () => {
    expect(() => withUserToken([USDT], [], USDT, "nile")).toThrowError(
      expect.objectContaining({
        code: "token_already_listed",
        message: `${USDT.id} is already an official token on nile`,
      }),
    );
  });

  it("validates the entry before storing it", () => {
    expect(() => withUserToken([], [], { ...WIN, id: "not-an-address" }, "nile")).toThrowError(
      expect.objectContaining({ code: "invalid_address" }),
    );
  });
});

describe("withoutUserToken", () => {
  it("removes the stored token and returns it", () => {
    expect(withoutUserToken([], [TRC10, WIN], "trc20", WIN.id)).toEqual({
      tokens: [TRC10],
      removed: WIN,
    });
  });

  it("refuses an official token", () => {
    expect(() => withoutUserToken([USDT], [USDT], "trc20", USDT.id)).toThrowError(
      expect.objectContaining({ code: "token_is_official" }),
    );
  });

  it("reports a token the book does not hold", () => {
    expect(() => withoutUserToken([], [TRC10], "trc20", WIN.id)).toThrowError(
      expect.objectContaining({ code: "token_not_in_book" }),
    );
  });
});
