import { UsageError } from "../../errors/index.js";

export const MAX_PERCENT = 100;
export const WITNESS_URL_MAX_BYTES = 256;
// origin_energy_limit is a signed int64.
export const MAX_ORIGIN_ENERGY_LIMIT = (1n << 63n) - 1n;

// SR brokerage and contract user-resource percentages.
export function percent(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PERCENT) {
    throw new UsageError("invalid_value", `${label} must be an integer from 0 to ${MAX_PERCENT}`);
  }
  return value;
}

export function isOriginEnergyLimit(value: number | string): boolean {
  const text = String(value);
  return /^\d+$/.test(text) && BigInt(text) > 0n && BigInt(text) <= MAX_ORIGIN_ENERGY_LIMIT;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

// Returns the trimmed URL.
export function witnessUrl(value: string): string {
  const url = value.trim();
  if (url === "" || utf8ByteLength(url) > WITNESS_URL_MAX_BYTES) {
    throw new UsageError(
      "invalid_value",
      `witness URL must be 1 to ${WITNESS_URL_MAX_BYTES} UTF-8 bytes`,
    );
  }
  return url;
}
