import type { ChainFamily } from "../../domain/types/index.js";

export type NetworkRequirement = "none" | "optional" | "required";
export type WalletRequirement = "none" | "optional";

/** Minimal application policy needed to resolve and gate an execution target. */
export interface ExecutionPolicy {
  readonly family?: ChainFamily;
  readonly network: NetworkRequirement;
  readonly wallet: WalletRequirement;
  readonly capability?: string;
}

/** Adapter-neutral target selection supplied by an inbound transport. */
export interface ExecutionSelection {
  readonly network?: string;
  readonly account?: string;
}
