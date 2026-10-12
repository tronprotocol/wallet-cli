/**
 * CLI sort names → the market API's field names.
 *
 * The CLI names what a person is ranking by (`tvl`, `volume-24h`); the service names its own
 * columns (`reserveUsd`, `volumeUsd1d`). Translating here keeps the service's vocabulary out of
 * the command surface, so a field rename upstream is a change in one map rather than in help
 * text, JSON output and every caller's script.
 *
 * The maps differ per endpoint because the service's do: tokens can be ranked by two fields,
 * pools by four. An unknown name is refused rather than passed through — the service answers an
 * unknown sort field with an unsorted list, which reads as a real answer.
 */
import { UsageError } from "../errors/index.js";

export const TOKEN_ORDER_BY = { tvl: "reserveUsd", "volume-24h": "volumeUsd1d" } as const;

export type TokenOrderBy = keyof typeof TOKEN_ORDER_BY;

export const POOL_ORDER_BY = {
  tvl: "reserveUsd",
  "volume-24h": "volumeUsd1d",
  "fees-24h": "feeUsd1d",
  apr: "totalApr",
} as const;

export type PoolOrderBy = keyof typeof POOL_ORDER_BY;

export function poolSortField(value: string): string {
  const field = POOL_ORDER_BY[value as PoolOrderBy];
  if (field === undefined) {
    throw new UsageError(
      "invalid_value",
      `--order-by must be one of ${Object.keys(POOL_ORDER_BY).join(", ")}`,
    );
  }
  return field;
}

export function tokenSortField(value: string): string {
  const field = TOKEN_ORDER_BY[value as TokenOrderBy];
  if (field === undefined) {
    throw new UsageError(
      "invalid_value",
      `--order-by must be one of ${Object.keys(TOKEN_ORDER_BY).join(", ")}`,
    );
  }
  return field;
}
