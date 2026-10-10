import { describe, expect, it } from "vitest";
import { pairPrices, reciprocal, truncate } from "./pair-price.js";

const WTRX = "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
/** the live WTRX/USDT V3 rate: token0 (WTRX) per one token1 (USDT), 40 significant digits. */
const RATE = "2.909173910769221638008798715979251686941";

describe("pairPrices", () => {
  // The rate already says "token0 per one token1", which is what a token0 quote asks for.
  it("takes the rate as it stands when the quote is token0", () => {
    expect(pairPrices([WTRX, USDT], [RATE], WTRX)).toEqual([
      { base: USDT, quote: WTRX, price: "2.909173910769221638" },
    ]);
  });

  it("inverts it when the quote is token1", () => {
    const [entry] = pairPrices([WTRX, USDT], [RATE], USDT);
    expect(entry).toMatchObject({ base: WTRX, quote: USDT });
    // 1 / 2.909173910769221638008798715979251686941 = 0.34374019246432318173…,
    // truncated at 18 places. Checked against an 80-digit decimal, not against a float.
    expect(entry?.price).toBe("0.343740192464323181");
  });

  // A stable pool with three assets has no single pairwise rate; inventing one from the wrong
  // pair of numbers would be worse than the em dash the table shows instead.
  it("declines a pool that is not a plain two-token pool", () => {
    expect(pairPrices([WTRX, USDT, "TX"], [RATE], USDT)).toEqual([]);
    expect(pairPrices([WTRX, USDT], [], USDT)).toEqual([]);
    expect(pairPrices([WTRX, USDT], [RATE, RATE], USDT)).toEqual([]);
  });

  it("declines when the quote token is not in the pool", () => {
    expect(pairPrices([WTRX, USDT], [RATE], "TSOMETHINGELSE")).toEqual([]);
  });
});

describe("reciprocal", () => {
  it("inverts without going through a float", () => {
    expect(reciprocal("2", 18)).toBe("0.500000000000000000");
    expect(reciprocal("4", 2)).toBe("0.25");
  });

  // 1/3 is 0.333… forever; the answer must stop by cutting, never by rounding up.
  it("truncates rather than rounding", () => {
    expect(reciprocal("3", 6)).toBe("0.333333");
    expect(reciprocal("0.7", 6)).toBe("1.428571");
  });

  it("answers zero rather than dividing by it", () => {
    expect(reciprocal("0", 18)).toBe("0");
    expect(reciprocal("0.000", 18)).toBe("0");
  });
});

describe("truncate", () => {
  it("cuts without rounding and pads a short fraction", () => {
    expect(truncate("2.9091739107692216389", 18)).toBe("2.909173910769221638");
    expect(truncate("1.5", 4)).toBe("1.5000");
    expect(truncate("7", 2)).toBe("7.00");
  });

  it("keeps a negative value negative", () => {
    expect(truncate("-1.239", 2)).toBe("-1.23");
  });

  it("returns a non-decimal literal untouched", () => {
    expect(truncate("n/a", 2)).toBe("n/a");
  });
});
