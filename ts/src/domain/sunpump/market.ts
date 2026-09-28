/**
 * The rules the SunPump catalogue reads by: what may be ordered on, and the decimal arithmetic
 * the published numbers need.
 *
 * The ordering map is the important part. The SunPump API accepts `sort=<field>:<DIRECTION>` and
 * answers an UNKNOWN FIELD by silently falling back to `marketCap` while echoing the string it
 * was sent back in `metadata.sort` — so neither the rows nor the echo reveal that the question
 * was not the one asked. Every member of the map below was verified against the live service by
 * reading the sorted column out of the rows themselves; a name that is not here is refused rather
 * than forwarded.
 *
 * `tokenLaunchedInstant` is deliberately absent. It looks supported — it is a real field on every
 * token and the service answers 200 — but the rows come back in `marketCap` order, which happens
 * to resemble launch order at the top of the catalogue. PM 2.4 lists a `launched` ordering; it
 * cannot be served, so it is not offered.
 */
import { UsageError } from "../errors/index.js";

/** CLI ordering name → the service's column. Verified by checking the column is monotonic. */
export const SUNPUMP_ORDER_BY = {
  created: "tokenCreatedInstant",
  "market-cap": "marketCap",
  "volume-24h": "volume24Hr",
  "price-change-24h": "priceChange24Hr",
} as const;

export type SunPumpOrderBy = keyof typeof SUNPUMP_ORDER_BY;

export const SUNPUMP_ORDER_BY_NAMES = Object.keys(SUNPUMP_ORDER_BY) as SunPumpOrderBy[];

export const SUNPUMP_SORT_DIRECTIONS = ["asc", "desc"] as const;

/** The one ordering `/token/search/by_owner` applies, whatever it is asked for. */
export const OWNER_LISTING_ORDER = { orderBy: "created", sort: "desc" } as const;

/**
 * `("market-cap", "desc")` → `"marketCap:DESC"`.
 *
 * Both halves are checked against a whitelist rather than passed through, because the service
 * ignores an unknown value on either side of the colon instead of rejecting it.
 */
export function sunpumpSortParam(orderBy: string, sort: string): string {
  const field = SUNPUMP_ORDER_BY[orderBy as SunPumpOrderBy];
  if (field === undefined) {
    throw new UsageError(
      "invalid_value",
      `--order-by must be one of ${SUNPUMP_ORDER_BY_NAMES.join(", ")}`,
    );
  }
  if (sort !== "asc" && sort !== "desc") {
    throw new UsageError("invalid_value", "--sort must be one of asc, desc");
  }
  return `${field}:${sort.toUpperCase()}`;
}

/**
 * `a × b`, truncated to `places` decimals, by string arithmetic on BigInt.
 *
 * `priceUsd` is `priceInTrx × trxPriceInUsd`, and both factors carry eighteen significant digits
 * — `Number` keeps fifteen, so the float product would differ from the market's own price in the
 * digits a small-cap token is read by. A value that is not a plain decimal literal is returned as
 * an empty string rather than coerced, so a surprise from the remote does not become a wrong
 * number here.
 */
export function multiplyDecimalTruncating(a: string, b: string, places: number): string {
  const left = splitDecimal(a);
  const right = splitDecimal(b);
  if (!left || !right) return "";
  const scale = left.exponent + right.exponent;
  const product = left.digits * right.digits;
  // Bring the product to exactly `places` decimals: drop what is past them, pad what is short.
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

/** "0.0034" → { digits: 34n, exponent: 4 }; anything that is not a decimal literal → undefined. */
function splitDecimal(value: string): { digits: bigint; exponent: number } | undefined {
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const digits = BigInt(`${whole}${fraction}`);
  return { digits: negative ? -digits : digits, exponent: fraction.length };
}
