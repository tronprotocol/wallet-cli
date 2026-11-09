import { describe, expect, it } from "vitest";
import { maxLiquidityForAmounts, SqrtPriceMath, TickMath } from "@sun-protocol/sun-sdk-sunswap-v3";
import { MAX_TICK, MIN_TICK } from "../../../domain/sunswap/ticks.js";

const ratio = (tick: number): bigint => BigInt(TickMath.getSqrtRatioAtTick(tick).toString());

describe("the SDK's tick table against the published anchors", () => {
  it("is exactly 2^96 at tick zero, where the price is 1", () => {
    expect(ratio(0)).toBe(79228162514264337593543950336n);
  });

  it("matches MIN_SQRT_RATIO and MAX_SQRT_RATIO at the extremes", () => {
    expect(ratio(MIN_TICK)).toBe(4295128739n);
    expect(ratio(MAX_TICK)).toBe(1461446703485210103287273052203988822378723970342n);
  });

  it("agrees with our tick bounds", () => {
    expect(TickMath.MIN_TICK).toBe(MIN_TICK);
    expect(TickMath.MAX_TICK).toBe(MAX_TICK);
  });
});

describe("the SDK's tick table against live pool state", () => {
  it.each([
    ["fee 100", -7129, 55474377522488962541584053457n],
    ["fee 500", -7032, 55743275095956664623638036817n],
    ["fee 10000", -7602, 54178758088052297440834986689n],
    ["fee 3000, initialised and never traded", MIN_TICK, 4295128740n],
  ])("brackets %s's price between its tick and the next", (_name, tick, sqrtPriceX96) => {
    expect(ratio(tick)).toBeLessThanOrEqual(sqrtPriceX96);
    expect(ratio(tick + 1)).toBeGreaterThan(sqrtPriceX96);
  });
});

describe("the SDK's liquidity arithmetic", () => {
  const current = TickMath.getSqrtRatioAtTick(0);
  const lower = TickMath.getSqrtRatioAtTick(-6000);
  const upper = TickMath.getSqrtRatioAtTick(6000);

  it("round-trips a balanced deposit without gaining or losing a unit", () => {
    const liquidity = maxLiquidityForAmounts(current, lower, upper, "1000000", "1000000", true);
    expect(SqrtPriceMath.getAmount0Delta(current, upper, liquidity, true).toString()).toBe(
      "1000000",
    );
    expect(SqrtPriceMath.getAmount1Delta(lower, current, liquidity, true).toString()).toBe(
      "1000000",
    );
  });

  it("is limited by the side that runs out first", () => {
    const scarce = maxLiquidityForAmounts(current, lower, upper, "1000000", "1000000", true);
    const plenty = maxLiquidityForAmounts(
      current,
      lower,
      upper,
      "1000000",
      "1000000000000000000",
      true,
    );
    expect(plenty.toString()).toBe(scarce.toString());
  });
});
