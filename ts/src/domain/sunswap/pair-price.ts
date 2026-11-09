const SCALE = 18;

export interface PairPrice {
  // Token being priced.
  readonly base: string;
  // Token the price is quoted in.
  readonly quote: string;
  // Quote tokens per base token, truncated to 18 decimal places.
  readonly price: string;
}

// swapRates contains token0 per token1; only two-token pools with one rate are supported.
export function pairPrices(
  tokenAddresses: readonly string[],
  swapRates: readonly string[],
  quoteAddress: string,
): PairPrice[] {
  if (tokenAddresses.length !== 2 || swapRates.length !== 1) return [];
  const [token0, token1] = tokenAddresses as [string, string];
  const rate = swapRates[0] as string;
  if (quoteAddress === token0) {
    return [{ base: token1, quote: token0, price: truncate(rate, SCALE) }];
  }
  if (quoteAddress === token1) {
    return [{ base: token0, quote: token1, price: reciprocal(rate, SCALE) }];
  }
  return [];
}

// Reciprocal of the magnitude, truncated; non-decimal input or zero returns "0".
export function reciprocal(value: string, decimals: number): string {
  const parsed = toFraction(value);
  if (parsed === undefined || parsed.digits === 0n) return "0";
  const scaled = 10n ** BigInt(parsed.scale + decimals) / parsed.digits;
  return format(scaled, decimals);
}

// Truncates toward zero to decimals places; non-decimal literals pass through unchanged.
export function truncate(value: string, decimals: number): string {
  const parsed = toFraction(value);
  if (parsed === undefined) return value;
  const shift = decimals - parsed.scale;
  const scaled =
    shift >= 0 ? parsed.digits * 10n ** BigInt(shift) : parsed.digits / 10n ** BigInt(-shift);
  return format(parsed.negative ? -scaled : scaled, decimals);
}

function toFraction(
  value: string,
): { digits: bigint; scale: number; negative: boolean } | undefined {
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return undefined;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: fraction.length, negative };
}

function format(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const text = decimals === 0 ? digits : `${digits.slice(0, cut)}.${digits.slice(cut)}`;
  return negative ? `-${text}` : text;
}
