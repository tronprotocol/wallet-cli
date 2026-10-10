import { describe, expect, it } from "vitest";
import {
  alignTick,
  assertAligned,
  assertRange,
  defaultTickRange,
  MAX_TICK,
  MIN_TICK,
  tickSpacing,
  V3_FEE_TIERS,
} from "./ticks.js";

describe("tickSpacing", () => {
  it("maps each fee tier to its spacing", () => {
    expect(tickSpacing(100)).toBe(1);
    expect(tickSpacing(500)).toBe(10);
    expect(tickSpacing(3000)).toBe(60);
    expect(tickSpacing(10000)).toBe(200);
  });

  it("knows exactly four tiers", () => {
    expect(Object.keys(V3_FEE_TIERS)).toEqual(["100", "500", "3000", "10000"]);
  });

  // A tier the contract does not have would revert after the fee was spent finding out.
  it("refuses a tier outside the four, naming them", () => {
    expect(() => tickSpacing(2500)).toThrow(/--fee must be one of 100, 500, 3000, 10000/);
    expect(() => tickSpacing(0)).toThrow(/--fee must be one of/);
  });
});

describe("assertAligned", () => {
  it("accepts a tick on the grid", () => {
    expect(() => assertAligned(-276360, 60, "--tick-lower")).not.toThrow();
    expect(() => assertAligned(0, 60, "--tick-lower")).not.toThrow();
  });

  /**
   * A caller's tick is checked, never rounded. A range is a price opinion, and shifting it by a
   * spacing silently changes what the position is exposed to.
   */
  it("refuses an unaligned tick rather than moving it", () => {
    expect(() => assertAligned(-276374, 60, "--tick-lower")).toThrow(
      /--tick-lower must be a multiple of the tick spacing for this fee tier \(60\)/,
    );
  });

  it("refuses a tick outside the representable range", () => {
    expect(() => assertAligned(MIN_TICK - 60, 60, "--tick-lower")).toThrow(/must be between/);
    expect(() => assertAligned(MAX_TICK + 60, 60, "--tick-upper")).toThrow(/must be between/);
  });

  it("refuses a non-integer tick", () => {
    expect(() => assertAligned(1.5, 1, "--tick-lower")).toThrow(/must be an integer tick index/);
  });

  it("names the flag it was checking", () => {
    expect(() => assertAligned(7, 60, "--tick-upper")).toThrow(/--tick-upper/);
  });
});

describe("defaultTickRange", () => {
  it("spans 100 spacings either side of the current tick, on the grid", () => {
    const range = defaultTickRange(-276374, 60);
    // `% 60` on a negative multiple gives -0, which toBe(0) rejects; the question is divisibility
    expect(Math.abs(range.tickLower % 60)).toBe(0);
    expect(Math.abs(range.tickUpper % 60)).toBe(0);
    expect(range.tickUpper - range.tickLower).toBe(2 * 100 * 60);
  });

  it("stays inside the representable range near the bounds", () => {
    const range = defaultTickRange(MAX_TICK, 200);
    expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK);
    expect(defaultTickRange(MIN_TICK, 200).tickLower).toBeGreaterThanOrEqual(MIN_TICK);
  });

  /**
   * AND STAYS ON THE GRID THERE, which it did not.
   *
   * The case above checked the bounds and not the alignment, so it passed while the range was
   * unusable: `MIN_TICK` is -887272 and no spacing in use divides it, so clamping produced an off-grid
   * edge that the contract refuses. At spacing 60 BOTH ends were off, because the clamp had pulled the
   * aligned centre itself off the grid before the span was applied.
   *
   * Asserted as a property over every spacing in use and every interesting tick, rather than as the
   * two examples that were there: the examples were what let this through.
   */
  it.each([1, 10, 12, 60, 200])("is aligned, in bounds and ordered at spacing %i", (spacing) => {
    for (const tick of [MIN_TICK, MIN_TICK + 5, -1, 0, 1, MAX_TICK - 5, MAX_TICK]) {
      const range = defaultTickRange(tick, spacing);
      // `Math.abs`, because `%` on a negative multiple gives `-0` and `toBe(0)` rejects it. The
      // existing case above documented that trap and I walked into it anyway.
      expect(Math.abs(range.tickLower % spacing)).toBe(0);
      expect(Math.abs(range.tickUpper % spacing)).toBe(0);
      expect(range.tickLower).toBeGreaterThanOrEqual(MIN_TICK);
      expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK);
      expect(range.tickLower).toBeLessThan(range.tickUpper);
    }
  });

  // A default range the CALLER never typed must still pass the check a caller's range would face;
  // otherwise the CLI produces input it would itself reject.
  it.each([1, 10, 12, 60, 200])("produces a range assertAligned accepts, spacing %i", (spacing) => {
    for (const tick of [MIN_TICK, 0, MAX_TICK]) {
      const range = defaultTickRange(tick, spacing);
      expect(() => assertAligned(range.tickLower, spacing, "--tick-lower")).not.toThrow();
      expect(() => assertAligned(range.tickUpper, spacing, "--tick-upper")).not.toThrow();
    }
  });
});

describe("alignTick", () => {
  // These three are unchanged by the move from toward-zero to nearest: 125/60 rounds to 2 either way.
  // The title was not — it used to say "toward zero", which became false.
  it("puts a tick on the grid", () => {
    expect(alignTick(125, 60)).toBe(120);
    expect(alignTick(-125, 60)).toBe(-120);
    expect(alignTick(120, 60)).toBe(120);
  });
});

describe("assertRange", () => {
  it("requires the range to have width and to run upward", () => {
    expect(() => assertRange(-120, 120)).not.toThrow();
    expect(() => assertRange(120, 120)).toThrow(/--tick-lower must be below --tick-upper/);
    expect(() => assertRange(120, -120)).toThrow(/--tick-lower must be below --tick-upper/);
  });
});

/**
 * Alignment rounds to the NEAREST multiple, and the reason is the seam it removes.
 *
 * It rounded toward zero until V4 made the automatic band load-bearing. Toward zero rounds UP below
 * tick 0 and DOWN above it, so an automatic range is pulled toward zero from whichever side the pool
 * sits on — two mirrored pools get bands that are not mirrors, for no reason anyone could state.
 */
describe("alignTick rounds to the nearest multiple", () => {
  it.each([
    [-499, 10, -500],
    [499, 10, 500],
    [-494, 10, -490],
    [494, 10, 490],
  ])("aligns %i on spacing %i to %i", (tick, spacing, expected) => {
    expect(alignTick(tick, spacing)).toBe(expected);
  });

  /**
   * An exact half breaks toward +infinity rather than away from zero, so 5 and -5 on spacing 10 do
   * NOT mirror. That is `Math.round`, and it is character for character what the vendor's
   * `nearestUsableTick` computes — matching it is worth more than a symmetry we would hold alone. It
   * costs one tick value per spacing per side, where rounding toward zero was biased on nearly half
   * of them. Pinned so it reads as a decision rather than an accident.
   */
  it("breaks an exact half the way the vendor does, toward +infinity", () => {
    expect(alignTick(5, 10)).toBe(10);
    expect(alignTick(-5, 10)).toBe(0);
  });

  // And never negative zero. `Math.round(-0.5)` is `-0`, which compares unequal to zero and would
  // serialise as `-0` in a receipt.
  it("never returns negative zero", () => {
    expect(Object.is(alignTick(-5, 10), -0)).toBe(false);
    expect(alignTick(-5, 10)).toBe(0);
  });

  /**
   * The property that matters, stated as a property rather than as examples: a pool at a negative
   * tick and one at the mirrored positive tick must get mirrored default bands. Rounding toward zero
   * failed this systematically, by side, which is the whole reason it changed.
   *
   * A centre landing exactly on a half-spacing is excluded and pinned separately: that tie breaks
   * toward +infinity on both sides, which is the vendor's own behaviour and is matched deliberately.
   */
  it.each([12, 10, 60, 200])(
    "gives mirrored default bands either side of zero, spacing %i",
    (spacing) => {
      for (const tick of [85, 499, 1234, 7]) {
        // Skip a centre landing exactly on a half-spacing: the tie breaks toward +infinity on both
        // sides, deliberately, to match the vendor. Everything else must mirror — and that is where
        // rounding toward zero used to fail, systematically, by side.
        if (Math.abs(tick % spacing) * 2 === spacing) continue;
        const above = defaultTickRange(tick, spacing);
        const below = defaultTickRange(-tick, spacing);
        expect({ lower: below.tickLower, upper: below.tickUpper }).toEqual({
          lower: -above.tickUpper,
          upper: -above.tickLower,
        });
      }
    },
  );

  // And a tick the CALLER chose is still refused rather than moved. Adjusting someone's boundary
  // changes what they are exposed to, which is a different question from where an auto band lands.
  it("still refuses a misaligned tick the caller typed", () => {
    expect(() => assertAligned(-499, 10, "--tick-lower")).toThrow(/multiple of the tick spacing/);
    expect(() => assertAligned(-500, 10, "--tick-lower")).not.toThrow();
  });
});
