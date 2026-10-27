import { fromBaseUnits } from "../../domain/amounts/index.js";

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

// `raw` is in base units; `price` is USD per whole token.
export function holding(
  kind: string,
  symbol: string,
  decimals: number,
  raw: string,
  price: number | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const balance = fromBaseUnits(raw, decimals);
  return {
    kind,
    symbol,
    decimals,
    rawBalance: raw,
    balance,
    priceUsd: price,
    // Unknown valuation is null, not zero.
    valueUsd: price === null ? null : round6(Number(balance) * price),
    ...extra,
  };
}

// Keep unreadable holdings visible with unknown amounts, not fictitious zeroes.
export function unavailableHolding(
  kind: string,
  symbol: string,
  decimals: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind,
    symbol,
    decimals,
    rawBalance: null,
    balance: null,
    priceUsd: null,
    valueUsd: null,
    balanceUnavailable: true,
    reason: "rpc_error",
    ...extra,
  };
}

// Sums known USD values; returns null if none are known.
export function portfolioTotal(rows: Array<{ valueUsd?: unknown }>): number | null {
  const values = rows
    .map((row) => row.valueUsd)
    .filter((value): value is number => typeof value === "number");
  return values.length ? round6(values.reduce((sum, value) => sum + value, 0)) : null;
}
