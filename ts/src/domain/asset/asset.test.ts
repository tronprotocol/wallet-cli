import { describe, expect, it } from "vitest";
import { icoPriceLabel, icoRate, icoTokensFor } from "./index.js";

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
    expect(() => icoRate(1n, 1n, 7)).toThrow(/--precision/);
    expect(() => icoRate(1n, 1n, -1)).toThrow(/--precision/);
  });

  it("computes participation the way the chain does — multiply, then truncate", () => {
    const rate = icoRate(1n, 100n, 6); // 1 sun buys 100 minimal units
    expect(icoTokensFor(100_000_000n, rate)).toBe(10_000_000_000n); // 100 TRX → 10,000 tokens
    // The chain does not refund the remainder.
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
