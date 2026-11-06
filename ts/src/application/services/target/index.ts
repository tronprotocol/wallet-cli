import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { ExecutionPolicy, ExecutionSelection } from "../../contracts/index.js";
import type { NetworkRegistry } from "../../ports/network-registry.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { AccountStore } from "../../ports/account-store.js";

export interface TargetResolverDeps {
  networkRegistry: NetworkRegistry;
  keystore: Pick<AccountStore, "activeAccount" | "resolveAccount">;
}

export interface ResolvedTarget {
  network?: NetworkDescriptor;
}

// Account-family checks belong at address resolution; selecting a network needs no address.
export class TargetResolver {
  constructor(private readonly deps: TargetResolverDeps) {}

  resolveNetwork(selection: ExecutionSelection): {
    network: NetworkDescriptor;
    reason: "explicit-network" | "default-network";
  } {
    const explicit = selection.network && selection.network.trim() !== "";
    const network = explicit
      ? this.deps.networkRegistry.resolve(selection.network)
      : this.deps.networkRegistry.resolveDefault();
    return { network, reason: explicit ? "explicit-network" : "default-network" };
  }

  resolve(policy: ExecutionPolicy, selection: ExecutionSelection): ResolvedTarget {
    if (policy.network === "none") {
      return {};
    }

    const { network } = this.resolveNetwork(selection);

    if (policy.family && network.family !== policy.family) {
      throw new UsageError(
        "family_mismatch",
        `selected operation is ${policy.family}-only but network ${network.id} is ${network.family}`,
      );
    }

    return { network };
  }
}
