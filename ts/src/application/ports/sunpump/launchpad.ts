// Return unsigned payloads; the transaction pipeline owns signing and broadcasting.
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type {
  ApprovalCapablePort,
  ContractCallPayload,
} from "../../contracts/tron-contract-call.js";
import type { LaunchpadState } from "../../../domain/sunpump/curve.js";

// Token facts read on chain.
export interface LaunchpadTokenFacts {
  readonly address: string;
  readonly decimals: number;
  readonly symbol: string;
}

export interface BuyQuote {
  // Token base units.
  readonly tokenAmount: string;
  // SUN fee included in the input TRX.
  readonly feeSun: string;
}

export interface SellQuote {
  // Net SUN received by the seller, excluding the fee paid alongside it.
  readonly trxAmountSun: string;
  // SUN fee; gross sale proceeds are trxAmountSun + feeSun.
  readonly feeSun: string;
}

export interface LaunchpadPort extends ApprovalCapablePort {
  readonly approvalDomain: "sunpump-launchpad";

  // On-chain trading state; catalogue status can be stale.
  tokenState(network: NetworkDescriptor, token: string): Promise<LaunchpadState>;

  tokenFacts(network: NetworkDescriptor, token: string): Promise<LaunchpadTokenFacts>;

  // Token base units.
  balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<string>;

  quoteBuy(network: NetworkDescriptor, token: string, trxSun: string): Promise<BuyQuote>;

  quoteSell(network: NetworkDescriptor, token: string, tokenAmount: string): Promise<SellQuote>;

  // Token base units corresponding to one SUN net proceeds.
  minimumSellAmount(network: NetworkDescriptor, token: string): Promise<string>;

  // expected × (1 − slippage), using SDK integer arithmetic.
  applyFloor(expected: string, slippageBips: number): string;

  // Counterparty and spender approved for a sale.
  launchpadAddress(network: NetworkDescriptor): string;

  // Native TRX is callValue; no approval needed.
  buyPayload(network: NetworkDescriptor, request: BuyRequest): ContractCallPayload;

  // Requires prior approval for the launchpad to pull tokens.
  sellPayload(network: NetworkDescriptor, request: SellRequest): ContractCallPayload;
}

export interface BuyRequest {
  readonly token: string;
  // SUN, including platform fee.
  readonly trxSun: string;
  // Minimum token base units; lower output reverts.
  readonly minTokenAmount: string;
}

export interface SellRequest {
  readonly token: string;
  // Token base units.
  readonly tokenAmount: string;
  // Minimum SUN; lower output reverts.
  readonly minTrxSun: string;
}
