import { UsageError } from "../errors/index.js";
import { compareDecimal, isSignedDecimal, isUnsignedDecimal } from "./decimal.js";

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

export function isNoThreshold(minTvl: string): boolean {
  return compareDecimal(minTvl, "0") === 0;
}

export function meetsMinTvl(reserveUsd: string, minTvl: string): boolean {
  return isSignedDecimal(reserveUsd) && compareDecimal(reserveUsd, minTvl) >= 0;
}

// Invalid decimals sort last; ties use ascending pool address in either direction.
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
