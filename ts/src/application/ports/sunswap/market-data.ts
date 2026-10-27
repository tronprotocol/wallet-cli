// Monetary fields retain exact decimal digits.

import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface ListPositionsQuery {
  // Base58; this layer does not default to the active account.
  readonly owner: string;
  // 64-hex pool ID or base58 pool address.
  readonly pool?: string;
  readonly protocol?: string;
  // 1-based.
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface PositionTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  // Token base units.
  readonly amount: string;
  readonly priceUsd: string;
  // Token base units; absent when none is reported.
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
  // Omitted for V3/V4 NFTs, which have no per-LP-token price.
  readonly lpPriceUsd?: string;
  readonly nftTokenId?: string;
  readonly poolShare: string;
  readonly status: string;
  readonly lpTokenSymbol: string;
  readonly lpTokenName: string;
  // UTC minute, YYYY-MM-DD HH:mm.
  readonly lastActiveAt: string;
  // Protocol-specific extras with camelCased keys.
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface PositionPage {
  readonly positions: readonly PositionRecord[];
  // Server-provided only; a full page does not imply another page.
  readonly hasMore?: boolean;
}

export interface PriceRecord {
  readonly address: string;
  // Exact service quote; zero may mean an unindexed address, not a worthless token.
  readonly priceUsd: string;
  // Response time in UTC, YYYY-MM-DD HH:mm; not price freshness.
  readonly quotedAt: string;
}

export interface TokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  // Statistics scope; ALL and individual-protocol rows must not be added together.
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
  readonly transaction1d: number;
  readonly transaction1dRate: string;
  readonly transactionRecentTotal: number;
  // Related-pool preview, not the complete set.
  readonly relevantProtocols: readonly string[];
  readonly relevantPools: readonly string[];
}

export interface ListTokensQuery {
  readonly address?: string;
  readonly protocol: string;
  // API sort field, already translated from the CLI name.
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

export interface PoolTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logo: string;
  // Reserve in token base units.
  readonly amount: string;
  readonly priceUsd: string;
  // Token base units of 24h volume.
  readonly volume1d: string;
}

export interface PoolRecord {
  // V4 uses a 64-hex pool ID, not a contract address.
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
  // UTC minute, YYYY-MM-DD HH:mm.
  readonly createdAt: string;
  readonly createTxHash: string;
  // Protocol-specific extras with camelCased keys.
  readonly extra: Readonly<Record<string, unknown>>;
  // Raw token0-per-token1 rates; converted to quoted prices before publication.
  readonly rates: readonly string[];
}

export type PoolView = Omit<PoolRecord, "rates"> & {
  // Pool-specific prices in the filtered token; present only when a token filter was supplied.
  readonly pairPrices?: readonly { base: string; quote: string; price: string }[];
};

export interface ListPoolsQuery {
  // Contract address or 64-hex V4 pool ID without 0x.
  readonly pool?: string;
  // Resolved token address, not a symbol.
  readonly token?: string;
  readonly protocol?: string;
  readonly sort?: string;
  // False requests ascending order.
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
  // Count for the same search; null when unavailable.
  countPools(network: NetworkDescriptor, query: SearchPoolsQuery): Promise<number | null>;
  listTokens(network: NetworkDescriptor, query: ListTokensQuery): Promise<TokenPage>;
  searchTokens(network: NetworkDescriptor, query: SearchTokensQuery): Promise<TokenPage>;
  listPositions(network: NetworkDescriptor, query: ListPositionsQuery): Promise<PositionPage>;
  // Results may arrive in a different order from the requested addresses.
  prices(network: NetworkDescriptor, addresses: readonly string[]): Promise<PriceRecord[]>;
  // Catalogue symbols are display labels, not proof of token authenticity.
  symbols(network: NetworkDescriptor, addresses: readonly string[]): Promise<Map<string, string>>;
}
