/**
 * Pool exchange rates, quoted in one chosen token.
 *
 * The service reports a two-token pool's rate as a single number: how many token0 one token1
 * buys. A person asking `--token USDT` wants the opposite framing — what one of the OTHER token
 * is worth in USDT — so the rate is either taken as-is or inverted depending on which side the
 * chosen token sits on.
 *
 * All of it is integer arithmetic on the digit strings. These rates carry nearly 40 significant
 * digits, and inverting one through a float would lose most of them; the result is what someone
 * reads before deciding what to trade.
 */

/** Places kept in the result. Past this the digits say nothing about a price anyone can get. */
const SCALE = 18;

export interface PairPrice {
  /** the token being priced. */
  readonly base: string;
  /** the token it is priced IN — always the one the caller asked for. */
  readonly quote: string;
  /** how many `quote` one `base` buys in this pool, 18 dp, truncated. */
  readonly price: string;
}

/**
 * Compute one pool's prices in terms of `quoteAddress`.
 *
 * Returns nothing when the pool is not a plain two-token pool with one rate: a stable pool with
 * three assets has no single pairwise rate, and inventing one from the wrong pair of numbers
 * would be worse than the em dash the table shows instead.
 */
export function pairPrices(
  tokenAddresses: readonly string[],
  swapRates: readonly string[],
  quoteAddress: string,
): PairPrice[] {
  if (tokenAddresses.length !== 2 || swapRates.length !== 1) return [];
  const [token0, token1] = tokenAddresses as [string, string];
  const rate = swapRates[0] as string;
  if (quoteAddress === token0) {
    // the quote IS token0, so the rate already says "token0 per one token1"
    return [{ base: token1, quote: token0, price: truncate(rate, SCALE) }];
  }
  if (quoteAddress === token1) {
    return [{ base: token0, quote: token1, price: reciprocal(rate, SCALE) }];
  }
  return [];
}

/** 1 / value, as a decimal string truncated to `decimals` places. */
export function reciprocal(value: string, decimals: number): string {
  const parsed = toFraction(value);
  if (parsed === undefined || parsed.digits === 0n) return "0";
  // value = digits / 10^scale, so 1/value = 10^scale / digits; carry `decimals` extra places
  // through the division and let the integer floor do the truncating.
  const scaled = 10n ** BigInt(parsed.scale + decimals) / parsed.digits;
  return format(scaled, decimals);
}

/** Cut a decimal string to `decimals` places without rounding. */
export function truncate(value: string, decimals: number): string {
  const parsed = toFraction(value);
  if (parsed === undefined) return value;
  const shift = decimals - parsed.scale;
  const scaled =
    shift >= 0 ? parsed.digits * 10n ** BigInt(shift) : parsed.digits / 10n ** BigInt(-shift);
  return format(parsed.negative ? -scaled : scaled, decimals);
}

/** "2.9091" → { digits: 29091n, scale: 4 }; undefined for anything that is not a decimal. */
function toFraction(
  value: string,
): { digits: bigint; scale: number; negative: boolean } | undefined {
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length, negative };
}

/** an integer scaled by 10^decimals, written back out with a decimal point. */
function format(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const text = decimals === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
  return negative ? `-${text}` : text;
}
