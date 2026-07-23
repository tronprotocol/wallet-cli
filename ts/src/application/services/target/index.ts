import type { ChainFamily, NetworkDescriptor } from "../../../domain/types/index.js";
import type { ExecutionPolicy, ExecutionSelection } from "../../contracts/index.js";
import type { NetworkRegistry } from "../../ports/network-registry.js";
import { UsageError } from "../../../domain/errors/index.js";
import { sourceFamily } from "../../../domain/sources/index.js";
import type { AccountStore } from "../../ports/account-store.js";
import { familyOf } from "../../../domain/family/index.js";

export interface TargetResolverDeps {
  networkRegistry: NetworkRegistry;
  keystore: Pick<AccountStore, "activeAccount" | "resolveAccount">;
}

export interface ResolvedTarget {
  network?: NetworkDescriptor;
}

export class TargetResolver {
  constructor(private readonly deps: TargetResolverDeps) {}

  resolveNetwork(selection: ExecutionSelection): { network: NetworkDescriptor; reason: "explicit-network" | "default-network" } {
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

    const { network, reason } = this.resolveNetwork(selection);

    if (policy.family && network.family !== policy.family) {
      throw new UsageError(
        "network_family_mismatch",
        `selected operation is ${policy.family}-only but network ${network.id} is ${network.family}`,
      );
    }

    const accountFamily = policy.wallet !== "none" ? this.#singleFamilyAccount(selection) : undefined;
    if (accountFamily && accountFamily !== network.family) {
      const source = reason === "explicit-network" ? `network ${network.id}` : `default network ${network.id}`;
      throw new UsageError(
        "network_family_mismatch",
        `selected account is ${accountFamily}-only but ${source} is ${network.family}; pass --network for a ${accountFamily} network or change defaultNetwork`,
      );
    }

    return { network };
  }

  #singleFamilyAccount(selection: ExecutionSelection): ChainFamily | undefined {
    const ref = selection.account ?? this.deps.keystore.activeAccount() ?? undefined;
    if (!ref) return undefined;
    const directFamily = familyOf(ref);
    if (directFamily) return directFamily;
    const { wallet } = this.deps.keystore.resolveAccount(ref);
    return sourceFamily(wallet.source);
  }
}
