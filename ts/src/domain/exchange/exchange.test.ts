import { describe, expect, it } from "vitest";
import {
  TRX_TOKEN_ID,
  bancorOutput,
  normalizeTokenId,
  proportionalOther,
  slippageFloor,
  splitPair,
  tokenIdLabel,
  withdrawIsPrecise,
} from "./index.js";

const TRX = 1_000_000n; // sun per TRX

describe("bancor pricing", () => {
  /**
   * The v4.12.0 spec's §4.4 worked example, in minimal units: a 10,000 TRX / 500,000 MyToken pool
   * (precision 6), selling 100 TRX. The spec states the predicted return as 4,950 whole tokens —
   * an independent check on the port, since that number was written from the chain's behaviour and
   * not from this code.
   */
  it("matches the spec's worked example", () => {
    const out = bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 100n * TRX);
    expect(out / 1_000_000n).toBe(4950n);
  });

  it("prices below the naive reserve ratio — the pool's own price impact", () => {
    // the quoted rate would give 5,000; the curve gives less, and the gap is the impact
    const out = bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 100n * TRX);
    expect(out).toBeLessThan(5_000n * 1_000_000n);
  });

  it("gets monotonically worse per unit as the trade grows", () => {
    const sell = 10_000n * TRX;
    const buy = 500_000n * 1_000_000n;
    const small = bancorOutput(sell, buy, 10n * TRX);
    const large = bancorOutput(sell, buy, 1_000n * TRX);
    // ten times the size returns less than ten times the tokens
    expect(large).toBeLessThan(small * 100n);
    expect(large).toBeGreaterThan(small);
  });

  it("returns zero rather than throwing on a closed or empty pool", () => {
    expect(bancorOutput(0n, 500n, 10n)).toBe(0n);
    expect(bancorOutput(500n, 0n, 10n)).toBe(0n);
    expect(bancorOutput(500n, 500n, 0n)).toBe(0n);
  });

  it("returns zero when the trade is too small to move the curve by a unit", () => {
    // a thin buy side: one sun against a pool holding a single unit of the other token buys nothing
    expect(bancorOutput(1_000_000n * TRX, 1n, 1n)).toBe(0n);
    // and the same pool as the worked example still pays out for one sun, because that side holds
    // 50 units per sun — "too small" is about the ratio, not the absolute amount
    expect(bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 1n)).toBe(49n);
  });
});

describe("slippage floor", () => {
  it("rounds the floor down, matching the spec's 1% example", () => {
    // predicted 4,950 whole tokens → 1% → 4,900.5 → 4,900
    expect(slippageFloor(4950n, 1)).toBe(4900n);
  });

  it("never returns a non-positive floor — the protocol rejects expected <= 0", () => {
    expect(slippageFloor(1n, 99)).toBe(1n);
  });

  it("rejects a percentage outside (0, 100) and an unpriceable trade", () => {
    expect(() => slippageFloor(100n, 0)).toThrow(/--slippage/);
    expect(() => slippageFloor(100n, 100)).toThrow(/--slippage/);
    expect(() => slippageFloor(100n, -1)).toThrow(/--slippage/);
    expect(() => slippageFloor(0n, 1)).toThrow(/too small to return anything/);
  });
});

describe("proportional inject / withdraw", () => {
  it("computes the other side the way the actuator does — multiply, then floor", () => {
    // 10,000 TRX / 500,000 tokens, inject 1,000 TRX → 50,000 tokens
    expect(proportionalOther(10_000n * TRX, 500_000n * 1_000_000n, 1_000n * TRX)).toBe(
      50_000n * 1_000_000n,
    );
  });

  it("returns zero when the amount is too small for the ratio", () => {
    expect(proportionalOther(1_000_000n, 1n, 1n)).toBe(0n);
    expect(proportionalOther(0n, 5n, 5n)).toBe(0n);
  });

  it("accepts a clean withdrawal and rejects a fractional one", () => {
    const first = 10_000n * TRX;
    const second = 500_000n * 1_000_000n;
    expect(withdrawIsPrecise(first, second, 1_000n * TRX)).toBe(true);
    // an amount whose counterpart does not divide cleanly trips the 0.01% tolerance
    expect(withdrawIsPrecise(3n, 7n, 1n)).toBe(false);
  });
});

describe("token ids", () => {
  it("normalises every accepted spelling of TRX", () => {
    for (const value of ["TRX", "trx", "Trx", "_", " TRX "]) {
      expect(normalizeTokenId(value)).toBe(TRX_TOKEN_ID);
    }
  });

  it("passes numeric TRC10 ids through", () => {
    expect(normalizeTokenId("1000123")).toBe("1000123");
  });

  it("refuses names, because a TRC10 name may contain a colon", () => {
    expect(() => normalizeTokenId("MyToken")).toThrow(/not a token id/);
    expect(() => normalizeTokenId("AB:CD")).toThrow(/not a token id/);
  });

  it("labels the native side as TRX", () => {
    expect(tokenIdLabel(TRX_TOKEN_ID)).toBe("TRX");
    expect(tokenIdLabel("1000123")).toBe("1000123");
  });

  it("splits pair flags and rejects malformed ones", () => {
    expect(splitPair("TRX:1000123", "--pair")).toEqual(["TRX", "1000123"]);
    for (const bad of ["TRX", "TRX:", ":1000123", "a:b:c", ""]) {
      expect(() => splitPair(bad, "--pair")).toThrow(/--pair must be/);
    }
  });
});
