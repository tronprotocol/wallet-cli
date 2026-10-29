// Use string arithmetic to preserve amount precision.
import { ChainError, UsageError } from "../errors/index.js";

// Bounds remote precision before allocating scaled amounts.
export function checkedTokenDecimals(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new ChainError(
      "invalid_node_response",
      `token decimals must be an integer from 0 to 77 supported by this CLI; received ${String(decimals)}`,
    );
  }
  return decimals;
}

// True for decimal or integer text whose value is zero.
export function isZeroAmount(text: string): boolean {
  return /^0+(\.0+)?$/.test(text);
}

// Amounts that move value must be greater than zero.
export function assertPositiveAmount(value: bigint, label: string): bigint {
  if (value <= 0n) throw new UsageError("invalid_amount", `${label} must be greater than zero`);
  return value;
}

export function isPositive(value: bigint | number): boolean {
  return value > 0;
}

// Counts and protocol parameters; money uses assertPositiveAmount and its invalid_amount code.
export function assertPositive<T extends bigint | number>(value: T, label: string): T {
  if (!isPositive(value)) {
    throw new UsageError("invalid_value", `${label} must be greater than zero`);
  }
  return value;
}

// Base units are integer text.
export function positiveBaseUnits(raw: string, label: string): string {
  if (!/^\d+$/.test(raw)) {
    throw new UsageError("invalid_amount", `${label} must be an integer amount in base units`);
  }
  assertPositiveAmount(BigInt(raw), label);
  return raw;
}

// Converts integer base units to decimals; passes non-integer input through.
export function fromBaseUnits(value: string | number | bigint, decimals: number): string {
  checkedTokenDecimals(decimals);
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

// Converts non-negative decimals to base units; flag names the input option in errors.
export function toBaseUnits(
  value: string,
  decimals: number,
  unitLabel: string,
  flag = "--amount",
): string {
  checkedTokenDecimals(decimals);
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

declare const amountUnit: unique symbol;

// Non-negative integer decimal text; the brand names the unit so amounts of different units do not mix.
type UnitAmount<Unit extends string> = string & { readonly [amountUnit]: Unit };

export type Sun = UnitAmount<"sun">;
export type Wei = UnitAmount<"wei">;
// Base units of a token whose decimals are known separately.
export type BaseUnits = UnitAmount<"base-units">;

// Callers validate user and node input first; a value rejected here is a programming error.
function unitAmount(value: string | bigint, unit: string): string {
  const text = typeof value === "bigint" ? value.toString() : value;
  if (!/^\d+$/.test(text)) {
    throw new RangeError(`${unit} amount must be non-negative integer text`);
  }
  return text;
}

export function sunAmount(value: string | bigint): Sun {
  return unitAmount(value, "SUN") as Sun;
}

export function weiAmount(value: string | bigint): Wei {
  return unitAmount(value, "wei") as Wei;
}

export function baseUnitAmount(value: string | bigint): BaseUnits {
  return unitAmount(value, "base-unit") as BaseUnits;
}
