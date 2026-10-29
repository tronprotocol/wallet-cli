// Return unsigned payloads; the transaction pipeline owns signing and broadcasting.
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type {
  ApprovalCapablePort,
  ContractCallPayload,
} from "../../contracts/tron-contract-call.js";
import type { LaunchpadState } from "../../../domain/sunpump/curve.js";
import type { BaseUnits, Sun } from "../../../domain/amounts/index.js";

// Token facts read on chain.
export interface LaunchpadTokenFacts {
  readonly address: string;
  readonly decimals: number;
  readonly symbol: string;
}

export interface BuyQuote {
  readonly tokenAmount: BaseUnits;
  // Fee included in the input TRX.
  readonly feeSun: Sun;
}

export interface SellQuote {
  // Net received by the seller, excluding the fee paid alongside it.
  readonly trxAmountSun: Sun;
  // Gross sale proceeds are trxAmountSun + feeSun.
  readonly feeSun: Sun;
}

export interface LaunchpadPort extends ApprovalCapablePort {
  readonly approvalDomain: "sunpump-launchpad";

  // On-chain trading state; catalogue status can be stale.
  tokenState(network: NetworkDescriptor, token: string): Promise<LaunchpadState>;

  tokenFacts(network: NetworkDescriptor, token: string): Promise<LaunchpadTokenFacts>;

  balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<BaseUnits>;

  quoteBuy(network: NetworkDescriptor, token: string, trxSun: Sun): Promise<BuyQuote>;

  quoteSell(network: NetworkDescriptor, token: string, tokenAmount: BaseUnits): Promise<SellQuote>;

  // Token amount corresponding to one SUN net proceeds.
  minimumSellAmount(network: NetworkDescriptor, token: string): Promise<BaseUnits>;

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
  // Including platform fee.
  readonly trxSun: Sun;
  // Lower output reverts.
  readonly minTokenAmount: BaseUnits;
}

export interface SellRequest {
  readonly token: string;
  readonly tokenAmount: BaseUnits;
  // Lower output reverts.
  readonly minTrxSun: Sun;
}
