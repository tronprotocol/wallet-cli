// OUT_RANGE matches the market API; the upper tick is exclusive.
export type RangeStatus = "IN_RANGE" | "OUT_RANGE";

export function rangeStatus(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): RangeStatus {
  return currentTick >= tickLower && currentTick < tickUpper ? "IN_RANGE" : "OUT_RANGE";
}

// Display-only token1 per token0; double precision matches market API range bounds.
export function priceAtTick(tick: number, decimals0: number, decimals1: number): string {
  return String(Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1));
}

// Share of active pool liquidity; out-of-range positions contribute zero.
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

const SHARE_DECIMALS = 18;

// Whole-position value in each token, floored in base units at the Q96 pool price.
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

// Exact USD value from base units and price per whole token; invalid amount/price literals return undefined.
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

// Missing values omit the total rather than valuing one side at zero.
export function sumUsd(values: readonly (string | undefined)[]): string | undefined {
  if (values.some((value) => value === undefined)) return undefined;
  const places = Math.max(...values.map((value) => decimalPlaces(value!)));
  const total = values.reduce((sum, value) => sum + scaleTo(value!, places), 0n);
  const exact = divideToDecimal(total, 10n ** BigInt(places), places);
  if (places <= USD_DECIMALS) return exact;
  // Truncate to the published USD precision without rounding up.
  const [whole = "0", fraction = ""] = exact.split(".");
  return `${whole}.${fraction.slice(0, USD_DECIMALS)}`;
}

const USD_DECIMALS = 18;

// V4 dynamic-fee flag: the fee is determined per swap.
const DYNAMIC_FEE_FLAG = 0x800000;

export function isDynamicFee(fee: number): boolean {
  return (fee & DYNAMIC_FEE_FLAG) !== 0;
}

// Millionths to a decimal fraction; dynamic fees return "0", not a zero-fee guarantee.
export function feeRate(fee: number): string {
  if (isDynamicFee(fee)) return "0";
  const exact = divideToDecimal(BigInt(fee), 1000000n, 6);
  // Strip fractional zeros only, preserving whole-number zeros.
  const [whole = "0", fraction = ""] = exact.split(".");
  const shown = fraction.replace(/0+$/, "");
  return shown === "" ? whole : `${whole}.${shown}`;
}

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
