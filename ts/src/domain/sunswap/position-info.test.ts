import { describe, it, expect } from "vitest";
import {
  derivedAmounts,
  feeRate,
  isDynamicFee,
  poolShare,
  priceAtTick,
  rangeStatus,
  sumUsd,
  usdValue,
} from "./position-info.js";

describe("rangeStatus", () => {
  it("is in range from the lower tick up to, but not including, the upper", () => {
    expect(rangeStatus(-276374, -276374, -276274)).toBe("IN_RANGE");
    expect(rangeStatus(-276275, -276374, -276274)).toBe("IN_RANGE");
    // exactly at the upper tick the position holds only token1 and earns nothing
    expect(rangeStatus(-276274, -276374, -276274)).toBe("OUT_RANGE");
    expect(rangeStatus(-276375, -276374, -276274)).toBe("OUT_RANGE");
  });
});

describe("priceAtTick", () => {
  /**
   * PM 7.2.4's own four bounds, to the digit.
   *
   * This is the assertion that pins the double: an arbitrary-precision implementation would be
   * more accurate and would no longer agree with the `min_price` / `max_price` a caller reads
   * beside this command's output in `position-list`.
   */
  it("reproduces PM 7.2.4's published range bounds", () => {
    expect(priceAtTick(-276374, 18, 6)).toBe("0.9950153585777257");
    expect(priceAtTick(-276274, 18, 6)).toBe("1.005014926708653");
    expect(priceAtTick(-12480, 6, 6)).toBe("0.28709629290133126");
    expect(priceAtTick(-9480, 6, 6)).toBe("0.3875336469344778");
  });

  it("rescales by the decimals difference, not by either decimals alone", () => {
    expect(priceAtTick(0, 6, 6)).toBe("1");
    expect(priceAtTick(0, 18, 6)).toBe("1000000000000");
    expect(priceAtTick(0, 6, 18)).toBe("1e-12");
  });
});

describe("poolShare", () => {
  it("divides the position's liquidity by the pool's active liquidity", () => {
    expect(poolShare("1", "4", "IN_RANGE")).toBe("0.250000000000000000");
  });

  it("is zero for an out-of-range position, which holds none of the active liquidity", () => {
    expect(poolShare("1000", "4000", "OUT_RANGE")).toBe("0");
  });

  it("is absent when the pool has no active liquidity, rather than zero", () => {
    expect(poolShare("1000", "0", "IN_RANGE")).toBeUndefined();
  });

  it("keeps enough places that a millionth of a pool is not a zero", () => {
    expect(poolShare("1", "1000000000", "IN_RANGE")).toBe("0.000000001000000000");
  });
});

describe("derivedAmounts", () => {
  /**
   * PM 7.2.4's V4 position, and the `positions-user-v4-88` fixture: the same position at two
   * different moments, with different balances AND a different pool price. Both are reproduced
   * from the pool price implied by their own figures, which is what established the meaning of
   * these two fields in the first place.
   */
  it("restates PM 7.2.4's position on each side of its own pair", () => {
    // The pool price both fields imply, to the digit the two of them agree on. Taken from PM's own
    // numbers rather than supplied: derived1 gives P, and derived0 then has to follow from it.
    const sqrt = sqrtPriceFor(0.9999833482373381, 18, 6);
    const out = derivedAmounts("984154975046066985622761", "976580959229", sqrt)!;
    expect(near(out.derived0, "1960752196340722557463933", 1e-9)).toBe(true);
    expect(near(out.derived1, "1960719546360", 1e-9)).toBe(true);
  });

  /** The same position at a different moment — different balances, different price, same rule. */
  it("restates the positions-user-v4-88 fixture the same way", () => {
    const sqrt = sqrtPriceFor(0.9995454178977554, 18, 6);
    const out = derivedAmounts("1070163618808583559303388", "890592582622", sqrt)!;
    expect(near(out.derived0, "1961161232999063830653955", 1e-9)).toBe(true);
    expect(near(out.derived1, "1960269724203", 1e-9)).toBe(true);
  });

  it("is absent for a pool with no price, rather than dividing by zero", () => {
    expect(derivedAmounts("1", "1", "0")).toBeUndefined();
  });

  it("adds nothing to a single-sided position but its own side", () => {
    const sqrt = (1n << 96n).toString(); // P = 1 in base units
    expect(derivedAmounts("500", "0", sqrt)).toEqual({ derived0: "500", derived1: "500" });
  });
});

describe("usdValue", () => {
  it("is exact for a price with more places than a double could carry", () => {
    // 1 token of 6 decimals at 0.999737704408
    expect(usdValue("1000000", 6, "0.999737704408")).toBe("0.999737704408000000");
  });

  it("values base units, not whole tokens", () => {
    expect(usdValue("1", 6, "2")).toBe("0.000002");
  });

  it("refuses a price that is not a plain decimal rather than valuing it at zero", () => {
    expect(usdValue("1000000", 6, "")).toBeUndefined();
    expect(usdValue("1000000", 6, "1e-7")).toBeUndefined();
  });
});

describe("sumUsd", () => {
  it("adds figures of different precision without losing either", () => {
    expect(sumUsd(["1.5", "2.250"])).toBe("3.750");
  });

  it("is absent when either side is, because a half total is a wrong total", () => {
    expect(sumUsd(["1.5", undefined])).toBeUndefined();
  });
});

describe("feeRate / isDynamicFee", () => {
  it("states a tier as the decimal fraction PM publishes", () => {
    expect(feeRate(100)).toBe("0.0001");
    expect(feeRate(500)).toBe("0.0005");
    expect(feeRate(3000)).toBe("0.003");
    expect(feeRate(10000)).toBe("0.01");
  });

  it("flags a dynamic-fee pool and reports no tier for it", () => {
    expect(isDynamicFee(0x800000)).toBe(true);
    expect(isDynamicFee(3000)).toBe(false);
    expect(feeRate(0x800000)).toBe("0");
  });
});

/** `sqrt(price) * 2^96`, with the base-unit rescale a pool's price carries. */
function sqrtPriceFor(price: number, decimals0: number, decimals1: number): string {
  const raw = price * Math.pow(10, decimals1 - decimals0);
  return BigInt(Math.floor(Math.sqrt(raw) * 2 ** 96)).toString();
}

/** Two integer strings agree to within a relative tolerance — the test's own float is the slack. */
function near(actual: string, expected: string, tolerance: number): boolean {
  const a = Number(actual);
  const b = Number(expected);
  return Math.abs(a - b) / b < tolerance;
}
