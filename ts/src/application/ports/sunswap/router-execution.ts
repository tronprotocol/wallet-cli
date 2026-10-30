// Return unsigned calls; the transaction pipeline owns signing and broadcasting.
import type { ContractParameter } from "../../contracts/tron/tron-contract-call.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { Sun } from "../../../domain/amounts/index.js";

// Unvalidated encoder output; assertRouterCallMatches checks it and returns its SUN amounts.
export interface RouterSwapCall {
  readonly target: string;
  readonly functionSelector: string;
  readonly parameters: readonly ContractParameter[];
  readonly callValue: string;
  readonly feeLimit: string;
}

export interface RouterExecutionPort {
  routerAddress(network: NetworkDescriptor): string;

  // Chain time in Unix seconds, shared with the encoder so deadline checks use the same clock.
  transactionTime(network: NetworkDescriptor): Promise<number>;

  // Derives the floor from slippageBips; callers must verify it in the encoded call.
  buildSwapCall(
    network: NetworkDescriptor,
    input: {
      // RouterRoute.source, unchanged and opaque to callers.
      readonly route: unknown;
      readonly slippageBips: number;
      readonly recipient: string;
      readonly validForSeconds: number;
      readonly feeLimitSun: Sun;
      // Absent for native TRX, which needs no permit.
      readonly permit?: { readonly grant: unknown; readonly signature: string };
    },
  ): Promise<RouterSwapCall>;
}
