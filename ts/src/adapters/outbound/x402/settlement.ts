export function successfulSettlement(value: unknown, expectedNetwork?: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settlement = value as Record<string, unknown>;
  if (settlement.success !== true || typeof settlement.network !== "string") return false;
  if (expectedNetwork && settlement.network !== expectedNetwork) return false;
  if (typeof settlement.transaction !== "string") return false;
  return settlement.network.startsWith("tron:")
    ? /^[0-9a-fA-F]{64}$/.test(settlement.transaction)
    : /^0x[0-9a-fA-F]{64}$/.test(settlement.transaction);
}
