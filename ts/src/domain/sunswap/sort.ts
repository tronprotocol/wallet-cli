// Reject unknown sort names: the market API otherwise returns an unsorted list.
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
