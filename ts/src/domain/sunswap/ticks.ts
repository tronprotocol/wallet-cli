/**
 * V3 fee tiers and the tick grid each one imposes.
 *
 * A V3 position occupies a price RANGE, and the range endpoints are not free: each fee tier has a
 * tick spacing, and a position boundary must sit on a multiple of it. The contract rejects an
 * unaligned tick, so catching it here turns a wasted fee and a confusing revert into a message
 * that says which values are legal.
 *
 * All integer arithmetic. A tick is a bounded integer index, not a price, and the conversion
 * between the two is the contract's business rather than ours.
 */
import { UsageError } from "../errors/index.js";

/** fee tier, in hundredths of a basis point (3000 = 0.3%), to the tick spacing it imposes. */
export const V3_FEE_TIERS = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
} as const;

export type V3FeeTier = keyof typeof V3_FEE_TIERS;

/** The tier a new position gets when the caller does not choose one. */
export const DEFAULT_V3_FEE_TIER = 3000;

/**
 * The widest range the contract representation allows.
 *
 * These are not a policy of ours — they are the bounds of the tick index itself, and a position
 * outside them cannot exist.
 */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

/** How many spacings a default range extends on each side of the current tick. */
export const DEFAULT_RANGE_SPACINGS = 100;

export function tickSpacing(fee: number): number {
  const spacing = V3_FEE_TIERS[fee as V3FeeTier];
  if (spacing === undefined) {
    throw new UsageError(
      "invalid_value",
      `--fee must be one of ${Object.keys(V3_FEE_TIERS).join(", ")}`,
    );
  }
  return spacing;
}

/**
 * Round a tick to the grid its spacing imposes — to the NEAREST multiple.
 *
 * Used for the DEFAULTS, where the CLI chose the value and may adjust it freely. A tick the caller
 * typed is checked rather than adjusted — see `assertAligned`.
 *
 * It rounded toward zero until V4 made this default load-bearing, and toward zero has a
 * DISCONTINUITY AT ZERO: below tick 0 it rounds up, above it rounds down, so an automatic band is
 * pulled toward zero from whichever side the pool happens to sit on, and two mirrored pools behave
 * differently for no reason anyone could state. Measured across five spacings over ticks -500..500,
 * the two rules disagree in 1777 of 5005 cases — spacing 10 at tick -499 gave -490 where nearest
 * gives -500. Nearest has no such seam, and it is also exactly what the vendor's own
 * `nearestUsableTick` computes, so the CLI and the SDK no longer answer the same question two ways.
 *
 * ONE ASYMMETRY REMAINS AND IS DELIBERATE: `Math.round` breaks an exact half toward +infinity rather
 * than away from zero, so a centre landing precisely on a half-spacing — tick 5 at spacing 10 — goes
 * up on both sides of zero, and its band is not the mirror of the negative case's. That is the
 * vendor's behaviour, character for character, and matching it is worth more than a symmetry we would
 * hold alone. It affects one tick value per spacing per side; the systematic bias-by-side that
 * rounding toward zero produced affected almost half of them.
 */
export function alignTick(tick: number, spacing: number): number {
  const aligned = Math.round(tick / spacing) * spacing;
  // `+ 0` normalises negative zero. `Math.round(-0.5)` is `-0`, and a tick of `-0` is numerically
  // zero while comparing unequal to it and serialising as `-0`, which is a needless surprise in a
  // receipt.
  return clampAligned(aligned + 0, spacing);
}

/**
 * Keep a tick inside the representable range AND on the grid, moving INWARD.
 *
 * A plain bound clamp breaks alignment, which was a real bug: `MIN_TICK` is -887272 and no spacing in
 * use divides it, so a default range near either extreme came back off-grid — measured at spacings
 * 10, 12, 60 and 200, and at 60 BOTH ends were off, because clamping had pulled the aligned centre
 * itself off the grid before the span was even applied. The contract rejects an unaligned tick, so a
 * pool near the extremes had a default range it would refuse.
 *
 * Inward rather than outward: outward would leave the range, and the bound is the hard limit.
 */
export function clampAligned(tick: number, spacing: number): number {
  if (tick > MAX_TICK) return Math.floor(MAX_TICK / spacing) * spacing;
  if (tick < MIN_TICK) return Math.ceil(MIN_TICK / spacing) * spacing;
  return tick;
}

/** Keep a tick inside the representable range. */
export function clampTick(tick: number): number {
  return Math.min(MAX_TICK, Math.max(MIN_TICK, tick));
}

/**
 * Check a tick the CALLER supplied.
 *
 * Silently rounding someone's chosen boundary would move their position without telling them —
 * a range is a price opinion, and shifting it by a spacing changes what they are exposed to.
 */
export function assertAligned(tick: number, spacing: number, flag: string): void {
  if (!Number.isInteger(tick)) {
    throw new UsageError("invalid_value", `${flag} must be an integer tick index`);
  }
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new UsageError("invalid_value", `${flag} must be between ${MIN_TICK} and ${MAX_TICK}`);
  }
  if (tick % spacing !== 0) {
    throw new UsageError(
      "invalid_value",
      `${flag} must be a multiple of the tick spacing for this fee tier (${spacing})`,
    );
  }
}

/**
 * The default range for a new position: the current tick, ± 100 spacings, aligned to the grid.
 *
 * The same answer on every protocol. V4 supplies the spacing from the pool's own key rather than from
 * a fee tier, but the question a caller who omitted the range is asking — give me a sensible band
 * around the price — does not change with where the spacing came from, and answering it differently
 * per protocol would make one command behave two ways.
 */
export function defaultTickRange(
  currentTick: number,
  spacing: number,
): { tickLower: number; tickUpper: number } {
  const centre = alignTick(currentTick, spacing);
  const span = DEFAULT_RANGE_SPACINGS * spacing;
  // Clamped ON the grid. A bare bound clamp produced an off-grid edge near either extreme, which the
  // contract refuses — see `clampAligned`.
  return {
    tickLower: clampAligned(centre - span, spacing),
    tickUpper: clampAligned(centre + span, spacing),
  };
}

/** A range is only a range if it has width and runs the right way. */
export function assertRange(tickLower: number, tickUpper: number): void {
  if (tickLower >= tickUpper) {
    throw new UsageError("invalid_value", "--tick-lower must be below --tick-upper");
  }
}
