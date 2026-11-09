import type { ChainFamily } from "../../domain/types/index.js";

// "none" skips network resolution; "optional" uses the selected network or configured default.
export type NetworkRequirement = "none" | "optional";
export type WalletRequirement = "none" | "optional";

export interface ExecutionPolicy {
  readonly family?: ChainFamily;
  readonly network: NetworkRequirement;
  readonly wallet: WalletRequirement;
  readonly capability?: string;
}

export interface ExecutionSelection {
  readonly network?: string;
  readonly account?: string;
}
