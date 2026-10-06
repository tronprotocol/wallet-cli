/**
 * `pool-list --min-tvl`: the threshold, the test a pool must pass, and the local order used when
 * the qualifying set has to be sorted here rather than by the service (PM 7.3.3).
 *
 * Every comparison is exact. A TVL of 99999.999999999999999999 is below 100000, and two APRs a
 * double cannot tell apart still sort in a fixed order.
 */
import { UsageError } from "../errors/index.js";
import { compareDecimal, isSignedDecimal, isUnsignedDecimal } from "./decimal.js";

/**
 * The threshold as a plain non-negative decimal string.
 *
 * `1e5` is refused: it is a number, but not a decimal string, and accepting it would mean reading
 * the threshold as a float.
 */
export function parseMinTvl(value: string): string {
  const trimmed = value.trim();
  if (!isUnsignedDecimal(trimmed)) {
    throw new UsageError(
      "invalid_value",
      `--min-tvl must be a non-negative decimal amount in USD, such as 100000 (got: ${JSON.stringify(value)})`,
    );
  }
  return trimmed;
}

/** a threshold every pool meets, so filtering by it changes nothing. */
export function isNoThreshold(minTvl: string): boolean {
  return compareDecimal(minTvl, "0") === 0;
}

/** A record without a usable TVL cannot be shown to meet any threshold, so it does not. */
export function meetsMinTvl(reserveUsd: string, minTvl: string): boolean {
  return isSignedDecimal(reserveUsd) && compareDecimal(reserveUsd, minTvl) >= 0;
}

/**
 * A copy of `pools` ordered by `value`, descending or ascending.
 *
 * Ties are broken by pool address, ascending in both directions, so the same set always comes out
 * in the same order. A value that is not a decimal sorts last in both directions: it has no place
 * in the ranking, and putting it first would rank it above every real figure.
 */
export function sortPoolsBy<T extends { readonly poolAddress: string }>(
  pools: readonly T[],
  value: (pool: T) => string,
  desc: boolean,
): T[] {
  return [...pools].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    const aValid = isSignedDecimal(a);
    const bValid = isSignedDecimal(b);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid) {
      const order = compareDecimal(a, b);
      if (order !== 0) return desc ? -order : order;
    }
    return left.poolAddress < right.poolAddress ? -1 : left.poolAddress > right.poolAddress ? 1 : 0;
  });
}
