/**
 * MarketDataPort — read-only SunSwap market data, as the application needs it.
 *
 * The port declares exactly what is implemented today and grows a method as each command lands.
 * A method nobody calls is a promise with no test behind it, and a port is the caller's
 * contract, not a plan.
 *
 * Records here are normalised but not yet interpreted: field names are this codebase's, parallel
 * arrays have been folded into `tokens`, and every numeric value is a string carrying the
 * remote's exact digits. Symbol resolution, pagination windows, derived prices and rendering all
 * belong above this line.
 *
 * Every money- or amount-shaped field is a `string` on purpose. These values reach 25
 * significant digits — `position_liquidity` is what a user copies into a remove-liquidity
 * call — and `number` rewrites anything past 15 of them without saying so.
 */

import type { NetworkDescriptor } from "../../../domain/types/index.js";

/** One page of positions, in the server's own paging terms. */
export interface ListPositionsQuery {
  /** base58 owner address; never defaulted to the active account by this layer. */
  readonly owner: string;
  /** pool id (64-hex) or base58 pool address, when narrowing to one pool. */
  readonly pool?: string;
  /** normalised protocol enum member, or "ALL". */
  readonly protocol?: string;
  /** 1-based page number, the only paging the server offers. */
  readonly pageNo: number;
  readonly pageSize: number;
}

/** A token leg of a position: the parallel `token*List` arrays, folded into one record. */
export interface PositionTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  /** the caller's share of this token in the pool, in base units. */
  readonly amount: string;
  readonly priceUsd: string;
  /** unclaimed reward in base units; absent when the protocol reports none. */
  readonly rewardAmount?: string;
}

export interface PositionRecord {
  readonly positionType: string;
  readonly protocol: string;
  readonly poolAddress: string;
  readonly owner: string;
  readonly poolFeeRate: string;
  readonly tokens: readonly PositionTokenRecord[];
  readonly lpBalanceUsd: string;
  readonly lpBalanceAmount: string;
  /** dropped on V3/V4, where a position is an NFT and a per-LP-token price means nothing. */
  readonly lpPriceUsd?: string;
  readonly nftTokenId?: string;
  readonly poolShare: string;
  readonly status: string;
  readonly lpTokenSymbol: string;
  readonly lpTokenName: string;
  /** UTC minute, "YYYY-MM-DD HH:mm". */
  readonly lastActiveAt: string;
  /** protocol-specific extras, keys camelCased, shape deliberately left open. */
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface PositionPage {
  readonly positions: readonly PositionRecord[];
  /**
   * The server's own answer, never inferred. Absent when it did not say: a page that came back
   * full is not evidence of another one, and an unanswered question is more honest than a guess.
   */
  readonly hasMore?: boolean;
}

/** One token's USD quote, as the service reported it. */
export interface PriceRecord {
  readonly address: string;
  /**
   * The exact digits the service sent. "0" is a real answer, not a failure: the service returns
   * it for an address it has never indexed — an unlisted token, an impersonation, or a plain
   * wallet address — so a caller must not read zero as "this token is worthless".
   */
  readonly priceUsd: string;
  /** UTC minute the service answered, "YYYY-MM-DD HH:mm". Not a freshness claim. */
  readonly quotedAt: string;
}

/** A token as the DEX catalogue reports it, within ONE protocol scope. */
export interface TokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  /**
   * The scope these statistics were measured in, not a property of the token. An `ALL` row and a
   * `V3` row for the same token report different numbers and must never be added together.
   */
  readonly protocol: string;
  readonly priceUsd: string;
  readonly priceUsd1dRate: string;
  readonly reserveUsd: string;
  readonly reserveUsd1dRate: string;
  readonly volumeUsd1d: string;
  readonly volumeUsd7d: string;
  readonly volumeUsd14d: string;
  readonly volumeUsd1dRate: string;
  readonly volumeUsd7dRate: string;
  /** counts, not money: these fit in a number and reading them as one is what a caller wants. */
  readonly transaction1d: number;
  readonly transaction1dRate: string;
  readonly transactionRecentTotal: number;
  /** at most ten, and NOT the full set; `pool-list --token` is how to see them all. */
  readonly relevantProtocols: readonly string[];
  readonly relevantPools: readonly string[];
}

/** One page of tokens, in the server's own paging terms. */
export interface ListTokensQuery {
  readonly address?: string;
  readonly protocol: string;
  /** the service's own field name, already translated from the CLI's vocabulary. */
  readonly sort?: string;
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface SearchTokensQuery {
  readonly keyword: string;
  readonly protocol: string;
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface TokenPage {
  readonly tokens: readonly TokenRecord[];
  readonly hasMore?: boolean;
}

/** A token leg of a pool: the parallel `token*List` arrays, folded into one record. */
export interface PoolTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  /** the pool's reserve of this token, in base units. */
  readonly amount: string;
  readonly priceUsd: string;
  /** this token's share of the pool's 24h volume, in base units. */
  readonly volume1d: string;
}

export interface PoolRecord {
  /**
   * The pool's identifier — and NOT always an address. V4 is a singleton pool-manager
   * architecture, so a V4 pool is a 64-hex id rather than a contract; querying it as a contract
   * fails. Read `protocol` before treating this as an address.
   */
  readonly poolAddress: string;
  readonly protocol: string;
  readonly poolType: string;
  readonly feeRate: string;
  readonly protocolFeeRate: string;
  readonly tokens: readonly PoolTokenRecord[];
  readonly reserveUsd: string;
  readonly reserveUsd1dRate: string;
  readonly volumeUsd1d: string;
  readonly volumeUsd1dRate: string;
  readonly volumeUsd7d: string;
  readonly volumeUsd7dRate: string;
  readonly volumeUsd14d: string;
  readonly feeUsd1d: string;
  readonly farmApr: string;
  readonly feeApr: string;
  readonly totalApr: string;
  readonly transaction1d: number;
  readonly transaction1dRate: string;
  readonly transactionRecentTotal: number;
  /** UTC minute, "YYYY-MM-DD HH:mm". */
  readonly createdAt: string;
  readonly createTxHash: string;
  /** protocol-specific extras, keys camelCased, shape deliberately left un-normalised. */
  readonly extra: Readonly<Record<string, unknown>>;
  /**
   * The pool's own exchange rates, exactly as the service reported them.
   *
   * Raw input for `pairPrices`, and NOT part of the published payload: the rate's orientation
   * ("token0 per one token1") is a service detail nobody should have to know, so the use case
   * turns it into a quoted price and drops this.
   */
  readonly rates: readonly string[];
}

/** A pool as a caller sees it: the record above, with the raw rates replaced by quoted prices. */
export type PoolView = Omit<PoolRecord, "rates"> & {
  /**
   * Prices of this pool's other tokens, quoted in the token the caller filtered by. Present only
   * when `--token` was given, and computed from THIS pool's rate: two pools holding the same
   * pair can and do price it differently, so a pair price is never a market-wide quote.
   */
  readonly pairPrices?: readonly { base: string; quote: string; price: string }[];
};

export interface ListPoolsQuery {
  /** a pool contract address, or a 64-hex V4 pool id with any 0x prefix already stripped. */
  readonly pool?: string;
  /** an exact token CONTRACT address; symbols are resolved before they reach this port. */
  readonly token?: string;
  readonly protocol?: string;
  readonly sort?: string;
  /** false asks the service for ascending order; the pool endpoints are the only ones with it. */
  readonly desc: boolean;
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface SearchPoolsQuery {
  readonly keyword: string;
  readonly protocol?: string;
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface PoolPage {
  readonly pools: readonly PoolRecord[];
  readonly hasMore?: boolean;
}

export interface MarketDataPort {
  listPools(network: NetworkDescriptor, query: ListPoolsQuery): Promise<PoolPage>;
  searchPools(network: NetworkDescriptor, query: SearchPoolsQuery): Promise<PoolPage>;
  /** how many pools the SAME search matches; the one listing with a trustworthy total. */
  countPools(network: NetworkDescriptor, query: SearchPoolsQuery): Promise<number | null>;
  listTokens(network: NetworkDescriptor, query: ListTokensQuery): Promise<TokenPage>;
  searchTokens(network: NetworkDescriptor, query: SearchTokensQuery): Promise<TokenPage>;
  listPositions(network: NetworkDescriptor, query: ListPositionsQuery): Promise<PositionPage>;
  /** USD quotes for the given contract addresses, in whatever order the service returns them. */
  prices(network: NetworkDescriptor, addresses: readonly string[]): Promise<PriceRecord[]>;
  /**
   * Contract address → the symbol the SunSwap catalogue holds for it.
   *
   * A catalogue symbol is what the token contract calls ITSELF and is no evidence of
   * authenticity: an impersonation of USDT is listed as "USDT" too. It is display sugar beside
   * the address, never an identifier to act on.
   */
  symbols(network: NetworkDescriptor, addresses: readonly string[]): Promise<Map<string, string>>;
}
