import type { ChainFamily, NetworkDescriptor, NetworkId } from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { capabilitySupport, type CapabilityFacts, type CapabilitySupport } from "./predicates.js";

export type { CapabilityFacts, CapabilitySupport } from "./predicates.js";

const NO_DEFAULT_TOKENS: CapabilityFacts = { x402ServeDefaultToken: () => false };

// Discovery and the execution gate both read the predicate results recorded here.
export class CapabilityRegistry {
  #byNetwork = new Map<NetworkId, Map<string, CapabilitySupport>>();
  #families = new Map<NetworkId, ChainFamily>();

  constructor(
    private readonly aliases: Record<string, NetworkId> = {},
    private readonly facts: CapabilityFacts = NO_DEFAULT_TOKENS,
  ) {}

  // Records each capability's predicate result on the network; repeated keys keep the first result.
  register(network: NetworkDescriptor, capabilities: readonly string[]): void {
    const cur = this.#byNetwork.get(network.id) ?? new Map<string, CapabilitySupport>();
    for (const key of capabilities)
      if (!cur.has(key)) cur.set(key, capabilitySupport(key, network, this.facts));
    this.#byNetwork.set(network.id, cur);
    this.#families.set(network.id, network.family);
  }

  // A capability never registered on the network is unsupported there.
  support(networkId: NetworkId, capability: string): CapabilitySupport {
    return this.#byNetwork.get(networkId)?.get(capability) ?? "unsupported";
  }

  supports(networkId: NetworkId, capability: string): boolean {
    return this.support(networkId, capability) !== "unsupported";
  }

  // Every registered network in registration order, with its support for the capability.
  supportByNetwork(
    capability: string,
  ): { network: NetworkId; family: ChainFamily; support: CapabilitySupport }[] {
    return [...this.#families].map(([network, family]) => ({
      network,
      family,
      support: this.support(network, capability),
    }));
  }

  #supporters(capability: string): NetworkId[] {
    return [...this.#byNetwork.keys()].filter((id) => this.supports(id, capability));
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
