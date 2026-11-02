import { describe, expect, it } from "vitest";
import { matchTokenSymbol, tokenBySymbol } from "./symbol.js";

const FOO_A = { id: "A", symbol: "FOO" };
const FOO_B = { id: "B", symbol: "foo" };
const BAR = { id: "C", symbol: "BAR" };

describe("matchTokenSymbol", () => {
  it("returns the one entry whose symbol matches, ignoring case", () => {
    expect(matchTokenSymbol([FOO_A, BAR], "bar")).toEqual({ kind: "one", token: BAR });
  });

  it("reports no match", () => {
    expect(matchTokenSymbol([FOO_A, BAR], "BAZ")).toEqual({ kind: "none" });
  });

  it("reports symbols that are equal ignoring case as ambiguous", () => {
    expect(matchTokenSymbol([FOO_A, BAR, FOO_B], "Foo")).toEqual({
      kind: "ambiguous",
      matches: [FOO_A, FOO_B],
    });
  });
});

describe("tokenBySymbol", () => {
  it("returns the single match", () => {
    expect(tokenBySymbol([FOO_A, BAR], "foo", "net")).toBe(FOO_A);
  });

  it("refuses an unknown symbol with token_not_in_book", () => {
    expect(() => tokenBySymbol([FOO_A], "BAR", "net")).toThrow(
      expect.objectContaining({ code: "token_not_in_book" }),
    );
  });

  it("refuses an ambiguous symbol and names every candidate", () => {
    expect(() => tokenBySymbol([FOO_A, FOO_B], "FOO", "net")).toThrow(
      expect.objectContaining({
        code: "ambiguous_token_symbol",
        message: expect.stringMatching(/A, B/),
      }),
    );
  });
});
