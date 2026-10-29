import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import { GWEI_DECIMALS } from "../../../../domain/fees/evm-gas.js";

export function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : String(v);
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function formatInt(v: unknown): string {
  if (typeof v === "string" && /^-?\d+$/.test(v)) {
    return formatDecimal(v);
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : String(v ?? "");
}

// Group the integer part without numeric coercion or loss of fractional digits.
export function formatDecimal(v: unknown): string {
  const raw = String(v ?? "");
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, integer, fraction = ""] = match;
  return `${sign}${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}

// USD valuations use two decimal places.
export function formatUsd(v: unknown): string {
  return usd(v, 2);
}

const PRICE_SIGNIFICANT_DIGITS = 4;

// USD prices below one cent truncate to four significant digits; others round to four decimals.
export function formatUsdPrice(v: unknown): string {
  const text = String(v ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return usd(v, 4);
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  if (/^0*$/.test(whole) && /^0*$/.test(fraction)) return "0.0000";
  if (!/^0*$/.test(whole) || !fraction.startsWith("00")) return usd(v, 4);
  const firstSignificant = fraction.search(/[1-9]/);
  const kept = fraction
    .slice(0, firstSignificant + PRICE_SIGNIFICANT_DIGITS)
    .padEnd(firstSignificant + PRICE_SIGNIFICANT_DIGITS, "0");
  return `${negative ? "-" : ""}0.${kept}`;
}

function usd(v: unknown, digits: number): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : String(v ?? "");
}

const DISPLAY_DECIMALS = 6;
const SMALLEST_SHOWN = `0.${"0".repeat(DISPLAY_DECIMALS - 1)}1`;

// Truncate base-unit amounts to six decimals; mark tiny nonzero amounts instead of showing zero.
export function formatAmount(v: unknown, decimals: number): string {
  const exact = fromBaseUnits(String(v ?? "0"), decimals);
  const [integer = "0", fraction = ""] = exact.split(".");
  const shown = fraction.slice(0, DISPLAY_DECIMALS).replace(/0+$/, "");
  if (shown === "" && integer === "0" && /[1-9]/.test(fraction)) {
    return `<${SMALLEST_SHOWN}`;
  }
  return formatDecimal(shown === "" ? integer : `${integer}.${shown}`);
}

export function formatSun(v: unknown): string {
  return formatAmount(v, FAMILIES.tron.nativeDecimals);
}

export function formatWei(v: unknown): string {
  return formatAmount(v, FAMILIES.evm.nativeDecimals);
}

// Input is wei; output is gwei.
export function formatGwei(v: unknown): string {
  return formatAmount(v, GWEI_DECIMALS);
}

export function formatTime(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

// Input is epoch milliseconds; output uses local time with a relative hint.
export function formatAtWithRelative(v: unknown, now: number = Date.now()): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const at = `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const delta = n - now;
  const mag = Math.abs(delta);
  const unit =
    mag >= 86_400_000
      ? `${Math.round(mag / 86_400_000)} day(s)`
      : mag >= 3_600_000
        ? `${Math.round(mag / 3_600_000)}h`
        : `${Math.max(1, Math.round(mag / 60_000))}m`;
  return `${at} (${delta >= 0 ? `in ~${unit}` : `~${unit} ago`})`;
}

// Input is epoch milliseconds; output uses UTC.
export function formatUtc(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  return `${new Date(n).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

export function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function shorten(s: string): string {
  if (s.length <= 24) return s;
  return `${s.slice(0, 10)}...${s.slice(-8)}`;
}

export function quote(s: string): string {
  return `"${s}"`;
}

export function methodName(sig: string): string {
  return sig.replace(/\(.*/, "") || sig;
}

// Strip terminal controls, preserving newlines for layout.
const CONTROL_BYTES = new RegExp("[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F]", "g");

// Escape invisible formatting characters to expose spoofing without silently altering RTL text.
const INVISIBLE_FORMATTING = new RegExp(
  "[\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]",
  "g",
);

// Sanitize text frames by stripping controls and marking invisible formatting characters.
export function sanitizeText(s: string): string {
  return s
    .replace(CONTROL_BYTES, "")
    .replace(
      INVISIBLE_FORMATTING,
      (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`,
    );
}
