import type { CapabilityPredicate } from "../../../plugin-api/application.js";
import type { NetworkId } from "../../../plugin-api/domain.js";
import { baiChain } from "../domain/chains.js";

export const BAI_CAPABILITIES: Readonly<Record<string, CapabilityPredicate>> = {
  "bai.recharge": (network) => (baiChain(network) !== undefined ? "supported" : "unsupported"),
};

// The token a recharge uses when the caller names none.
export function baiDefaultToken(network: NetworkId): string {
  return network === "eip155:8453" ? "USDC" : "USDT";
}
