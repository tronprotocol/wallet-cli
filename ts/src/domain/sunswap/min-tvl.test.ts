import { describe, expect, it } from "vitest";
import { compareDecimal } from "./decimal.js";
import { meetsMinTvl, parseMinTvl, sortPoolsBy } from "./min-tvl.js";

describe("compareDecimal", () => {
  it("compares past what a double holds", () => {
    expect(compareDecimal("0.10000000000000000001", "0.1")).toBe(1);
    expect(Number("0.10000000000000000001")).toBe(Number("0.1"));
  });

  it("treats trailing zeros as the same value", () => {
    expect(compareDecimal("0.050", "0.05")).toBe(0);
  });

  it("orders signed values", () => {
    expect(compareDecimal("-1.5", "-1.25")).toBe(-1);
    expect(compareDecimal("-0.5", "0")).toBe(-1);
  });
});

describe("parseMinTvl", () => {
  it.each(["0", "100000", "15963.5", " 100 "])("accepts %j", (value) => {
    expect(parseMinTvl(value)).toBe(value.trim());
  });

  // 1e5 is a number but not a decimal string; accepting it would mean parsing it as a float.
  it.each(["-1", "abc", "1e5", "", " ", ".5", "1.", "+1", "1,000"])("refuses %j", (value) => {
    expect(() => parseMinTvl(value)).toThrow(
      expect.objectContaining({
        code: "invalid_value",
        message: expect.stringContaining("--min-tvl"),
      }),
    );
  });
});

describe("meetsMinTvl", () => {
  it("includes the threshold itself", () => {
    expect(meetsMinTvl("100000", "100000")).toBe(true);
    expect(meetsMinTvl("100000.000000000000000001", "100000")).toBe(true);
    expect(meetsMinTvl("99999.999999999999999999", "100000")).toBe(false);
  });

  // A record with no TVL cannot be shown to meet any threshold.
  it("does not qualify a record without a usable TVL", () => {
    expect(meetsMinTvl("", "0.01")).toBe(false);
    expect(meetsMinTvl("n/a", "0.01")).toBe(false);
  });
});

describe("sortPoolsBy", () => {
  const pool = (poolAddress: string, totalApr: string) => ({ poolAddress, totalApr });
  const apr = (p: { totalApr: string }) => p.totalApr;

  it("sorts exactly, breaking ties by pool address in both directions", () => {
    const pools = [pool("TC", "0.05"), pool("TB", "0.050"), pool("TA", "0.1"), pool("TD", "0.05")];
    expect(sortPoolsBy(pools, apr, true).map((p) => p.poolAddress)).toEqual([
      "TA",
      "TB",
      "TC",
      "TD",
    ]);
    expect(sortPoolsBy(pools, apr, false).map((p) => p.poolAddress)).toEqual([
      "TB",
      "TC",
      "TD",
      "TA",
    ]);
  });

  it("puts a value that is not a decimal last in either direction", () => {
    const pools = [pool("TA", ""), pool("TB", "0.2"), pool("TC", "0.1")];
    expect(sortPoolsBy(pools, apr, true).map((p) => p.poolAddress)).toEqual(["TB", "TC", "TA"]);
    expect(sortPoolsBy(pools, apr, false).map((p) => p.poolAddress)).toEqual(["TC", "TB", "TA"]);
  });

  it("leaves its input untouched", () => {
    const pools = [pool("TB", "0.1"), pool("TA", "0.2")];
    sortPoolsBy(pools, apr, true);
    expect(pools.map((p) => p.poolAddress)).toEqual(["TB", "TA"]);
  });
});
