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
  it("has the four the contract has", () => {
    expect(LAUNCHPAD_STATE).toEqual({
      NOT_EXIST: 0,
      TRADING: 1,
      READY_TO_LAUNCH: 2,
      LAUNCHED: 3,
    });
  });
});
