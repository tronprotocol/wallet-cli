import { describe, expect, it } from "vitest";
import { inputRef } from "../errors/index.js";
import {
  icoPriceLabel,
  icoRate,
  icoTokensFor,
  trc10Description,
  trc10Precision,
  trc10Supply,
  trc10Symbol,
  trc10Url,
} from "./index.js";

describe("TRC10 ICO rate", () => {
  it("scales the same price by precision", () => {
    expect(icoRate(1n, 100n, 6)).toEqual({ trxNum: 1, num: 100 });
    expect(icoRate(1n, 100n, 0)).toEqual({ trxNum: 10_000, num: 1 });
  });

  // Mainnet asset 1001875: trx_num=1000000, num=1, precision=4.
  it("reproduces a real on-chain rate", () => {
    expect(icoRate(10_000n, 1n, 4)).toEqual({ trxNum: 1_000_000, num: 1 });
  });

  it("reduces to lowest terms", () => {
    expect(icoRate(2n, 200n, 6)).toEqual({ trxNum: 1, num: 100 });
    expect(icoRate(7n, 7n, 6)).toEqual({ trxNum: 1, num: 1 });
  });

  it("rejects a rate that cannot fit in an int32 pair", () => {
    expect(icoRate(1n, 3n, 0)).toEqual({ trxNum: 1_000_000, num: 3 });
    // Coprime values cannot be reduced to fit int32.
    expect(() => icoRate(999_999_937n, 3n, 0)).toThrow(/32-bit integer/);
  });

  it("rejects non-positive sides and out-of-range precision", () => {
    expect(() => icoRate(0n, 100n, 6)).toThrow(/positive/);
    expect(() => icoRate(1n, 0n, 6)).toThrow(/positive/);
    expect(() => icoRate(1n, 1n, 7)).toThrow(/^precision must be/);
    expect(() => icoRate(1n, 1n, -1)).toThrow(/^precision must be/);
  });

  it("computes participation the way the chain does — multiply, then truncate", () => {
    const rate = icoRate(1n, 100n, 6); // 1 sun buys 100 minimal units
    expect(icoTokensFor(100_000_000n, rate)).toBe(10_000_000_000n); // 100 TRX → 10,000 tokens
    // The chain does not refund the remainder.
    const coarse = { trxNum: 3, num: 1 };
    expect(icoTokensFor(10n, coarse)).toBe(3n);
    expect(() => icoTokensFor(0n, rate)).toThrow(/^pay must be greater than zero/);
  });

  it("renders a rate back as whole TRX to whole tokens", () => {
    expect(icoPriceLabel({ trxNum: 1, num: 100 }, 6)).toEqual({ trx: 1n, tokens: 100n });
    expect(icoPriceLabel({ trxNum: 10_000, num: 1 }, 0)).toEqual({ trx: 1n, tokens: 100n });
    expect(icoPriceLabel({ trxNum: 1_000_000, num: 1 }, 4)).toEqual({ trx: 10_000n, tokens: 1n });
  });

  it("round-trips price → chain pair → price", () => {
    for (const [trx, tokens, precision] of [
      [1n, 100n, 6],
      [3n, 7n, 2],
      [10_000n, 1n, 4],
    ] as const) {
      expect(icoPriceLabel(icoRate(trx, tokens, precision), precision)).toEqual({ trx, tokens });
    }
  });
});

describe("trc10Precision", () => {
  it.each([0, 6])("accepts %s", (v) => expect(trc10Precision(v)).toBe(v));
  it.each([-1, 7, 1.5])("rejects %s", (v) => {
    expect(() => trc10Precision(v)).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });
});

describe("TRC10 text and supply", () => {
  it("accepts 1-32 visible ASCII characters as a name or abbreviation", () => {
    expect(trc10Symbol("TOKEN_1", "name")).toBe("TOKEN_1");
    expect(trc10Symbol("x".repeat(32), "abbr")).toBe("x".repeat(32));
  });

  it.each(["", "two words", "é", "x".repeat(33)])("rejects %j and names the field", (value) => {
    expect(() => trc10Symbol(value, "abbr")).toThrow(
      expect.objectContaining({
        code: "invalid_asset_name",
        message: "abbr must be 1-32 visible ASCII characters, with no spaces",
        parts: expect.arrayContaining([inputRef("abbr")]),
      }),
    );
  });

  it("limits the URL to 1-256 UTF-8 bytes", () => {
    expect(trc10Url("é".repeat(128))).toHaveLength(128);
    expect(() => trc10Url("")).toThrow("url must not be empty");
    expect(() => trc10Url("é".repeat(129))).toThrow("url must be at most 256 bytes");
  });

  it("limits the description to 200 UTF-8 bytes and allows it empty", () => {
    expect(trc10Description("")).toBe("");
    expect(trc10Description("a".repeat(200))).toHaveLength(200);
    expect(() => trc10Description("a".repeat(201))).toThrow(
      "description must be at most 200 bytes",
    );
  });

  it("reads a positive whole-token supply", () => {
    expect(trc10Supply(" 1000 ")).toBe(1000n);
    expect(() => trc10Supply("1.5")).toThrow("supply must be a whole number");
    expect(() => trc10Supply("0")).toThrow("supply must be greater than zero");
  });
});
