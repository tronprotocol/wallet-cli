type ErrorFactory = (message: string) => Error;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function safeNonNegative(value: bigint, field: string, invalid: ErrorFactory): number {
  if (value < 0n) throw invalid(`${field} must be a non-negative integer`);
  if (value > MAX_SAFE) throw invalid(`${field} exceeds Number.MAX_SAFE_INTEGER`);
  return Number(value);
}

export function decimalToSafeNumber(value: unknown, field: string, invalid: ErrorFactory): number {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw invalid(`${field} must be a non-negative decimal integer`);
  }
  return safeNonNegative(BigInt(value), field, invalid);
}

export function quantityToSafeNumber(value: unknown, field: string, invalid: ErrorFactory): number {
  if (typeof value !== "string" || value === "") {
    throw invalid(`${field} must be a hex quantity`);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw invalid(`${field} must be a hex quantity`);
  }
  return safeNonNegative(parsed, field, invalid);
}
