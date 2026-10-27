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
    // Math.abs removes negative zero, which toBe(0) rejects.
    expect(Math.abs(range.tickLower % 60)).toBe(0);
    expect(Math.abs(range.tickUpper % 60)).toBe(0);
    expect(range.tickUpper - range.tickLower).toBe(2 * 100 * 60);
  });

  it("stays inside the representable range near the bounds", () => {
    const range = defaultTickRange(MAX_TICK, 200);
    expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK);
    expect(defaultTickRange(MIN_TICK, 200).tickLower).toBeGreaterThanOrEqual(MIN_TICK);
  });

  it.each([1, 10, 12, 60, 200])("is aligned, in bounds and ordered at spacing %i", (spacing) => {
    for (const tick of [MIN_TICK, MIN_TICK + 5, -1, 0, 1, MAX_TICK - 5, MAX_TICK]) {
      const range = defaultTickRange(tick, spacing);
      expect(Math.abs(range.tickLower % spacing)).toBe(0);
      expect(Math.abs(range.tickUpper % spacing)).toBe(0);
      expect(range.tickLower).toBeGreaterThanOrEqual(MIN_TICK);
      expect(range.tickUpper).toBeLessThanOrEqual(MAX_TICK);
      expect(range.tickLower).toBeLessThan(range.tickUpper);
    }
  });

  it.each([1, 10, 12, 60, 200])("produces a range assertAligned accepts, spacing %i", (spacing) => {
    for (const tick of [MIN_TICK, 0, MAX_TICK]) {
      const range = defaultTickRange(tick, spacing);
      expect(() => assertAligned(range.tickLower, spacing, "--tick-lower")).not.toThrow();
      expect(() => assertAligned(range.tickUpper, spacing, "--tick-upper")).not.toThrow();
    }
  });
});

describe("alignTick", () => {
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

describe("alignTick rounds to the nearest multiple", () => {
  it.each([
    [-499, 10, -500],
    [499, 10, 500],
    [-494, 10, -490],
    [494, 10, 490],
  ])("aligns %i on spacing %i to %i", (tick, spacing, expected) => {
    expect(alignTick(tick, spacing)).toBe(expected);
  });

  it("breaks an exact half the way the vendor does, toward +infinity", () => {
    expect(alignTick(5, 10)).toBe(10);
    expect(alignTick(-5, 10)).toBe(0);
  });

  it("never returns negative zero", () => {
    expect(Object.is(alignTick(-5, 10), -0)).toBe(false);
    expect(alignTick(-5, 10)).toBe(0);
  });

  it.each([12, 10, 60, 200])(
    "gives mirrored default bands either side of zero, spacing %i",
    (spacing) => {
      for (const tick of [85, 499, 1234, 7]) {
        // Half-spacing ties round toward +infinity on both sides, so they do not mirror.
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

  it("still refuses a misaligned tick the caller typed", () => {
    expect(() => assertAligned(-499, 10, "--tick-lower")).toThrow(/multiple of the tick spacing/);
    expect(() => assertAligned(-500, 10, "--tick-lower")).not.toThrow();
  });
});
