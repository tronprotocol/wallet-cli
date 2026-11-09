import { UsageError } from "../errors/index.js";

export const MAX_LABEL_LENGTH = 64;
const RESERVED_PREFIX = "wlt_";

// Returns the trimmed label a write may store.
export function walletLabel(input: string): string {
  const value = input.trim();
  if (value.length < 1 || value.length > MAX_LABEL_LENGTH) {
    throw new UsageError("invalid_value", `label must be 1 to ${MAX_LABEL_LENGTH} characters`);
  }
  if (value.startsWith(RESERVED_PREFIX)) {
    throw new UsageError("invalid_value", `label must not start with '${RESERVED_PREFIX}'`);
  }
  return value;
}

// Stored labels may predate the length limit; every other write rule holds.
export function isStoredLabel(label: string): boolean {
  const value = label.trim();
  return value !== "" && !value.startsWith(RESERVED_PREFIX);
}

// Labels are references, so equality ignores case and surrounding space.
export function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

// Truncates the base so the default always fits MAX_LABEL_LENGTH.
export function derivedAccountLabel(baseLabel: string | undefined, index: number): string {
  const suffix = `-${index}`;
  return `${(baseLabel ?? "hd").slice(0, MAX_LABEL_LENGTH - suffix.length)}${suffix}`;
}
