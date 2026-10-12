/**
 * Exact comparison of decimal strings.
 *
 * Market figures (TVL, APR, fees) and router fees arrive as decimal strings with more digits
 * than a double holds. Comparing them as floats would make an order depend on binary rounding,
 * and an order is exactly what a caller compares across two runs.
 */

const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** a plain non-negative decimal: digits, optionally a point and more digits; no sign, no exponent. */
export function isUnsignedDecimal(value: string): boolean {
  return UNSIGNED_DECIMAL.test(value);
}

/** a plain decimal that may carry a leading minus sign; no exponent. */
export function isSignedDecimal(value: string): boolean {
  return SIGNED_DECIMAL.test(value);
}

/** -1, 0 or 1, without floats. Both sides must be plain decimals. */
export function compareDecimal(left: string, right: string): number {
  const [leftWhole = "0", leftFraction = ""] = left.trim().split(".");
  const [rightWhole = "0", rightFraction = ""] = right.trim().split(".");
  const width = Math.max(leftFraction.length, rightFraction.length);
  const scaled = (whole: string, fraction: string) =>
    BigInt(`${whole || "0"}${fraction.padEnd(width, "0") || "0"}`);
  const a = scaled(leftWhole, leftFraction);
  const b = scaled(rightWhole, rightFraction);
  return a === b ? 0 : a < b ? -1 : 1;
}
