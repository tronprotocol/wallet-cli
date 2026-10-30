import { errorMessage, inputRef, UsageError } from "../errors/index.js";

export const SUNPUMP_ORDER_BY = {
  created: "tokenCreatedInstant",
  "market-cap": "marketCap",
  "volume-24h": "volume24Hr",
  "price-change-24h": "priceChange24Hr",
} as const;

export type SunPumpOrderBy = keyof typeof SUNPUMP_ORDER_BY;

export const SUNPUMP_ORDER_BY_NAMES = Object.keys(SUNPUMP_ORDER_BY) as SunPumpOrderBy[];

export const SUNPUMP_SORT_DIRECTIONS = ["asc", "desc"] as const;

// Owner listings apply this order regardless of requested sorting.
export const OWNER_LISTING_ORDER = { orderBy: "created", sort: "desc" } as const;

// Reject unknown fields and directions; the service silently falls back instead of rejecting.
export function sunpumpSortParam(orderBy: string, sort: string): string {
  const field = SUNPUMP_ORDER_BY[orderBy as SunPumpOrderBy];
  if (field === undefined) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("orderBy")} must be one of ${SUNPUMP_ORDER_BY_NAMES.join(", ")}`,
    );
  }
  if (sort !== "asc" && sort !== "desc") {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("sort")} must be one of asc, desc`,
    );
  }
  return `${field}:${sort.toUpperCase()}`;
}

// Multiplies decimal strings exactly, truncating to places; invalid input returns an empty string.
export function multiplyDecimalTruncating(a: string, b: string, places: number): string {
  const left = splitDecimal(a);
  const right = splitDecimal(b);
  if (!left || !right) return "";
  const scale = left.exponent + right.exponent;
  const product = left.digits * right.digits;
  const scaled =
    scale > places
      ? product / 10n ** BigInt(scale - places)
      : product * 10n ** BigInt(places - scale);
  const negative = scaled < 0n;
  const text = (negative ? -scaled : scaled).toString().padStart(places + 1, "0");
  const whole = text.slice(0, text.length - places);
  const fraction = places === 0 ? "" : text.slice(text.length - places).replace(/0+$/, "");
  const out = fraction === "" ? whole : `${whole}.${fraction}`;
  return negative && !/^0(\.0*)?$/.test(out) ? `-${out}` : out;
}

function splitDecimal(value: string): { digits: bigint; exponent: number } | undefined {
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const digits = BigInt(`${whole}${fraction}`);
  return { digits: negative ? -digits : digits, exponent: fraction.length };
}
