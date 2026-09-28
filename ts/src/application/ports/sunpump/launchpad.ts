/**
 * LaunchpadPort — the curve contract reads and the call payloads the SunPump trades need.
 *
 * It returns PAYLOADS, never receipts: signing and broadcasting belong to `TxPipeline`, and an
 * adapter that sent its own transaction would sit outside every guarantee the pipeline makes
 * about dry-run, permissions and confirmation.
 *
 * Everything crossing this line is base units as a decimal string, or a bounded integer. A curve
 * trade is money, and `number` rewrites anything past fifteen digits without saying so.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type {
  ApprovalCapablePort,
  ContractCallPayload,
} from "../../contracts/tron-contract-call.js";
import type { LaunchpadState } from "../../../domain/sunpump/curve.js";

/** What a token is, as the chain reports it — never as an HTTP payload claims. */
export interface LaunchpadTokenFacts {
  readonly address: string;
  readonly decimals: number;
  readonly symbol: string;
}

/** What a buy of a given TRX amount returns, and the platform fee taken out of it. */
export interface BuyQuote {
  /** base units of the token expected out. */
  readonly tokenAmount: string;
  /** SUN of platform fee, already included in the TRX the caller named. */
  readonly feeSun: string;
}

/** What a sale of a given token amount returns, and the platform fee taken out of it. */
export interface SellQuote {
  /** SUN expected out, before the fee below is deducted. */
  readonly trxAmountSun: string;
  readonly feeSun: string;
}

export interface LaunchpadPort extends ApprovalCapablePort {
  /** SunPump's launchpad, which pulls tokens itself and takes an unlimited allowance */
  readonly approvalDomain: "sunpump-launchpad";

  /**
   * The curve contract's state for a token, read on chain.
   *
   * The authority for whether a trade is possible at all. Never an HTTP `status` field: the API
   * can be stale, and a stale "trading" sends a transaction that must revert.
   */
  tokenState(network: NetworkDescriptor, token: string): Promise<LaunchpadState>;

  /** decimals and symbol straight from the token contract. */
  tokenFacts(network: NetworkDescriptor, token: string): Promise<LaunchpadTokenFacts>;

  /** `owner`'s balance of `token`, in base units. */
  balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<string>;

  /** `owner`'s native TRX balance, in SUN — what a buy spends, and it has no contract to ask. */
  nativeBalance(network: NetworkDescriptor, owner: string): Promise<string>;

  /** how many tokens `trxSun` buys, and the fee inside it. */
  quoteBuy(network: NetworkDescriptor, token: string, trxSun: string): Promise<BuyQuote>;

  /** how much TRX `tokenAmount` sells for, and the fee taken out of it. */
  quoteSell(network: NetworkDescriptor, token: string, tokenAmount: string): Promise<SellQuote>;

  /**
   * The smallest sale the curve will price, in base units of the token.
   *
   * A sale whose gross proceeds fall below the platform fee's floor reverts inside the quote —
   * the contract would have to subtract more than it is paying out. This asks the inverse
   * question: how many tokens does the floor correspond to.
   */
  minimumSellAmount(network: NetworkDescriptor, token: string): Promise<string>;

  /** `expected × (1 − slippage)`, by the SDK's own integer arithmetic. */
  applyFloor(expected: string, slippageBips: number): string;

  /** the curve contract, which is both the counterparty and the spender a sale approves. */
  launchpadAddress(network: NetworkDescriptor): string;

  /** `purchaseToken`: TRX goes as the call's value, so nothing is approved. */
  buyPayload(network: NetworkDescriptor, request: BuyRequest): ContractCallPayload;

  /** `saleToken`: the tokens are pulled, so the launchpad must be approved first. */
  sellPayload(network: NetworkDescriptor, request: SellRequest): ContractCallPayload;
}

export interface BuyRequest {
  readonly token: string;
  /** SUN to spend, platform fee included. */
  readonly trxSun: string;
  /** base units below which the buy should revert rather than proceed. */
  readonly minTokenAmount: string;
}

export interface SellRequest {
  readonly token: string;
  /** base units of the token to sell. */
  readonly tokenAmount: string;
  /** SUN below which the sale should revert rather than proceed. */
  readonly minTrxSun: string;
}
