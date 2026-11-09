import { sameX402Network, x402NetworkFamily } from "../../../domain/x402/network-id.js";
import { isTxHash } from "../../../domain/family/index.js";
export function successfulSettlement(value: unknown, expectedNetwork?: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settlement = value as Record<string, unknown>;
  if (settlement.success !== true || typeof settlement.network !== "string") return false;
  if (expectedNetwork && !sameX402Network(settlement.network, expectedNetwork)) return false;
  if (typeof settlement.transaction !== "string") return false;
  const family = x402NetworkFamily(settlement.network);
  return family !== undefined && isTxHash(family, settlement.transaction);
}
