// A chain id given as a non-negative integer, a decimal string, or a 0x-hex string; undefined otherwise.
export function parseChainId(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value >= 0n ? value : undefined;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^(?:[0-9]+|0x[0-9a-f]+)$/i.test(value)) return BigInt(value);
  return undefined;
}
