// TRON nodes reject a transaction whose expiration is more than this past its timestamp.
export const MAX_TRON_EXPIRATION_MS = 86_400_000;

// A requested expiration, in milliseconds after the transaction timestamp.
export function isTronExpirationMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_TRON_EXPIRATION_MS
  );
}
