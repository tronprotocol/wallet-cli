import { describe, expect, it } from "vitest";
import {
  applyMinimumShare,
  DEFAULT_DEADLINE_MINUTES,
  DEFAULT_V2_MIN_BASIS_POINTS,
  expectedLpAmount,
  lowerBySlippage,
  lpRedemption,
  pairAmount,
  raiseBySlippage,
  resolveDeadline,
  selectAmounts,
} from "./liquidity.js";

describe("applyMinimumShare", () => {
  it("takes the default 95% share", () => {
    expect(applyMinimumShare("1000000", DEFAULT_V2_MIN_BASIS_POINTS)).toBe("950000");
  });

  it("stays exact on a value far past what a float holds", () => {
    expect(applyMinimumShare("392657176790371861588", 9500n)).toBe("373024317950853268508");
  });

  it("truncates rather than rounding, so the floor is never above the share asked for", () => {
    expect(applyMinimumShare("7", 9500n)).toBe("6");
  });
});

describe("resolveDeadline", () => {
  const now = 1_790_000_000_000;

  it("defaults to 30 minutes from now", () => {
    expect(resolveDeadline(undefined, now)).toBe(Math.floor(now / 1000) + 30 * 60);
    expect(DEFAULT_DEADLINE_MINUTES).toBe(30);
  });

  it("keeps an explicit future deadline", () => {
    const future = Math.floor(now / 1000) + 60;
    expect(resolveDeadline(future, now)).toBe(future);
  });

  it("refuses a deadline already past", () => {
    expect(() => resolveDeadline(Math.floor(now / 1000) - 1, now)).toThrow(
      /^deadline is already in the past/,
    );
  });

  it("refuses a fractional deadline", () => {
    expect(() => resolveDeadline(1.5, now)).toThrow(/whole number of seconds/);
  });
});

describe("selectAmounts", () => {
  it("reports which side was sized", () => {
    expect(selectAmounts("100", undefined)).toEqual({ kind: "amount0", amount0: "100" });
    expect(selectAmounts(undefined, "200")).toEqual({ kind: "amount1", amount1: "200" });
    expect(selectAmounts("100", "200")).toEqual({
      kind: "both",
      amount0: "100",
      amount1: "200",
    });
  });

  it("refuses when neither side was given", () => {
    expect(() => selectAmounts(undefined, undefined)).toThrow(/requires amount0 or amount1/);
  });
});

describe("pairAmount", () => {
  it("pairs the given side against the pool's ratio", () => {
    expect(pairAmount("1000000", "2000000", "4000000")).toBe("2000000");
  });

  it("truncates the derived side rather than rounding up", () => {
    expect(pairAmount("3", "2", "3")).toBe("4");
    expect(pairAmount("1", "3", "1")).toBe("0");
  });

  it("stays exact past float precision", () => {
    expect(pairAmount("392657176790371861588", "1000000", "3000000")).toBe(
      "1177971530371115584764",
    );
  });

  it("refuses to derive from a pool holding none of that token", () => {
    expect(() => pairAmount("100", "0", "500")).toThrow(/this pool holds none of that token/);
  });

  it("refuses an amount that is not whole base units", () => {
    expect(() => pairAmount("1.5", "10", "10")).toThrow(/whole number of base units/);
  });
});

describe("expectedLpAmount", () => {
  it("credits the smaller of the two sides' ratios", () => {
    expect(expectedLpAmount("100", "100", "1000", "2000", "500")).toBe("25");
    expect(expectedLpAmount("100", "200", "1000", "2000", "500")).toBe("50");
  });

  it("truncates rather than rounding up", () => {
    expect(expectedLpAmount("3", "3", "2", "2", "1")).toBe("1");
  });

  it("declines to answer for a pool with no supply or no reserves", () => {
    expect(expectedLpAmount("100", "100", "1000", "2000", "0")).toBeUndefined();
    expect(expectedLpAmount("100", "100", "0", "2000", "500")).toBeUndefined();
    expect(expectedLpAmount("100", "100", "1000", "0", "500")).toBeUndefined();
  });

  it("stays exact past float precision", () => {
    expect(
      expectedLpAmount(
        "392657176790371861588",
        "392657176790371861588",
        "1000000000000000000000",
        "1000000000000000000000",
        "500000000000000000000",
      ),
    ).toBe("196328588395185930794");
  });
});

describe("slippage bounds", () => {
  it("lowers an expected output by the tolerance, rounding down", () => {
    expect(lowerBySlippage("1000", 50)).toBe("995");
    expect(lowerBySlippage("999", 50)).toBe("994");
    expect(lowerBySlippage("1000", 0)).toBe("1000");
  });

  it("raises a deposit ceiling by the tolerance, rounding down", () => {
    expect(raiseBySlippage("1000", 50)).toBe("1005");
    expect(raiseBySlippage("999", 50)).toBe("1003");
    expect(raiseBySlippage("1000", 0)).toBe("1000");
  });
});

describe("lpRedemption", () => {
  it("pays the burned share of the reserve, rounding down", () => {
    expect(lpRedemption("1", "10", "3")).toBe("3");
    expect(lpRedemption("50", "1000", "100")).toBe("500");
  });

  it("refuses non-integer input", () => {
    expect(() => lpRedemption("1.5", "10", "3")).toThrow(/whole number of base units/);
  });
});
