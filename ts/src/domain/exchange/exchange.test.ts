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
import { inputRef } from "../errors/index.js";

const TRX = 1_000_000n; // sun per TRX

describe("bancor pricing", () => {
  // A 10,000 TRX / 500,000-token pool uses six-decimal token units.
  it("matches the worked example", () => {
    const out = bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 100n * TRX);
    expect(out / 1_000_000n).toBe(4950n);
  });

  it("prices below the naive reserve ratio — the pool's own price impact", () => {
    const out = bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 100n * TRX);
    expect(out).toBeLessThan(5_000n * 1_000_000n);
  });

  it("gets monotonically worse per unit as the trade grows", () => {
    const sell = 10_000n * TRX;
    const buy = 500_000n * 1_000_000n;
    const small = bancorOutput(sell, buy, 10n * TRX);
    const large = bancorOutput(sell, buy, 1_000n * TRX);
    expect(large).toBeLessThan(small * 100n);
    expect(large).toBeGreaterThan(small);
  });

  it("returns zero rather than throwing on a closed or empty pool", () => {
    expect(bancorOutput(0n, 500n, 10n)).toBe(0n);
    expect(bancorOutput(500n, 0n, 10n)).toBe(0n);
    expect(bancorOutput(500n, 500n, 0n)).toBe(0n);
  });

  it("returns zero when the trade is too small to move the curve by a unit", () => {
    expect(bancorOutput(1_000_000n * TRX, 1n, 1n)).toBe(0n);
    // The minimum viable trade depends on the reserve ratio.
    expect(bancorOutput(10_000n * TRX, 500_000n * 1_000_000n, 1n)).toBe(49n);
  });
});

describe("slippage floor", () => {
  it("rounds the floor down, matching the 1% worked example", () => {
    expect(slippageFloor(4950n, 1)).toBe(4900n);
  });

  it("never returns a non-positive floor — the protocol rejects expected <= 0", () => {
    expect(slippageFloor(1n, 99)).toBe(1n);
  });

  it("rejects a percentage outside (0, 100) and an unpriceable trade", () => {
    expect(() => slippageFloor(100n, 0)).toThrow(/^slippage must be/);
    expect(() => slippageFloor(100n, 100)).toThrow(/^slippage must be/);
    expect(() => slippageFloor(100n, -1)).toThrow(/^slippage must be/);
    expect(() => slippageFloor(0n, 1)).toThrow(/too small to return anything/);
  });
});

describe("proportional inject / withdraw", () => {
  it("computes the other side the way the actuator does — multiply, then floor", () => {
    // Token quantities use six decimals.
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
    expect(splitPair("TRX:1000123", inputRef("pair"))).toEqual(["TRX", "1000123"]);
    for (const bad of ["TRX", "TRX:", ":1000123", "a:b:c", ""]) {
      expect(() => splitPair(bad, inputRef("pair"))).toThrow(/^pair must be/);
    }
  });
});

describe("slippage floor at finer than basis-point precision", () => {
  const predicted = 1_000_000n;

  it("honours a three-decimal percentage exactly", () => {
    expect(slippageFloor(predicted, 1.006)).toBe(989_940n);
  });

  it("does not tighten a percentage that used to round up", () => {
    expect(slippageFloor(predicted, 1.004)).toBe(989_960n);
    expect(slippageFloor(predicted, 0.334)).toBe(996_660n);
  });

  it("keeps a very tight tolerance below the predicted output", () => {
    expect(slippageFloor(predicted, 0.001)).toBe(999_990n);
    expect(slippageFloor(predicted, 0.001)).toBeLessThan(predicted);
    expect(slippageFloor(predicted, 0.0049)).toBeLessThan(predicted);
  });

  it("leaves every percentage basis points could already express unchanged", () => {
    expect(slippageFloor(predicted, 1)).toBe(990_000n);
    expect(slippageFloor(predicted, 0.5)).toBe(995_000n);
    expect(slippageFloor(predicted, 0.01)).toBe(999_900n);
    expect(slippageFloor(predicted, 2.5)).toBe(975_000n);
    expect(slippageFloor(4950n, 1)).toBe(4900n);
  });

  it("rounds a tolerance finer than its resolution down, never up", () => {
    const finer = slippageFloor(predicted, 1.0000001);
    expect(finer).toBeGreaterThanOrEqual(slippageFloor(predicted, 1.000001));
    expect(finer).toBe(990_000n);
  });

  it("still clamps to a positive floor at an extreme tolerance", () => {
    expect(slippageFloor(1n, 99.999)).toBe(1n);
  });
});
