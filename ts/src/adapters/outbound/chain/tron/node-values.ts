import { isLosslessNumber } from "lossless-json";
import { ChainError } from "../../../../domain/errors/index.js";

export function quantityString(value: unknown): string {
  if (typeof value === "bigint") return value >= 0n ? value.toString() : "0";
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "0";
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
}

export function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Keep realized amounts as exact decimal strings even when they fit in a JS number.
const REALISED_AMOUNT_KEYS = new Set([
  "unfreeze_amount",
  "withdraw_amount",
  "exchange_received_amount",
  "exchange_inject_another_amount",
  "exchange_withdraw_another_amount",
]);

export function normalizeTxInfoValue(value: unknown, key?: string): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    if (key && REALISED_AMOUNT_KEYS.has(key)) return exact;
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeTxInfoValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeTxInfoValue(entry, entryKey),
      ]),
    );
  }
  return value;
}

export function nodeQuantity(value: unknown, field: string): string {
  if (value === undefined) return "0";
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new ChainError("provider_error", `TRON node returned an invalid ${field}`);
}

// Epoch milliseconds; 0 and absence both mean the time is unset.
export function optionalNodeTime(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  const time = safeNodeInteger(value, field);
  return time === 0 ? undefined : time;
}

export function safeNodeInteger(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new ChainError("provider_error", `TRON node returned an imprecise or invalid ${field}`);
}

// A node may report -1 for a parameter that is not active; readers that use a value as a fee check its sign.
export function safeChainParameter(value: unknown, key: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new ChainError("provider_error", `TRON node returned an imprecise or invalid ${key}`);
}

const ACCOUNT_QUANTITY_KEYS = new Set([
  "amount",
  "allowance",
  "balance",
  "frozen_amount",
  "frozen_balance",
  "latest_withdraw_time",
  "reward",
  "total_supply",
  "unfreeze_amount",
  "value",
  "vote_count",
  "voteCount",
]);

export function normalizeAccountValue(value: unknown, key?: string): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    if (key && (ACCOUNT_QUANTITY_KEYS.has(key) || /balance/i.test(key))) return exact;
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeAccountValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeAccountValue(entry, entryKey),
      ]),
    );
  }
  return value;
}

export function normalizeLosslessValue(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const exact = value.toString();
    const number = Number(exact);
    return Number.isSafeInteger(number) ? number : exact;
  }
  if (Array.isArray(value)) return value.map(normalizeLosslessValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeLosslessValue(entry)]),
    );
  }
  return value;
}

export function decodeAbiUint(hex?: string): bigint | undefined {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return undefined;
  return BigInt("0x" + hex);
}

// Decode dynamic ABI strings and legacy bytes32 text.
export function decodeAbiString(hex?: string): string | undefined {
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return undefined;
  const buf = Buffer.from(hex, "hex");
  if (buf.length === 32) return buf.toString("utf8").replace(/\0[\s\S]*$/, "") || undefined;
  if (buf.length < 64) return undefined;
  const offset = Number(BigInt("0x" + buf.subarray(0, 32).toString("hex")));
  if (!Number.isSafeInteger(offset) || offset + 32 > buf.length) return undefined;
  const length = Number(BigInt("0x" + buf.subarray(offset, offset + 32).toString("hex")));
  if (!Number.isSafeInteger(length) || offset + 32 + length > buf.length) return undefined;
  return buf.subarray(offset + 32, offset + 32 + length).toString("utf8") || undefined;
}

// Node messages may contain hex-encoded UTF-8.
export function decodeTronMessage(message?: string): string {
  if (!message) return "";
  if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
    try {
      return Buffer.from(message, "hex").toString("utf8");
    } catch {
      return message;
    }
  }
  return message;
}
