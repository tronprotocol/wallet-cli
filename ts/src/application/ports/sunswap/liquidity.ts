// Amounts are exact base-unit decimal strings; signing and broadcasting belong to the pipeline.
import type { NetworkDescriptor } from "../../../domain/types/index.js";

import type { ContractCallPayload } from "../../contracts/tron-contract-call.js";
import type { BaseUnits, Sun } from "../../../domain/amounts/index.js";

export type { ContractCallPayload, ContractParameter } from "../../contracts/tron-contract-call.js";

// Token facts read on chain.
export interface TokenFacts {
  readonly address: string;
  readonly decimals: number;
  readonly symbol: string;
}

export interface V2PairState {
  // Pair contract and LP token address.
  readonly pairAddress: string;
  // Reserves in caller-supplied token0/token1 order, in base units.
  readonly reserve0: string;
  readonly reserve1: string;
  // Zero when the pair has never been funded.
  readonly totalSupply: string;
  // Pair-token decimals; zero when the pair does not exist.
  readonly lpDecimals: number;
  readonly exists: boolean;
}

export interface V4LiquidityReceiptQuery {
  readonly poolId: string;
  readonly tokenId?: string;
  readonly account: string;
  readonly token0: string;
  readonly token1: string;
  // Submitted SUN before refunds.
  readonly nativeValueSent?: string;
}

export interface V4LiquidityResult {
  readonly tokenId: string;
  readonly liquidityDelta: string;
  // Signed pool-event principal deltas; positive means withdrawal.
  readonly principal0: string;
  readonly principal1: string;
  readonly fee0: string;
  readonly fee1: string;
  // Signed receipt account flows, excluding network fees.
  readonly balanceDelta0: string;
  readonly balanceDelta1: string;
}

// Base58 contract addresses.
export interface LiquidityContractAddresses {
  readonly v2Router: string;
  readonly v3PositionManager: string;
  // V2/V3 pool keys use WTRX for a native side.
  readonly wtrx: string;
}

export interface LiquidityPort {
  readonly approvalDomain: "sunswap-contracts";

  // Throws unsupported_network when SDK addresses are unavailable.
  contracts(network: NetworkDescriptor): LiquidityContractAddresses;

  tokenFacts(network: NetworkDescriptor, address: string): Promise<TokenFacts>;

  // Optional getter; missing names must not block liquidity operations.
  tokenName(network: NetworkDescriptor, address: string): Promise<string | undefined>;

  // Name and symbol from the NFT contract, not the market catalogue.
  positionNftFacts(
    network: NetworkDescriptor,
    protocol: "V3" | "V4",
  ): Promise<{ readonly name: string; readonly symbol: string }>;

  v2PairState(network: NetworkDescriptor, token0: string, token1: string): Promise<V2PairState>;

  // Transaction return amounts in caller token order; nativeFirst restores TRX to the first side.
  v2LiquidityResult(
    network: NetworkDescriptor,
    txId: string,
    operation: "add" | "remove",
    nativeFirst: boolean,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits; lpAmount?: BaseUnits } | undefined>;

  balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<BaseUnits>;

  nativeBalance(network: NetworkDescriptor, owner: string): Promise<Sun>;

  allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<BaseUnits>;

  // May be unlimited on V4.
  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: BaseUnits,
  ): ContractCallPayload;

  v2AddLiquidityPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityRequest,
  ): ContractCallPayload;

  // Native TRX is callValue; only the token side needs approval.
  v2AddLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityEthRequest,
  ): ContractCallPayload;

  v3PoolState(
    network: NetworkDescriptor,
    token0: string,
    token1: string,
    fee: number,
  ): Promise<V3PoolState>;

  v4LiquidityResult(
    network: NetworkDescriptor,
    txId: string,
    query: V4LiquidityReceiptQuery,
  ): Promise<V4LiquidityResult | undefined>;

  v3Position(network: NetworkDescriptor, tokenId: string): Promise<V3Position>;

  // 32-byte pool ID and its key.
  v4PoolState(network: NetworkDescriptor, poolId: string): Promise<V4PoolState>;

  // Cross-check the packed position pool ID against its returned key.
  v4Position(network: NetworkDescriptor, tokenId: string): Promise<V4Position>;

  // Read fees before collection; undefined means unavailable, not zero fees.
  v4OwedFees(
    network: NetworkDescriptor,
    position: V4OwedFeesQuery,
  ): Promise<V4OwedFees | undefined>;

  v3Amounts(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: BaseUnits; amount1?: BaseUnits },
  ): V3AmountPlan;

  v3AmountsForLiquidity(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits };

  // V4 uses the pool's tick spacing and keeps TRX native.
  v4Amounts(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: BaseUnits; amount1?: BaseUnits },
  ): V3AmountPlan;

  v4AmountsForLiquidity(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits };

  // Round deposit costs up to cover the contract's demand; withdrawal values round down.
  v4AmountsForLiquidityCeiling(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: BaseUnits; amount1: BaseUnits };

  // Initialization and permits precede the deposit atomically when supplied.
  // amount0Max/amount1Max cap spending and must cover the contract's recomputation.
  v4DepositPayload(network: NetworkDescriptor, request: V4DepositRequest): ContractCallPayload;

  // Increase spending is capped by amount0Max/amount1Max, using the existing position range.
  v4IncreasePayload(network: NetworkDescriptor, request: V4IncreaseRequest): ContractCallPayload;

  // Withdraw with minimum-output floors; no Permit2 authorization is needed.
  v4RemovePayload(network: NetworkDescriptor, request: V4RemoveRequest): ContractCallPayload;

  // Collect all fees owed; no partial amount is accepted.
  v4CollectPayload(
    network: NetworkDescriptor,
    request: {
      readonly pool: V4RemoveRequest["pool"];
      readonly tokenId: string;
      readonly recipient: string;
      readonly deadline: number;
    },
  ): ContractCallPayload;

  permit2Address(network: NetworkDescriptor): string;

  // Deposit target and Permit2 spender.
  v4PositionManager(network: NetworkDescriptor): string;

  v4PoolIdOf(
    network: NetworkDescriptor,
    key: {
      readonly token0: string;
      readonly token1: string;
      readonly hooks: string;
      readonly fee: number;
      readonly tickSpacing: number;
    },
  ): string;

  // Encode only for new pools; existing pools retain their parameters word unchanged.
  v4ParametersFor(tickSpacing: number): string;

  // Validate Q64.96 price and return its tick with contract integer arithmetic.
  tickAtSqrtPrice(sqrtPriceX96: string): number;

  v3MintPayload(network: NetworkDescriptor, request: V3MintRequest): ContractCallPayload;

  v3IncreasePayload(network: NetworkDescriptor, request: V3IncreaseRequest): ContractCallPayload;

  v2RemoveLiquidityPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityRequest,
  ): ContractCallPayload;

  v2RemoveLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityEthRequest,
  ): ContractCallPayload;

  // Decrease and collect atomically; decreaseLiquidity alone transfers no tokens.
  v3RemovePayload(network: NetworkDescriptor, request: V3RemoveRequest): ContractCallPayload;

  // Collect all tokens owed without decreasing liquidity.
  v3CollectFeesPayload(
    network: NetworkDescriptor,
    request: { tokenId: string; recipient: string },
  ): ContractCallPayload;

  // Simulate collect as owner before withdrawal to distinguish fees from principal.
  v3OwedFees(
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
    owner: string,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits }>;

  // From this transaction's IncreaseLiquidity event.
  v3DepositedAmounts(
    network: NetworkDescriptor,
    txId: string,
    tokenId?: string,
  ): Promise<
    { tokenId: string; liquidity: string; amount0: BaseUnits; amount1: BaseUnits } | undefined
  >;

  // From this transaction's Collect event.
  v3CollectedAmounts(
    network: NetworkDescriptor,
    txId: string,
    tokenId: string,
  ): Promise<{ amount0: BaseUnits; amount1: BaseUnits } | undefined>;

  // From the mint transaction log; unavailable before execution.
  v3MintedPositionId(network: NetworkDescriptor, txId: string): Promise<string | undefined>;

  // From the mint transaction's ERC721 Transfer log.
  v4MintedPositionId(network: NetworkDescriptor, txId: string): Promise<string | undefined>;
}

export interface V3PoolState {
  readonly poolAddress: string;
  readonly exists: boolean;
  // Q64.96 price; zero means uninitialized.
  readonly sqrtPriceX96: string;
  readonly currentTick: number;
  readonly fee: number;
  // Pool token order may differ from caller order.
  readonly token0: string;
  // Active liquidity at the current tick; zero if no pool exists.
  readonly liquidity: string;
}

export interface V3Position {
  readonly tokenId: string;
  readonly owner: string;
  readonly token0: string;
  readonly token1: string;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: string;
}

// V4 identity includes spacing and hooks; currency0 may be native TRX.
export interface V4PoolState {
  readonly poolId: string;
  // False when the pool price is uninitialized (zero).
  readonly exists: boolean;
  readonly sqrtPriceX96: string;
  readonly currentTick: number;
  readonly liquidity: string;
  readonly currency0: string;
  readonly currency1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  // Zero address means no hook.
  readonly hooks: string;
  // Preserve the parameters word verbatim when rebuilding the key; spacing alone is insufficient.
  readonly parameters: string;
}

// Position-manager data, with packed pool ID checked against the returned key.
export interface V4Position {
  readonly tokenId: string;
  readonly owner: string;
  readonly poolId: string;
  readonly currency0: string;
  readonly currency1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: string;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: string;
  readonly hasSubscriber: boolean;
}

// Range is part of the LP-fee lookup key, not a filter.
export interface V4OwedFeesQuery {
  // Also the position salt in the pool-manager key.
  readonly tokenId: string;
  readonly poolId: string;
  readonly tickLower: number;
  readonly tickUpper: number;
}

// Exact token base units.
export interface V4OwedFees {
  readonly amount0: BaseUnits;
  readonly amount1: BaseUnits;
}

export interface V4DepositRequest {
  // Initialize the pool before minting when present.
  readonly initialSqrtPriceX96?: string;
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    // Preserve the key's parameters word; do not re-encode from spacing.
    readonly parameters: string;
  };
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: string;
  // Maximum spend per side in token base units.
  readonly amount0Max: BaseUnits;
  readonly amount1Max: BaseUnits;
  // Recipient of the new position NFT.
  readonly recipient: string;
  // Funding account whose signed Permit2 grants are forwarded.
  readonly permitOwner: string;
  // Native excess returns here; native deposits send the ceiling, tokens pull only what is needed.
  readonly sweepRecipient: string;
  readonly deadline: number;
  // One per token needing a grant; empty when existing grants suffice.
  readonly permits: readonly { readonly grant: unknown; readonly signature: string }[];
}

export interface V4IncreaseRequest {
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    // Preserve the key's parameters word; do not re-encode from spacing.
    readonly parameters: string;
  };
  readonly tokenId: string;
  readonly liquidity: string;
  // Maximum spend per side in token base units.
  readonly amount0Max: BaseUnits;
  readonly amount1Max: BaseUnits;
  // Position owner whose Permit2 grants are forwarded.
  readonly owner: string;
  // Recipient of unspent native value.
  readonly sweepRecipient: string;
  readonly deadline: number;
  // One per token needing a grant; empty when existing grants suffice.
  readonly permits: readonly { readonly grant: unknown; readonly signature: string }[];
}

export interface V4RemoveRequest {
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    readonly parameters: string;
  };
  readonly tokenId: string;
  // Internal liquidity to burn, unscaled; not a token amount.
  readonly liquidity: string;
  // Minimum base units per side; zero accepts any output.
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V3AmountPlan {
  readonly amount0: BaseUnits;
  readonly amount1: BaseUnits;
  readonly liquidity: string;
}

export interface V3MintRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly amount0Desired: BaseUnits;
  readonly amount1Desired: BaseUnits;
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V3IncreaseRequest {
  readonly tokenId: string;
  readonly amount0Desired: BaseUnits;
  readonly amount1Desired: BaseUnits;
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  readonly deadline: number;
}

export interface V2RemoveLiquidityRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  // LP token base units.
  readonly liquidity: string;
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2RemoveLiquidityEthRequest {
  // TRC20 side; the other side returns native TRX.
  readonly token: TokenFacts;
  readonly liquidity: string;
  readonly amountTokenMin: BaseUnits;
  readonly amountNativeMin: Sun;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V3RemoveRequest {
  readonly tokenId: string;
  // Internal liquidity, not a token amount.
  readonly liquidity: string;
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  // Recipient of principal and collected fees.
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2AddLiquidityEthRequest {
  // TRC20 side; native TRX needs no address.
  readonly token: TokenFacts;
  readonly amountTokenDesired: BaseUnits;
  readonly amountTokenMin: BaseUnits;
  // SUN sent as callValue; must not be rounded or defaulted.
  readonly amountNativeDesired: Sun;
  readonly amountNativeMin: Sun;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2AddLiquidityRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  // Token base units.
  readonly amount0Desired: BaseUnits;
  readonly amount1Desired: BaseUnits;
  // Minimum token base units; lower amounts revert.
  readonly amount0Min: BaseUnits;
  readonly amount1Min: BaseUnits;
  // LP token recipient.
  readonly recipient: string;
  // Epoch seconds.
  readonly deadline: number;
}
