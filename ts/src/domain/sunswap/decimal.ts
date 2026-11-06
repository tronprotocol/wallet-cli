const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function isUnsignedDecimal(value: string): boolean {
  return UNSIGNED_DECIMAL.test(value);
}

export function isSignedDecimal(value: string): boolean {
  return SIGNED_DECIMAL.test(value);
}

// Returns -1, 0 or 1 exactly; inputs must be plain decimal strings.
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
