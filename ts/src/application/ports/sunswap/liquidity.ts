/**
 * LiquidityPort — the chain reads and the call payloads the liquidity use case needs.
 *
 * It declares what is implemented today and grows a method as each command lands, for the same
 * reason the market port does: a method nobody calls is a promise with no test behind it.
 *
 * Everything crossing this line is a decimal string of BASE UNITS or a bounded integer. A deposit
 * is money, and `number` rewrites anything past fifteen digits without saying so.
 *
 * The port returns PAYLOADS, never receipts. Signing and broadcasting belong to `TxPipeline`, and
 * an adapter that sent its own transaction would sit outside every guarantee the pipeline makes
 * about dry-run, permissions and confirmation.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";

/**
 * The call shapes, re-exported from where every TRON contract call is described.
 *
 * They moved out of this file when SunPump needed the same two types: a contract-call payload is
 * not a fact about SunSwap. Re-exported rather than relocated at every call site, so this port's
 * consumers did not have to change.
 */
import type { ContractCallPayload } from "../../contracts/tron-contract-call.js";

export type { ContractCallPayload, ContractParameter } from "../../contracts/tron-contract-call.js";

/** What a token is, as the chain reports it — never as a market DTO claims. */
export interface TokenFacts {
  readonly address: string;
  readonly decimals: number;
  readonly symbol: string;
}

/** The state of one V2 pair, read fresh. */
export interface V2PairState {
  /** the pair contract, which is also the LP token. */
  readonly pairAddress: string;
  /** reserves in base units, ordered to match `token0` / `token1` as given. */
  readonly reserve0: string;
  readonly reserve1: string;
  /** zero for a pair that exists but has never been funded. */
  readonly totalSupply: string;
  /** the LP token's own decimals, read from the pair; 0 when there is no pair to ask. */
  readonly lpDecimals: number;
  /** false when the factory has no pair for this token order at all. */
  readonly exists: boolean;
}

export interface V4LiquidityReceiptQuery {
  readonly poolId: string;
  readonly tokenId?: string;
  readonly account: string;
  readonly token0: string;
  readonly token1: string;
  /** Exact native value of the submitted payload, before any refund. */
  readonly nativeValueSent?: string;
}

export interface V4LiquidityResult {
  readonly tokenId: string;
  readonly liquidityDelta: string;
  /** Signed principal deltas from the pool event; positive means withdrawal. */
  readonly principal0: string;
  readonly principal1: string;
  readonly fee0: string;
  readonly fee1: string;
  /** Signed account flows from this receipt, excluding the network fee. */
  readonly balanceDelta0: string;
  readonly balanceDelta1: string;
}

/** The V2/V3 contracts a liquidity plan names, base58. */
export interface LiquidityContractAddresses {
  readonly v2Router: string;
  readonly v3PositionManager: string;
  /** what a native TRX side becomes in a pool: pools are keyed by the wrapped token. */
  readonly wtrx: string;
}

export interface LiquidityPort {
  /** SunSwap's own contracts — routers, the position manager, and Permit2 */
  readonly approvalDomain: "sunswap-contracts";

  /** the SDK's V2/V3 addresses for this network; throws `unsupported_network` where it has none. */
  contracts(network: NetworkDescriptor): LiquidityContractAddresses;

  /** decimals and symbol straight from the token contract. */
  tokenFacts(network: NetworkDescriptor, address: string): Promise<TokenFacts>;

  /**
   * The token's `name()`, or UNDEFINED when it has none to give.
   *
   * Separate from `tokenFacts` and best effort on purpose. `name` is optional in TRC-20 and some
   * real tokens do not implement it; folding it into the facts every liquidity command depends on
   * would let one missing getter refuse a deposit. Only `position-info` publishes it, and it omits
   * the key rather than inventing a name.
   */
  tokenName(network: NetworkDescriptor, address: string): Promise<string | undefined>;

  /**
   * What the position-manager NFT calls itself: its own `name()` and `symbol()`.
   *
   * Read rather than transcribed. PM 7.2.4 quotes "SUNSWAP V4 POSITION" / "SUN-V4-POS" from the
   * market API, and mainnet's contract answers "SunSwap V4 Positions NFT" / "SUN-SWAP-V4-POSM" —
   * so a hardcoded pair would be published under a network's name while naming a contract that
   * says otherwise.
   */
  positionNftFacts(
    network: NetworkDescriptor,
    protocol: "V3" | "V4",
  ): Promise<{ readonly name: string; readonly symbol: string }>;

  /** the V2 pair for an unordered token couple, and its current reserves. */
  v2PairState(network: NetworkDescriptor, token0: string, token1: string): Promise<V2PairState>;

  /** Router return values for this transaction only, in the caller's token order.
   * Native calls return (token, TRX); nativeFirst restores a caller's (TRX, token) order.
   */
  v2LiquidityResult(
    network: NetworkDescriptor,
    txId: string,
    operation: "add" | "remove",
    nativeFirst: boolean,
  ): Promise<{ amount0: string; amount1: string; lpAmount?: string } | undefined>;

  /** `owner`'s balance of `token`, in base units. */
  balanceOf(network: NetworkDescriptor, token: string, owner: string): Promise<string>;

  /** `owner`'s native TRX balance, in SUN. Native TRX has no contract to ask `balanceOf`. */
  nativeBalance(network: NetworkDescriptor, owner: string): Promise<string>;

  /** how much of `token` `spender` may currently move on `owner`'s behalf, in base units. */
  allowance(
    network: NetworkDescriptor,
    token: string,
    owner: string,
    spender: string,
  ): Promise<string>;

  /** an ERC-20 approval for exactly `amount` — never an unbounded one on this path. */
  approvalPayload(
    network: NetworkDescriptor,
    token: string,
    spender: string,
    amount: string,
  ): ContractCallPayload;

  /** the V2 `addLiquidity` call for an already-validated TRC20/TRC20 deposit. */
  v2AddLiquidityPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityRequest,
  ): ContractCallPayload;

  /**
   * The V2 `addLiquidityETH` call, for a deposit with native TRX on one side.
   *
   * A different method, not a variant of the one above: native TRX is not a TRC-20, so the
   * router takes it as the call's value rather than as an argument, and only the token side is
   * ever approved.
   */
  v2AddLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2AddLiquidityEthRequest,
  ): ContractCallPayload;

  /** the V3 pool for a token pair at one fee tier, and where its price currently sits. */
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

  /** an existing position and its holder, by NFT id. */
  v3Position(network: NetworkDescriptor, tokenId: string): Promise<V3Position>;

  /** a V4 pool by its 32-byte id, with the key it was derived from. */
  v4PoolState(network: NetworkDescriptor, poolId: string): Promise<V4PoolState>;

  /**
   * a V4 position, as the position manager describes it.
   *
   * The pool it is in is taken from the position's own record and cross-checked against the pool key
   * returned beside it, so a mis-decode stops here rather than sizing a withdrawal against the wrong
   * pool.
   */
  v4Position(network: NetworkDescriptor, tokenId: string): Promise<V4Position>;

  /**
   * What a V4 position is owed right now — or UNDEFINED when that cannot be established.
   *
   * The LP fee helper is asked what `getLPFees` reports for the position's own pool, range and
   * salt. It is a read, so it answers a fact rather than an estimate, and it is taken BEFORE the
   * collection for the same reason V3's is: afterwards the fees have arrived and nothing separates
   * them from anything else in the account.
   *
   * `undefined` is a THIRD state, and it is not zero. Zero means the helper answered and the
   * position is owed nothing; `undefined` means the question could not be answered — the read
   * failed, or came back in a shape this cannot decode. On a command whose whole purpose is
   * collecting money, printing a zero for the second case would tell a caller their position had
   * earned nothing, which is not something anybody measured.
   */
  v4OwedFees(
    network: NetworkDescriptor,
    position: V4OwedFeesQuery,
  ): Promise<V4OwedFees | undefined>;

  /**
   * Size a deposit against a range: given one side or both, what each side actually becomes and
   * what liquidity it funds.
   *
   * Pure arithmetic, and it sits behind the port rather than in the domain for one reason — the
   * Uniswap v3 maths is the vendor SDK's, and the vendor is confined to this adapter. What is
   * ours (fee tier to spacing, alignment, bounds) stays in the domain.
   */
  v3Amounts(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: string; amount1?: string },
  ): V3AmountPlan;

  /**
   * What a given amount of a position's liquidity is worth, at the pool's current price.
   *
   * The mirror of `v3Amounts`: that one asks what amounts buy, this one asks what liquidity is
   * worth. A withdrawal knows the liquidity and needs the amounts.
   */
  v3AmountsForLiquidity(
    pool: V3PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string };

  /**
   * The same sizing for a V4 pool — literally the same arithmetic.
   *
   * Concentrated liquidity does not differ between V3 and V4: the amounts follow from the current
   * sqrt price and the range's two sqrt prices, and the formulas do not know which protocol asked.
   * What differs sits around them — a V4 range aligns to the POOL's own tick spacing rather than one
   * implied by a fee tier, and TRX stays native.
   */
  v4Amounts(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    given: { amount0?: string; amount1?: string },
  ): V3AmountPlan;

  v4AmountsForLiquidity(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string };

  /**
   * What a given liquidity COSTS — rounded up, so it is the ceiling the contract will demand.
   *
   * The mirror of the one above, which rounds down because it answers what a withdrawal is worth.
   * Needed where the caller supplies liquidity rather than amounts, since there is then no sizing
   * plan to take the ceiling from.
   */
  v4AmountsForLiquidityCeiling(
    pool: V4PoolState,
    range: { tickLower: number; tickUpper: number },
    liquidity: string,
  ): { amount0: string; amount1: string };

  /**
   * The V4 deposit, as ONE call — and its shape is measured, not designed.
   *
   * With no permits it is a bare `modifyLiquidities`. With them it is `multicall(bytes[])` on the
   * position manager carrying a Permit2 forward call per token FOLLOWED BY the deposit, so the grants
   * and the spend land in the same transaction. Verified on Nile: 8 logs against the bare call's 6, so
   * the forwarding happens rather than being accepted and ignored.
   *
   * `amount0Max` / `amount1Max` are a CEILING, which is the opposite of V2 and V3's floor. They must
   * be at least what the contract's own recomputation demands — see `v4Amounts`, whose figures already
   * are exactly that.
   */
  v4DepositPayload(network: NetworkDescriptor, request: V4DepositRequest): ContractCallPayload;

  /**
   * The V4 increase: more liquidity into a position that already exists.
   *
   * The same call shape as the deposit above, and the same direction of bound — an increase IS a
   * deposit, so `amount0Max` / `amount1Max` are a CEILING here too. What differs is the action inside
   * `modifyLiquidities`: the position is named by its token id, and there is nothing to mint, so no
   * owner travels with it. The range is the position's own and is not a parameter at all.
   */
  v4IncreasePayload(network: NetworkDescriptor, request: V4IncreaseRequest): ContractCallPayload;

  /**
   * The V4 withdrawal: decrease the position and take what it frees, in one call.
   *
   * `amount0Min` / `amount1Min` are a FLOOR — the opposite of the deposit's ceiling on the same
   * protocol. The bound sits where the risk is: a deposit can overspend, a withdrawal can underpay.
   *
   * No Permit2 anywhere. The position manager already holds the position, so nothing needs authorising
   * to move — the same reason V3's withdrawal approves nothing.
   */
  v4RemovePayload(network: NetworkDescriptor, request: V4RemoveRequest): ContractCallPayload;

  /**
   * The V4 fee collection: everything the position is owed, and nothing else.
   *
   * There is no "how much", because the contract does not offer one — the same shape as V3's collect.
   */
  v4CollectPayload(
    network: NetworkDescriptor,
    request: {
      readonly pool: V4RemoveRequest["pool"];
      readonly tokenId: string;
      readonly recipient: string;
      readonly deadline: number;
    },
  ): ContractCallPayload;

  /** The Permit2 contract a V4 deposit approves its tokens to. */
  permit2Address(network: NetworkDescriptor): string;

  /** The V4 position manager: the contract the deposit is made through, and the permits' spender. */
  v4PositionManager(network: NetworkDescriptor): string;

  /** The id a pool key hashes to, for a pool being created that has none yet. */
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

  /**
   * A tick spacing as the `parameters` word a pool key carries.
   *
   * Only for a pool being CREATED. An existing pool's word is read from its key and never re-encoded,
   * because re-encoding is our guess at a layout the pool has already told us.
   */
  v4ParametersFor(tickSpacing: number): string;

  /** Validate an initial Q64.96 price and return its tick using the contract's integer maths. */
  tickAtSqrtPrice(sqrtPriceX96: string): number;

  /** `mint`, which creates a new position NFT. */
  v3MintPayload(network: NetworkDescriptor, request: V3MintRequest): ContractCallPayload;

  /** `increaseLiquidity`, which adds to one that already exists. */
  v3IncreasePayload(network: NetworkDescriptor, request: V3IncreaseRequest): ContractCallPayload;

  /** the V2 `removeLiquidity` call: burn LP, take both sides back. */
  v2RemoveLiquidityPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityRequest,
  ): ContractCallPayload;

  /** the V2 `removeLiquidityETH` call, for a pair with native TRX on one side. */
  v2RemoveLiquidityEthPayload(
    network: NetworkDescriptor,
    request: V2RemoveLiquidityEthRequest,
  ): ContractCallPayload;

  /**
   * ONE transaction that decreases the position AND collects what it frees.
   *
   * `decreaseLiquidity` on its own only credits the position — it transfers nothing — so a user
   * who sent it would see a successful transaction and receive no tokens. The two are packed
   * into a single `multicall`, which is this version's addition over upstream (PM 6.2.1).
   */
  v3RemovePayload(network: NetworkDescriptor, request: V3RemoveRequest): ContractCallPayload;

  /**
   * `collect` on its own: take everything the position is owed, without touching the principal.
   *
   * The same call the removal's multicall ends with, sent alone — which is why there is no
   * "how much" to it: `collect` takes what is owed, and a position's fees are owed in full.
   */
  v3CollectFeesPayload(
    network: NetworkDescriptor,
    request: { tokenId: string; recipient: string },
  ): ContractCallPayload;

  /**
   * The fees the position can collect right now, read with a static call.
   *
   * Taken BEFORE the transaction, because afterwards principal and fees have arrived together
   * and nothing distinguishes them: the split is what arrived minus what was owed.
   */
  v3OwedFees(
    network: NetworkDescriptor,
    tokenId: string,
    recipient: string,
  ): Promise<{ amount0: string; amount1: string }>;

  /** Amounts and liquidity from the transaction's IncreaseLiquidity event. */
  v3DepositedAmounts(
    network: NetworkDescriptor,
    txId: string,
    tokenId?: string,
  ): Promise<{ tokenId: string; liquidity: string; amount0: string; amount1: string } | undefined>;

  /** what a confirmed removal actually transferred, from the transaction's own `Collect` event. */
  v3CollectedAmounts(
    network: NetworkDescriptor,
    txId: string,
  ): Promise<{ amount0: string; amount1: string } | undefined>;

  /**
   * The NFT id a confirmed mint created, read from the transaction's own log.
   *
   * It exists nowhere else: the manager assigns it during execution, so nothing before the
   * receipt can know it. Undefined when the transaction minted nothing.
   */
  v3MintedPositionId(network: NetworkDescriptor, txId: string): Promise<string | undefined>;

  /** The id of the V4 position a confirmed mint created, from its ERC-721 `Transfer` log. */
  v4MintedPositionId(network: NetworkDescriptor, txId: string): Promise<string | undefined>;
}

/** A V3 pool, as `slot0` and the factory report it. */
export interface V3PoolState {
  readonly poolAddress: string;
  /** false when the factory has never created this token pair at this tier. */
  readonly exists: boolean;
  /**
   * Zero for a pool that exists but was never initialised, and at the MIN/MAX bound for one
   * initialised and never traded — which has no established price, so a deposit into it lands
   * entirely on one side.
   */
  readonly sqrtPriceX96: string;
  readonly currentTick: number;
  readonly fee: number;
  /** the pool's own token order, which need not be the caller's. */
  readonly token0: string;
  /**
   * The pool's ACTIVE liquidity: what is in range at the current tick, not its lifetime total.
   *
   * "0" for a pool the factory never created. A position's share of a pool is measured against
   * this, and only while the position is itself in range — out of range it contributes none of it.
   */
  readonly liquidity: string;
}

/** An existing position, read from the position manager. */
export interface V3Position {
  readonly tokenId: string;
  /** who holds the NFT — an increase against a position the signer does not own is refused. */
  readonly owner: string;
  readonly token0: string;
  readonly token1: string;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: string;
}

/**
 * A V4 pool, and how it is identified.
 *
 * A pool id, not a pair: two V4 pools can hold the same tokens at the same fee tier and differ in
 * tick spacing or hooks, so the pair does not name one. `currency0` may be NATIVE TRX — V4 does not
 * wrap, unlike V2 and V3 — and `hooks` is the zero address when there is no hook, which on TRON is
 * the same string as native TRX. Both are `describeHooks`'s problem to say out loud, not this
 * type's to disguise.
 */
export interface V4PoolState {
  readonly poolId: string;
  /** false when nothing has initialised this pool: its price is zero and no deposit can be sized. */
  readonly exists: boolean;
  readonly sqrtPriceX96: string;
  readonly currentTick: number;
  readonly liquidity: string;
  readonly currency0: string;
  readonly currency1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  /** the zero address when the pool has no hook. Never shown to a reader unchanged. */
  readonly hooks: string;
  /**
   * The pool key's own `parameters` word, verbatim.
   *
   * `tickSpacing` above is decoded FROM it, and both are carried because the two have different
   * jobs: the number is what a range is aligned to, and this word is what the key is rebuilt from.
   * Re-encoding it from the spacing would be our guess at a layout the pool has already told us.
   */
  readonly parameters: string;
}

/**
 * A V4 position, from the position manager's own reads.
 *
 * The pair, the tier and the range come from `getPoolAndPositionInfo`, never from our own
 * reconstruction of a pool key: the position manager is the authority on what a position is in, and
 * the packed word it returns is checked against its own pool key before any of this is used.
 */
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
  /** subscribed to a notifier contract. A fact about the position, not a problem with it. */
  readonly hasSubscriber: boolean;
}

/** Which position to ask the LP fee helper about. The range is part of the key, not a filter. */
export interface V4OwedFeesQuery {
  /** doubles as the position's salt in the pool manager's position key. */
  readonly tokenId: string;
  readonly poolId: string;
  readonly tickLower: number;
  readonly tickUpper: number;
}

/** `feesOwed0` / `feesOwed1`, base units, as decimal strings. Never `number`: fees exceed 2^53. */
export interface V4OwedFees {
  readonly amount0: string;
  readonly amount1: string;
}

/** A V4 deposit: the pool, the range, the liquidity, the ceiling, and any permits it carries. */
export interface V4DepositRequest {
  /** Present only when this transaction must initialize the pool before minting. */
  readonly initialSqrtPriceX96?: string;
  /** The pool key, as the position manager reports it or as a creation supplies it. */
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    /** The key's own `parameters` word, never re-encoded from the spacing. */
    readonly parameters: string;
  };
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: string;
  /** The CEILING on each side, base units. Not a minimum — V4 bounds a deposit from above. */
  readonly amount0Max: string;
  readonly amount1Max: string;
  readonly owner: string;
  /**
   * Where anything the pool does not take goes.
   *
   * Measured: it is encoded only when a native currency is involved, because that is the only case
   * with an excess — a native deposit sends the CEILING as the call's value, while a token deposit has
   * exactly what it needs pulled through Permit2. Always set regardless, so a caller does not have to
   * know which pools make it load-bearing.
   */
  readonly sweepRecipient: string;
  readonly deadline: number;
  /** One signed grant per token that needed one. Empty when the standing grants already cover it. */
  readonly permits: readonly { readonly grant: unknown; readonly signature: string }[];
}

/**
 * A V4 increase: which position, how much liquidity to add, and the ceiling it may cost.
 *
 * Deliberately NOT `V4DepositRequest` with an optional token id. The two carry different fields —
 * a mint has an owner and a range, an increase has a token id and neither — and one type covering
 * both would make every field optional and let a mint be built with no range at all.
 */
export interface V4IncreaseRequest {
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    /** The key's own `parameters` word, never re-encoded from the spacing. */
    readonly parameters: string;
  };
  readonly tokenId: string;
  readonly liquidity: string;
  /** The CEILING on each side, base units. An increase is a deposit: it is bounded from ABOVE. */
  readonly amount0Max: string;
  readonly amount1Max: string;
  /** whose Permit2 grants the multicall forwards — the signing account, which holds the position. */
  readonly owner: string;
  /** where the unspent part of a native ceiling returns. Measured to bite only on a native pair. */
  readonly sweepRecipient: string;
  readonly deadline: number;
  /** One signed grant per token that needed one. Empty when the standing grants already cover it. */
  readonly permits: readonly { readonly grant: unknown; readonly signature: string }[];
}

/** A V4 withdrawal: which position, how much of its liquidity, and the least to accept back. */
export interface V4RemoveRequest {
  readonly pool: {
    readonly currency0: string;
    readonly currency1: string;
    readonly hooks: string;
    readonly fee: number;
    readonly parameters: string;
  };
  readonly tokenId: string;
  /** the position's internal liquidity to burn — not a token amount, and not scaled by anything. */
  readonly liquidity: string;
  /** the FLOOR on each side, base units. Zero means "accept whatever comes back". */
  readonly amount0Min: string;
  readonly amount1Min: string;
  readonly recipient: string;
  readonly deadline: number;
}

/** What a deposit into a V3 range actually becomes: both sides, and the liquidity they fund. */
export interface V3AmountPlan {
  readonly amount0: string;
  readonly amount1: string;
  readonly liquidity: string;
}

export interface V3MintRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly amount0Desired: string;
  readonly amount1Desired: string;
  readonly amount0Min: string;
  readonly amount1Min: string;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V3IncreaseRequest {
  readonly tokenId: string;
  readonly amount0Desired: string;
  readonly amount1Desired: string;
  readonly amount0Min: string;
  readonly amount1Min: string;
  readonly deadline: number;
}

export interface V2RemoveLiquidityRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  /** LP tokens to burn, in base units. */
  readonly liquidity: string;
  readonly amount0Min: string;
  readonly amount1Min: string;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2RemoveLiquidityEthRequest {
  /** the TRC20 side; the other is native TRX and comes back as TRX. */
  readonly token: TokenFacts;
  readonly liquidity: string;
  readonly amountTokenMin: string;
  readonly amountNativeMin: string;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V3RemoveRequest {
  readonly tokenId: string;
  /** the position's internal liquidity to burn — not a token amount. */
  readonly liquidity: string;
  readonly amount0Min: string;
  readonly amount1Min: string;
  /** where the principal and the fees collected alongside it are sent. */
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2AddLiquidityEthRequest {
  /** the TRC20 side; the other side is native TRX and needs no address. */
  readonly token: TokenFacts;
  readonly amountTokenDesired: string;
  readonly amountTokenMin: string;
  /** SUN. Becomes the call's value, and is the one number here nothing may round or default. */
  readonly amountNativeDesired: string;
  readonly amountNativeMin: string;
  readonly recipient: string;
  readonly deadline: number;
}

export interface V2AddLiquidityRequest {
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  /** base units the caller is willing to deposit. */
  readonly amount0Desired: string;
  readonly amount1Desired: string;
  /** base units below which the deposit should revert rather than proceed. */
  readonly amount0Min: string;
  readonly amount1Min: string;
  /** who receives the LP tokens. */
  readonly recipient: string;
  /** seconds since epoch. */
  readonly deadline: number;
}
