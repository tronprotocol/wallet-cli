/**
 * ChainCore (L2) — CapabilityRegistry. Capabilities are tracked per-network (修正⑨):
 * same family, different networks can differ (e.g. EIP-1559). (plan §3 L2)
 */
import type { NetworkId } from "../types/index.js";

export class CapabilityRegistry {
  #byNetwork = new Map<NetworkId, Set<string>>();

  register(networkId: NetworkId, caps: string[]): void {
    const set = this.#byNetwork.get(networkId) ?? new Set<string>();
    for (const c of caps) set.add(c);
    this.#byNetwork.set(networkId, set);
  }

  supports(networkId: NetworkId, capability: string): boolean {
    return this.#byNetwork.get(networkId)?.has(capability) ?? false;
  }

  list(networkId: NetworkId): string[] {
    return [...(this.#byNetwork.get(networkId) ?? [])];
  }
}
