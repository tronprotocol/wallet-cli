import { fromBaseUnits } from "../../domain/amounts/index.js";

/**
 * The rows `account portfolio` reports, for any family.
 *
 * `account portfolio` is ONE command, so both families must produce the same row shape. These
 * helpers live here rather than being copied per family for exactly that reason — a second copy
 * is how two listings drift into reporting different fields for the same thing.
 *
 * Extracted verbatim from the TRON implementation, which is the shape already shipped; the TRON
 * service now delegates here, so its output is unchanged.
 */

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** one readable holding: the raw balance, the same amount scaled, and its valuation if priced. */
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
    // null, never 0, when unpriced: zero reads as "this is worthless", which is a different
    // claim from "we could not find out what it is worth".
    valueUsd: price === null ? null : round6(Number(balance) * price),
    ...extra,
  };
}

/**
 * A holding whose balance could not be read. The row keeps its identity and records why, rather
 * than vanishing from the listing or reporting a fictitious zero — one unreadable token must not
 * take the whole portfolio down with it. The field set stays additive with `holding`, so a
 * consumer can read both kinds of row the same way.
 */
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

/** the portfolio's total, over the rows that could be valued; null when none could. */
export function portfolioTotal(rows: Array<{ valueUsd?: unknown }>): number | null {
  const values = rows
    .map((row) => row.valueUsd)
    .filter((value): value is number => typeof value === "number");
  return values.length ? round6(values.reduce((sum, value) => sum + value, 0)) : null;
}
