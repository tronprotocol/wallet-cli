import type {
  CapabilityDescriptor,
  NetworkDescriptor,
  NetworkId,
} from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { UsageError } from "../../../domain/errors/index.js";

export class CapabilityRegistry {
  #byNetwork = new Map<NetworkId, CapabilityDescriptor[]>();

  constructor(private readonly aliases: Record<string, NetworkId> = {}) {}

  // Deduplicates by key; the first summary wins.
  register(networkId: NetworkId, caps: CapabilityDescriptor[]): void {
    const cur = this.#byNetwork.get(networkId) ?? [];
    const seen = new Set(cur.map((d) => d.key));
    for (const d of caps)
      if (!seen.has(d.key)) {
        cur.push(d);
        seen.add(d.key);
      }
    this.#byNetwork.set(networkId, cur);
  }

  supports(networkId: NetworkId, capability: string): boolean {
    return this.#byNetwork.get(networkId)?.some((d) => d.key === capability) ?? false;
  }

  #supporters(capability: string): NetworkId[] {
    return [...this.#byNetwork]
      .filter(([, caps]) => caps.some((d) => d.key === capability))
      .map(([id]) => id);
  }

  #label(id: NetworkId): string {
    return Object.entries(this.aliases).find(([, target]) => target === id)?.[0] ?? id;
  }

  check(
    policy: Pick<ExecutionPolicy, "capability"> & { path?: readonly string[] },
    net?: NetworkDescriptor,
  ): void {
    if (!policy.capability || !net) return;
    if (this.supports(net.id, policy.capability)) return;
    const supporters = this.#supporters(policy.capability);
    if (supporters.length === 0 || !policy.path?.length) {
      throw new UsageError(
        "unsupported_network_capability",
        `${net.id} does not support ${policy.capability}`,
      );
    }
    throw new UsageError(
      "unsupported_network_capability",
      `${policy.path.join(" ")} is available on ${prose(supporters.map((id) => this.#label(id)))} only`,
    );
  }
}

function prose(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
