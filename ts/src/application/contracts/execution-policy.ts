import type { ChainFamily } from "../../domain/types/index.js";

/** "none" = the command never touches a chain; "optional" = it resolves a network,
 *  using --network when given and config.defaultNetwork otherwise. There is deliberately
 *  no "required": nothing in the CLI can demand an explicit --network, because the
 *  default-network fallback always applies. A third value that resolved identically only
 *  ever produced a help line promising an enforcement that did not exist. */
export type NetworkRequirement = "none" | "optional";
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
