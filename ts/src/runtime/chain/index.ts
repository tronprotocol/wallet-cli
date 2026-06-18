/**
 * ChainCore (L2) — CapabilityRegistry. Capabilities are tracked per-network (修正⑨):
 * same family, different networks can differ (e.g. EIP-1559). (plan §3 L2)
 */
import type { CapabilityDescriptor, NetworkId } from "../../core/types/index.js";

export class CapabilityRegistry {
  #byNetwork = new Map<NetworkId, CapabilityDescriptor[]>();

  /** register capability descriptors for a network (deduped by key; first summary wins). */
  register(networkId: NetworkId, caps: CapabilityDescriptor[]): void {
    const cur = this.#byNetwork.get(networkId) ?? [];
    const seen = new Set(cur.map((d) => d.key));
    for (const d of caps) if (!seen.has(d.key)) { cur.push(d); seen.add(d.key); }
    this.#byNetwork.set(networkId, cur);
  }

  supports(networkId: NetworkId, capability: string): boolean {
    return this.#byNetwork.get(networkId)?.some((d) => d.key === capability) ?? false;
  }

  list(networkId: NetworkId): string[] {
    return (this.#byNetwork.get(networkId) ?? []).map((d) => d.key);
  }

  /** key + human summary, for the `capabilities` command. */
  describe(networkId: NetworkId): CapabilityDescriptor[] {
    return [...(this.#byNetwork.get(networkId) ?? [])];
  }
}
