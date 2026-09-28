/**
 * The vendor's tick maths, checked before we size a deposit with it.
 *
 * `@sun-protocol/sun-sdk-sunswap-v3` supplies the Uniswap v3 table rather than us writing one, which removes
 * nineteen chances to mistype a constant. It does not remove the need to check: a wrong value
 * here would mis-size a deposit rather than fail, and we did not write this code and cannot
 * reason about its intent.
 *
 * So it is pinned two ways. The three published anchors catch a table that is wrong everywhere.
 * The live pool prices catch a table that is wrong somewhere: each `sqrtPriceX96` below was
 * computed by the chain from its own copy, so a constant that disagreed could not bracket it.
 */
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

  // Our own bounds and the vendor's must be the same bounds, or a tick we accept is one it
  // cannot price.
  it("agrees with our tick bounds", () => {
    expect(TickMath.MIN_TICK).toBe(MIN_TICK);
    expect(TickMath.MAX_TICK).toBe(MAX_TICK);
  });
});

/**
 * Read off Nile on 2026-09-23 with `slot0()` on the four USDT/WTRX pools
 * (TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf / TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a).
 * The 3000 tier is initialised and never traded, which is why it sits at the floor.
 */
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

  // A symmetric range, at the price it is centred on, takes equal amounts of both sides — and
  // the round trip through liquidity returns exactly what went in.
  it("round-trips a balanced deposit without gaining or losing a unit", () => {
    const liquidity = maxLiquidityForAmounts(current, lower, upper, "1000000", "1000000", true);
    expect(SqrtPriceMath.getAmount0Delta(current, upper, liquidity, true).toString()).toBe(
      "1000000",
    );
    expect(SqrtPriceMath.getAmount1Delta(lower, current, liquidity, true).toString()).toBe(
      "1000000",
    );
  });

  // Whichever side runs out first is what the position is limited to; the excess of the other is
  // simply not deposited, which is what --min0/--min1 exist to bound.
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
