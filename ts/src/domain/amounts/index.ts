/**
 * Amounts — the single base-unit ⇄ human-decimal converter pair. Replaces the three
 * near-identical `humanAmount`/`formatRawAmount` copies (which disagreed on negatives) and the
 * standalone `parseDecimalAmount`. All string math — no floating point.
 */
import { UsageError } from "../errors/index.js";

/**
 * Integer base-unit value → human decimal string (e.g. "1204560000", 6 → "1204.56").
 * Negatives are preserved; trailing/leading zeros are trimmed. A non-integer input is
 * returned unchanged (lenient passthrough for values that are already human-readable).
 */
export function fromBaseUnits(value: string | number | bigint, decimals: number): string {
  const raw = String(value);
  if (!/^-?\d+$/.test(raw)) return raw;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const whole = digits.slice(0, cut).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(cut).replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${out}` : out;
}

/**
 * Human decimal amount → integer base-unit string (e.g. "1204.56", 6 → "1204560000").
 * Rejects negative, over-precise, or non-numeric input with a usage error; `unitLabel` names
 * the unit in the message.
 *
 * `flag` names the option the value came from. Several commands take a decimal amount under a
 * name of their own (`--pay`, `--amounts`, `--min-received`), and a message that always said
 * `--amount` sent the caller to fix a flag they had not typed — one that, on `asset participate`,
 * does not exist. Callers whose option really is `--amount` need not pass it.
 */
export function toBaseUnits(
  value: string,
  decimals: number,
  unitLabel: string,
  flag = "--amount",
): string {
  const v = value.trim();
  if (!/^\d+(\.\d+)?$/.test(v)) {
    throw new UsageError(
      "invalid_amount",
      `${flag} must be a non-negative decimal ${unitLabel} amount`,
    );
  }
  const [whole, frac = ""] = v.split(".");
  if (frac.length > decimals) {
    throw new UsageError(
      "invalid_amount",
      `${flag} has too many decimal places for ${unitLabel} (max ${decimals})`,
    );
  }
  const digits = `${whole}${frac.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return digits === "" ? "0" : digits;
}
