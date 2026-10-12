/**
 * CapabilityRegistry — tracks capabilities per-network (same family, different networks can
 * differ, e.g. Base has fee.eip1559 while BSC is legacy-only) and gates commands whose declared
 * `capability` the target network lacks. Command existence is CommandRegistry's job;
 * family↔network mismatch is CliShell's.
 */
import type {
  CapabilityDescriptor,
  NetworkDescriptor,
  NetworkId,
} from "../../../domain/types/index.js";
import type { ExecutionPolicy } from "../../contracts/index.js";
import { UsageError } from "../../../domain/errors/index.js";

export class CapabilityRegistry {
  #byNetwork = new Map<NetworkId, CapabilityDescriptor[]>();

  /**
   * Alias book, so the refusal can name networks the way a person types them (`tron`, `nile`)
   * rather than by canonical id. Injected rather than imported: the registry is application code,
   * and the book is whatever the resolved config holds — builtin aliases plus the user's own.
   */
  constructor(private readonly aliases: Record<string, NetworkId> = {}) {}

  /** register capability descriptors for a network (deduped by key; first summary wins). */
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

  /** every network that registered `capability`, in registration order. */
  #supporters(capability: string): NetworkId[] {
    return [...this.#byNetwork]
      .filter(([, caps]) => caps.some((d) => d.key === capability))
      .map(([id]) => id);
  }

  /** the first alias pointing at `id`, else the canonical id — how a person would type it. */
  #label(id: NetworkId): string {
    return Object.entries(this.aliases).find(([, target]) => target === id)?.[0] ?? id;
  }

  /**
   * gate: throw if the command declares a capability the target network does not support.
   *
   * The message names the networks that DO support it, because a feature being off here is
   * almost always a question of "then where?" — and answering it from registry state rather than
   * a hard-coded string keeps the answer true when a user's config.yaml opens another network.
   */
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

/** "a", "a and b", "a, b and c" — the message is read by people, so it reads like a sentence. */
function prose(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
