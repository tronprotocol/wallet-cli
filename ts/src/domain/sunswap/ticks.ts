import { errorMessage, inputRef, UsageError } from "../errors/index.js";

// Fee in millionths (3000 = 0.3%) to tick spacing.
export const V3_FEE_TIERS = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
} as const;

export type V3FeeTier = keyof typeof V3_FEE_TIERS;

export const DEFAULT_V3_FEE_TIER = 3000;

// Contract tick-index bounds.
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

// Default span on each side of the current tick.
export const DEFAULT_RANGE_SPACINGS = 100;

export function tickSpacing(fee: number): number {
  const spacing = V3_FEE_TIERS[fee as V3FeeTier];
  if (spacing === undefined) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("fee")} must be one of ${Object.keys(V3_FEE_TIERS).join(", ")}`,
    );
  }
  return spacing;
}

// Default ticks use nearest spacing; exact halves round toward +infinity to match the SDK.
export function alignTick(tick: number, spacing: number): number {
  const aligned = Math.round(tick / spacing) * spacing;
  // Normalize Math.round(-0.5) from -0 to 0.
  return clampAligned(aligned + 0, spacing);
}

// Clamp outside ticks inward onto the grid; ticks already within bounds are unchanged.
export function clampAligned(tick: number, spacing: number): number {
  if (tick > MAX_TICK) return Math.floor(MAX_TICK / spacing) * spacing;
  if (tick < MIN_TICK) return Math.ceil(MIN_TICK / spacing) * spacing;
  return tick;
}

export function clampTick(tick: number): number {
  return Math.min(MAX_TICK, Math.max(MIN_TICK, tick));
}

// Reject user boundaries instead of rounding them and changing the position; field names the input.
export function assertAligned(tick: number, spacing: number, field: string): void {
  if (!Number.isInteger(tick)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be an integer tick index`,
    );
  }
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be between ${MIN_TICK} and ${MAX_TICK}`,
    );
  }
  if (tick % spacing !== 0) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef(field)} must be a multiple of the tick spacing for this fee tier (${spacing})`,
    );
  }
}

export function defaultTickRange(
  currentTick: number,
  spacing: number,
): { tickLower: number; tickUpper: number } {
  const centre = alignTick(currentTick, spacing);
  const span = DEFAULT_RANGE_SPACINGS * spacing;
  return {
    tickLower: clampAligned(centre - span, spacing),
    tickUpper: clampAligned(centre + span, spacing),
  };
}

export function assertRange(tickLower: number, tickUpper: number): void {
  if (tickLower >= tickUpper) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("tickLower")} must be below ${inputRef("tickUpper")}`,
    );
  }
}
