/**
 * CapabilityRegistry — tracks capabilities per-network (same family, different networks can
 * differ, e.g. Base has fee.eip1559 while BSC is legacy-only) and gates commands whose declared
 * `capability` the target network lacks. Command existence is CommandRegistry's job;
 * family↔network mismatch is CliShell's.
 */
import type { CapabilityDescriptor, NetworkDescriptor, NetworkId } from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { UsageError } from "../../../domain/errors/index.js";

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

  /** gate: throw if the command declares a capability the target network does not support. */
  check(policy: Pick<ExecutionPolicy, "capability">, net?: NetworkDescriptor): void {
    if (!policy.capability || !net) return;
    if (!this.supports(net.id, policy.capability)) {
      throw new UsageError(
        "unsupported_network_capability",
        `${net.id} does not support ${policy.capability}`,
      );
    }
  }
}
