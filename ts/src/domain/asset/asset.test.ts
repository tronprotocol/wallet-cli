import { describe, expect, it } from "vitest";
import { icoPriceLabel, icoRate, icoTokensFor } from "./index.js";

describe("TRC10 ICO rate", () => {
  // The worked example from the v4.12.0 spec §3.1: the same --price lands differently on chain
  // depending on --precision, which is the trap the flag exists to hide.
  it("scales the same price by precision", () => {
    expect(icoRate(1n, 100n, 6)).toEqual({ trxNum: 1, num: 100 });
    expect(icoRate(1n, 100n, 0)).toEqual({ trxNum: 10_000, num: 1 });
  });

  // Live mainnet asset 1001875 (Colorpop): trx_num 1000000, num 1, precision 4 — i.e. 1 TRX buys
  // 0.0001 whole tokens. Proves the formula against a real record rather than only the spec.
  it("reproduces a real on-chain rate", () => {
    expect(icoRate(10_000n, 1n, 4)).toEqual({ trxNum: 1_000_000, num: 1 });
  });

  it("reduces to lowest terms", () => {
    expect(icoRate(2n, 200n, 6)).toEqual({ trxNum: 1, num: 100 });
    expect(icoRate(7n, 7n, 6)).toEqual({ trxNum: 1, num: 1 });
  });

  it("rejects a rate that cannot fit in an int32 pair", () => {
    // 1 TRX : 3 tokens at precision 0 → 3 / 1_000_000, already lowest terms and fine…
    expect(icoRate(1n, 3n, 0)).toEqual({ trxNum: 1_000_000, num: 3 });
    // …but a large coprime numerator overflows and must be refused, not truncated.
    expect(() => icoRate(999_999_937n, 3n, 0)).toThrow(/32-bit integer/);
  });

  it("rejects non-positive sides and out-of-range precision", () => {
    expect(() => icoRate(0n, 100n, 6)).toThrow(/positive/);
    expect(() => icoRate(1n, 0n, 6)).toThrow(/positive/);
    expect(() => icoRate(1n, 1n, 7)).toThrow(/--precision/);
    expect(() => icoRate(1n, 1n, -1)).toThrow(/--precision/);
  });

  it("computes participation the way the chain does — multiply, then truncate", () => {
    const rate = icoRate(1n, 100n, 6); // 1 sun buys 100 minimal units
    expect(icoTokensFor(100_000_000n, rate)).toBe(10_000_000_000n); // 100 TRX → 10,000 tokens
    // trxNum > 1 truncates, and the remainder is not refunded
    const coarse = { trxNum: 3, num: 1 };
    expect(icoTokensFor(10n, coarse)).toBe(3n);
    expect(() => icoTokensFor(0n, rate)).toThrow(/--pay/);
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
