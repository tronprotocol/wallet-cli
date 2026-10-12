import { describe, expect, it } from "vitest";
import {
  bipsToSlippage,
  DEFAULT_CURVE_SLIPPAGE,
  feeRatePercent,
  LAUNCHPAD_STATE,
  selectFloor,
  slippageToBips,
} from "./curve.js";

describe("slippageToBips", () => {
  it.each([
    ["0.05", 500],
    ["0.5", 5000],
    ["0.0001", 1],
    ["0.0005", 5],
    ["0.01", 100],
    [".05", 500],
    ["0.0500", 500],
  ])("converts %s to %i basis points", (value, bips) => {
    expect(slippageToBips(value)).toBe(bips);
  });

  /**
   * The reason this is text arithmetic and not `Number(value) * 10000`.
   *
   * `0.0003 * 10000` is 2.9999999999999996 in binary floating point and floors to 2 — a caller
   * asking for 0.03% would silently get 0.02%. Upstream computes it that way; this does not.
   */
  it("is exact where floating point is not", () => {
    expect(slippageToBips("0.0003")).toBe(3);
    expect(Math.floor(0.0003 * 10000)).toBe(2);
    expect(slippageToBips("0.0029")).toBe(29);
    expect(slippageToBips("0.1111")).toBe(1111);
  });

  it("refuses a tolerance finer than one basis point rather than rounding it to zero", () => {
    expect(() => slippageToBips("0.00001")).toThrow(/finer than one basis point/);
  });

  it.each([["0"], ["0.00005"], ["0.51"], ["1"]])("refuses %s as out of range", (value) => {
    expect(() => slippageToBips(value)).toThrow();
  });

  it.each([["5%"], ["abc"], ["-0.05"], [""]])("refuses %s as not a decimal", (value) => {
    expect(() => slippageToBips(value)).toThrow();
  });
});

describe("bipsToSlippage", () => {
  it("round-trips the values a caller can type", () => {
    for (const value of ["0.05", "0.5", "0.0001", "0.01", "0.1234"]) {
      expect(bipsToSlippage(slippageToBips(value))).toBe(value);
    }
  });
});

describe("selectFloor", () => {
  it("defaults to 5%, which is ten times the DEX default and deliberately so", () => {
    expect(selectFloor(undefined, undefined)).toEqual({ kind: "slippage", bips: 500 });
    expect(DEFAULT_CURVE_SLIPPAGE).toBe("0.05");
  });

  // Two ways of saying the same thing. A caller who gave both does not know which they are
  // getting, so neither silently wins.
  it("refuses both flags together", () => {
    expect(() => selectFloor("0.05", "1000")).toThrow(/at most one of/);
  });

  it("takes an explicit minimum in the token's smallest unit", () => {
    expect(selectFloor(undefined, "23869070291231229565864")).toEqual({
      kind: "min-out",
      amount: "23869070291231229565864",
    });
  });

  it("refuses a minimum that is not whole base units", () => {
    expect(() => selectFloor(undefined, "1.5")).toThrow(/whole number/);
  });
});

describe("feeRatePercent", () => {
  /**
   * SunPump charges 1% with a 0.01 TRX floor, so the floor is what a small trade actually pays.
   * A 0.1 TRX buy pays 0.01 TRX — ten percent — and the rate is what a caller would otherwise
   * not notice.
   */
  it("reports the rate only when the floor pushed it above one percent", () => {
    expect(feeRatePercent("10000", "100000")).toBe("10");
    expect(feeRatePercent("10000", "1000000")).toBeUndefined();
    expect(feeRatePercent("10000", "500000")).toBe("2");
  });

  it("reports fractional rates to two places, by integer arithmetic", () => {
    expect(feeRatePercent("10000", "300000")).toBe("3.33");
  });

  it("says nothing about a trade of nothing", () => {
    expect(feeRatePercent("10000", "0")).toBeUndefined();
  });
});

describe("LAUNCHPAD_STATE", () => {
  /**
   * Four values, not three. Upstream's enum omits READY_TO_LAUNCH, so a LAUNCHED token's on-chain
   * `3` reads as something else and the token passes a check it should fail — into a transaction
   * that must revert.
   */
  it("has the four the contract has", () => {
    expect(LAUNCHPAD_STATE).toEqual({
      NOT_EXIST: 0,
      TRADING: 1,
      READY_TO_LAUNCH: 2,
      LAUNCHED: 3,
    });
  });
});
