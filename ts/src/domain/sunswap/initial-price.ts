/** Human token1 per token0, rounded down to eight significant digits without floating point.
 *  Always a plain decimal string, never scientific notation, however extreme the value. */
export function initialPrice(sqrtPriceX96: string, decimals0: number, decimals1: number): string {
  const n = BigInt(sqrtPriceX96) ** 2n * 10n ** BigInt(decimals0);
  const d = (1n << 192n) * 10n ** BigInt(decimals1);
  if (n === 0n) return "0";
  let exponent = n.toString().length - d.toString().length;
  if (exponent >= 0 ? n < d * 10n ** BigInt(exponent) : n * 10n ** BigInt(-exponent) < d)
    exponent--;
  const shift = 7 - exponent;
  const digits = (shift >= 0 ? (n * 10n ** BigInt(shift)) / d : n / (d * 10n ** BigInt(-shift)))
    .toString()
    .padStart(8, "0");
  const point = exponent + 1;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  const value =
    point <= 0
      ? "0." + "0".repeat(-point) + digits
      : digits.slice(0, point) + "." + digits.slice(point);
  return value.replace(/0+$/, "").replace(/\.$/, "");
}
