/**
 * What a concentrated-liquidity position IS, computed from what the chain reports about it.
 *
 * `sunswap position-info` reads a position from the position manager and the pool, not from the
 * market API — the API has no by-id endpoint at all. Everything the API used to derive therefore
 * has to be derived here, and every function below states the arithmetic it stands for so a reader
 * can check the published number rather than trust it.
 *
 * All of it is integer arithmetic on decimal strings, with ONE deliberate exception that is
 * documented where it sits (`priceAtTick`). Amounts, liquidity and USD values are money and are
 * never touched by a float.
 */

/**
 * Where the pool's price sits relative to the position's range.
 *
 * The spelling is `OUT_RANGE`, not `OUT_OF_RANGE`: it is the value the market API
 * publishes, and this command's object is isomorphic with `position-list`'s.
 *
 * The upper bound is EXCLUSIVE, which is the pool's own rule: a position earns fees while
 * `tickLower <= currentTick < tickUpper`, and at exactly `tickUpper` it holds only token1 and earns
 * nothing.
 */
export type RangeStatus = "IN_RANGE" | "OUT_RANGE";

export function rangeStatus(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): RangeStatus {
  return currentTick >= tickLower && currentTick < tickUpper ? "IN_RANGE" : "OUT_RANGE";
}

/**
 * The price a tick stands for: `1.0001^tick`, rescaled from base units to whole tokens.
 *
 * THE ONE FLOAT IN THIS FILE, and it is here on purpose. A tick price is a DISPLAY bound on a
 * range — nobody settles anything with it — and computing it in double reproduces the market API's
 * own figures exactly: four bounds it published for mainnet positions (`0.9950153585777257`,
 * `1.005014926708653`, `0.28709629290133126`, `0.3875336469344778`) are what this returns for
 * their ticks. An arbitrary-precision version would be MORE precise and would no longer match the
 * `min_price` / `max_price` a caller sees beside it in `position-list`.
 *
 * `10^(decimals0 - decimals1)` is the rescale: a tick prices base unit against base unit, and a
 * reader wants token against token.
 */
export function priceAtTick(tick: number, decimals0: number, decimals1: number): string {
  return String(Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1));
}

/**
 * The position's share of the pool's ACTIVE liquidity, as a decimal fraction.
 *
 * The denominator is what `liquidity()` reports, and that is the liquidity in range AT THE CURRENT
 * TICK — not every position the pool has ever held. So the ratio only means something while the
 * position is itself in range, and an out-of-range position contributes nothing to that number: its
 * share of the pool's active liquidity is zero, which is a measurement rather than a placeholder.
 *
 * `undefined` when the pool reports no active liquidity at all. There is then nothing to be a share
 * OF, and 0/0 is not zero.
 */
export function poolShare(
  positionLiquidity: string,
  poolLiquidity: string,
  status: RangeStatus,
): string | undefined {
  const pool = BigInt(poolLiquidity);
  if (pool === 0n) return undefined;
  if (status === "OUT_RANGE") return "0";
  return divideToDecimal(BigInt(positionLiquidity), pool, SHARE_DECIMALS);
}

/** Places a share carries. Enough that a position worth a millionth of a pool is not a zero. */
const SHARE_DECIMALS = 18;

/**
 * What the WHOLE position is worth expressed in one of its two tokens, at the pool's price.
 *
 * This is what the market API publishes as `derived_token0_amount` / `derived_token1_amount`, and
 * the meaning was established rather than assumed — reproduced to the digit against two independent
 * snapshots of mainnet position 88 (one published by the market API, and the
 * `positions-user-v4-88` fixture, which were taken at different prices and different balances):
 *
 *     derived0 = amount0 + amount1 / P        derived1 = amount0 * P + amount1
 *
 * where `P` is the pool's current price of currency0 in currency1 — in BASE units, which is exactly
 * `(sqrtPriceX96 / 2^96)^2`, so no decimals enter the calculation. It is not a valuation in USD and
 * it does not use a price feed: it is the position restated on one side of its own pair.
 *
 * Integer arithmetic throughout, flooring. `sqrtPriceX96^2` is a 192-bit number and `amount1 * 2^192`
 * is larger still; a float would round both.
 */
export function derivedAmounts(
  amount0: string,
  amount1: string,
  sqrtPriceX96: string,
): { readonly derived0: string; readonly derived1: string } | undefined {
  const sqrt = BigInt(sqrtPriceX96);
  if (sqrt === 0n) return undefined;
  const a0 = BigInt(amount0);
  const a1 = BigInt(amount1);
  const q192 = 1n << 192n;
  const squared = sqrt * sqrt;
  return {
    derived0: (a0 + (a1 * q192) / squared).toString(),
    derived1: ((a0 * squared) / q192 + a1).toString(),
  };
}

/**
 * `baseAmount` of a token with `decimals`, valued at `priceUsd` per whole token.
 *
 * Exact: the price is a decimal literal with finitely many places, so the whole thing is one
 * integer multiplication and one rescale. Nothing here rounds, and nothing here accepts a `number` —
 * a USD figure on a liquidity position routinely runs past what a double can hold.
 *
 * `undefined` for a price that is not a plain decimal literal. A price nobody could parse must not
 * become a valuation; see the callers, which omit the USD keys entirely rather than publish a zero.
 */
export function usdValue(
  baseAmount: string,
  decimals: number,
  priceUsd: string,
): string | undefined {
  const price = priceUsd.trim();
  if (!/^\d+(\.\d+)?$/.test(price) || !/^\d+$/.test(baseAmount)) return undefined;
  const [whole = "0", fraction = ""] = price.split(".");
  const scaled = BigInt(`${whole}${fraction}`);
  const places = decimals + fraction.length;
  return divideToDecimal(BigInt(baseAmount) * scaled, 10n ** BigInt(places), places);
}

/**
 * Two USD figures added — and ABSENT unless both are present.
 *
 * A total built from one side of a pair is not a partial total, it is a wrong one: it silently
 * values the other side at nothing. So a missing input removes the sum rather than shrinking it.
 */
export function sumUsd(values: readonly (string | undefined)[]): string | undefined {
  if (values.some((value) => value === undefined)) return undefined;
  const places = Math.max(...values.map((value) => decimalPlaces(value!)));
  const total = values.reduce((sum, value) => sum + scaleTo(value!, places), 0n);
  const exact = divideToDecimal(total, 10n ** BigInt(places), places);
  if (places <= USD_DECIMALS) return exact;
  // A token of 18 decimals priced to twelve places produces a sum with thirty, which is a scale
  // nothing measures in. TRUNCATED, not rounded, and to the same eighteen places `position-list`
  // publishes — a rounded-up last digit is a figure nobody quoted.
  const [whole = "0", fraction = ""] = exact.split(".");
  return `${whole}.${fraction.slice(0, USD_DECIMALS)}`;
}

/** Places a published USD figure carries, as `position-list` and `position-info` print it. */
const USD_DECIMALS = 18;

/**
 * A V4 pool that prices itself per swap, which the key reports by flagging the fee field.
 *
 * `0x800000` is the v4 dynamic-fee flag. Such a pool reports a fee of zero everywhere else, and
 * rendering that as "0%" would tell a reader the pool is free; it is not, the fee is simply not
 * knowable before the swap. V3 has no such thing and always answers false.
 */
const DYNAMIC_FEE_FLAG = 0x800000;

export function isDynamicFee(fee: number): boolean {
  return (fee & DYNAMIC_FEE_FLAG) !== 0;
}

/**
 * A fee tier as a DECIMAL fraction: 3000 → "0.003", 100 → "0.0001".
 *
 * The contract's unit is hundredths of a basis point, i.e. millionths. A dynamic-fee pool has no
 * tier to state and reports "0", which is why `isDynamicFee` travels beside it.
 */
export function feeRate(fee: number): string {
  if (isDynamicFee(fee)) return "0";
  const exact = divideToDecimal(BigInt(fee), 1000000n, 6);
  // Trailing zeros are stripped from the FRACTION only: a blanket trim would turn "10.000000"
  // into "1", and a fee rate is not a number to be clever with.
  const [whole = "0", fraction = ""] = exact.split(".");
  const shown = fraction.replace(/0+$/, "");
  return shown === "" ? whole : `${whole}.${shown}`;
}

/** `numerator / denominator`, floored, as a decimal string with exactly `places` places. */
function divideToDecimal(numerator: bigint, denominator: bigint, places: number): string {
  const scaled = (numerator * 10n ** BigInt(places)) / denominator;
  const digits = scaled.toString().padStart(places + 1, "0");
  if (places === 0) return digits;
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

function decimalPlaces(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

function scaleTo(value: string, places: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(places, "0")}`);
}
