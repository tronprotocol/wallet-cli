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
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString("en-US") : String(v ?? "");
}

export function formatUsd(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? "");
}

export function formatSun(v: unknown): string {
  return fromBaseUnits(String(v ?? "0"), 6);
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

/** strip terminal control bytes from a text-mode output frame (never applied in JSON mode). */
export function sanitizeText(s: string): string {
  return s.replace(CONTROL_BYTES, "");
}
