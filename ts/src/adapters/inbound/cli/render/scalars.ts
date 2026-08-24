/**
 * Scalar formatting - pure value-to-string helpers (numbers, time, identifiers).
 * No domain or layout knowledge; reusable across formatters and trivially unit-testable.
 */
import { fromBaseUnits } from "../../../../domain/amounts/index.js";

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

/** Group a decimal string's integer part without coercing or dropping fractional digits. */
export function formatDecimal(v: unknown): string {
  const raw = String(v ?? "");
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(raw);
  if (!match) return raw;
  const [, sign, integer, fraction = ""] = match;
  return `${sign}${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}

/** A USD *valuation* — always 2 decimals, per §1.4. */
export function formatUsd(v: unknown): string {
  return usd(v, 2);
}

/**
 * A USD *unit price* — 4 decimals, per §1.4. Prices need the extra precision valuations do not:
 * a stablecoin at $0.9998 rendered as "$1.00" hides a depeg, and a sub-cent token collapses to
 * "$0.00" entirely.
 */
export function formatUsdPrice(v: unknown): string {
  return usd(v, 4);
}

function usd(v: unknown, digits: number): string {
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : String(v ?? "");
}

/** §1.4: text output shows at most this many fractional digits, whatever the asset's precision. */
const DISPLAY_DECIMALS = 6;
const SMALLEST_SHOWN = `0.${"0".repeat(DISPLAY_DECIMALS - 1)}1`; // 0.000001

/**
 * Base-unit integer → the human amount text output shows (§1.4).
 *
 * Three rules, each protecting against a specific way of misleading a reader:
 *   - **Truncate, never round.** Rounding 1.9999999 to "2" OVERSTATES a balance, which is the
 *     dangerous direction for a wallet. Truncation only ever understates.
 *   - **Never print a bare "0" for a non-zero amount.** A balance of 1 wei shown as "0 ETH"
 *     reads as an empty account; `<0.000001` says "small", not "nothing".
 *   - **Group the integer part.** json keeps the exact base-unit integer; this is display only.
 */
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
  return formatAmount(v, 6);
}

export function formatWei(v: unknown): string {
  return formatAmount(v, 18);
}

/** wei → gwei. Gas is quoted in gwei by every wallet and explorer, and by this CLI's own
 *  --max-fee / --priority-fee flags; wei would be nine zeros longer for the same number. */
export function formatGwei(v: unknown): string {
  return formatAmount(v, 9);
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

/** epoch-ms → "YYYY-MM-DD HH:MM (in ~3 days)" / "(~2h ago)" — local time + a coarse relative hint.
 *  Shared by the reward / stake / delegated views so time reads consistently across the CLI.
 *  `now` is injectable for deterministic tests. Empty string for a missing/non-positive value. */
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

/** block timestamp -> "YYYY-MM-DD HH:MM:SS UTC". */
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

/** contract method display name: strip the signature's parameter list, e.g. "transfer(address,uint256)" -> "transfer". */
export function methodName(sig: string): string {
  return sig.replace(/\(.*/, "") || sig;
}

// Neutralize terminal control-sequence injection from untrusted labels / remote metadata.
// Strips C0 (except the newline layout uses for line breaks), DEL, and C1 bytes: removing the
// ESC (0x1B) and C1 introducers degrades any ANSI CSI / OSC payload to harmless literal text.
// Built via RegExp so the source file itself carries no raw control bytes.
const CONTROL_BYTES = new RegExp("[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F]", "g");

// Bidi and other invisible formatting characters are NOT control bytes — they pass straight through
// the strip above — and for a security display they are the more dangerous half. U+202E reverses
// the visible order of everything after it, so a chain-controlled permission name can make the
// address or weight printed beside it read as something else; the zero-width characters can make
// two different names look identical. These are MARKED rather than dropped: dropping them would
// silently mangle legitimate right-to-left text, whereas an escape keeps the string honest and
// makes tampering obvious. Built via RegExp so this file carries no raw formatting characters.
const INVISIBLE_FORMATTING = new RegExp(
  "[\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]",
  "g",
);

/** strip terminal control bytes from a text-mode output frame (never applied in JSON mode). */
export function sanitizeText(s: string): string {
  return s
    .replace(CONTROL_BYTES, "")
    .replace(
      INVISIBLE_FORMATTING,
      (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`,
    );
}
