import { checkedTokenDecimals } from "../amounts/index.js";
import { ChainError } from "../errors/index.js";

// Expands scientific notation without float rounding; other literals pass through unchanged.
export function expandScientificNotation(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(value.trim());
  if (!match) return value;
  const [, sign = "", whole = "0", fraction = "", exponent = "0"] = match;
  const power = Number(exponent);
  // Bound allocation from remote exponents before repeat/padEnd.
  if (!Number.isSafeInteger(power) || Math.abs(power) > 1000) {
    throw new ChainError(
      "invalid_node_response",
      "scientific notation exponent must be between -1000 and 1000",
    );
  }
  const digits = `${whole}${fraction}`;
  const point = whole.length + power;
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits.padEnd(point, "0");
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, "");
  if (out.includes(".")) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return out === "" || /^0+$/.test(out) ? "0" : `${sign}${out}`;
}

// Truncates toward zero in base units; non-decimal literals pass through trimmed.
export function toBaseUnitsTruncating(value: string, decimals: number): string {
  checkedTokenDecimals(decimals);
  const raw = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const scaled = `${whole}${fraction.slice(0, decimals).padEnd(decimals, "0")}`;
  const trimmed = scaled.replace(/^0+(?=\d)/, "");
  if (trimmed === "0" || /^0+$/.test(trimmed)) return "0";
  return negative ? `-${trimmed}` : trimmed;
}
