/**
 * Decimal token amount → integer base units, truncating what the token cannot hold.
 *
 * Separate from `domain/amounts`' `toBaseUnits`, which rejects over-precise input as a usage
 * error. That is right for a number a person typed: refusing to guess which digits they meant is
 * safer than dropping them. It is wrong for a number a market API sent, where extra places are
 * the indexer's own rounding artefact and refusing them would fail a read-only listing over a
 * digit nobody will ever spend. So this one truncates, and never throws.
 *
 * String math throughout. These values reach 25 significant digits, and `number` silently
 * rewrites anything past 15 of them.
 */

/**
 * "7.06e-05" → "0.0000706". The market API sends small prices in scientific notation, and every
 * consumer downstream — comparison, rendering, base-unit conversion — expects a plain decimal.
 *
 * Expanded by moving the point through the digit string, so a value too large or too precise for
 * a float survives intact. A literal with no exponent, or one that is not a number at all, is
 * returned untouched.
 */
export function expandScientificNotation(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(value.trim());
  if (!match) return value;
  const [, sign = "", whole = "0", fraction = "", exponent = "0"] = match;
  const digits = `${whole}${fraction}`;
  const point = whole.length + Number(exponent);
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits.padEnd(point, "0");
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, "");
  if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return out === "" || /^0+$/.test(out) ? "0" : `${sign}${out}`;
}

/**
 * "1070163.618808583559303388", 18 → "1070163618808583559303388".
 *
 * Truncates toward zero past `decimals` places; pads short fractions. A value that is not a
 * plain decimal literal is returned as-is rather than coerced, so a surprise from the remote
 * travels to the caller intact instead of becoming a wrong number here.
 */
export function toBaseUnitsTruncating(value: string, decimals: number): string {
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const scaled = `${whole}${fraction.slice(0, decimals).padEnd(decimals, "0")}`;
  const trimmed = scaled.replace(/^0+(?=\d)/, "");
  if (trimmed === "0" || /^0+$/.test(trimmed)) return "0";
  return negative ? `-${trimmed}` : trimmed;
}
