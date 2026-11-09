// Catalogue data may lag on-chain trading state; monetary values retain exact decimal digits.
import type { DispatchCheck } from "../../contracts/deadline.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface SunPumpMarketRecord {
  // Decimal USD.
  readonly marketCapUsd: string;
  // TRX per whole token; may use scientific notation.
  readonly priceInTrx: string;
  // Percentage: "-0.70" means -0.70%.
  readonly priceChange24HrPercent: string;
  // SUN.
  readonly volume24HrSun: string;
  // Decimal value; the service does not specify its unit.
  readonly virtualLiquidity: string;
  // Decimal USD per TRX; detail responses only.
  readonly trxPriceInUsd?: string;
  // priceInTrx × trxPriceInUsd, truncated to 18 places; present when the rate is.
  readonly priceUsd?: string;
}

// Curve progress and reserves before launch.
export interface SunPumpCurveRecord {
  // Percentage; "100" once launched.
  readonly pumpPercentage: string;
  // Token base units.
  readonly currentSold: string;
  // Token base units.
  readonly tokenReserve: string;
  // Whole TRX, decimal.
  readonly trxReserve: string;
}

// SUNBOOST farm for the SunSwap pool LP token.
export interface SunPumpFarmRecord {
  // Mining contract address.
  readonly address: string;
  // Decimal fraction: "0.16293617" means about 16.29%.
  readonly apy: string;
}

// Empty links are omitted; twitter may be a handle.
export interface SunPumpLinksRecord {
  readonly logo?: string;
  readonly twitter?: string;
  readonly telegram?: string;
  readonly website?: string;
}

// Description and links are untrusted creator data; text rendering must strip terminal controls.
export interface SunPumpTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  // Token base units.
  readonly totalSupply: string;
  // Indexer issue state (CREATED/LAUNCHED), not on-chain trading state.
  readonly status: string;
  // Creator address.
  readonly owner: string;
  readonly market: SunPumpMarketRecord;
  readonly curve: SunPumpCurveRecord;
  // SunSwap V2 pool receiving liquidity at launch; absent before launch.
  readonly swapPoolAddress?: string;
  // Absent when no farm exists and on search results.
  readonly farm?: SunPumpFarmRecord;
  // UTC minute, YYYY-MM-DD HH:mm.
  readonly createdAt: string;
  // UTC minute; absent before launch.
  readonly launchedAt?: string;
  readonly createTxHash: string;
  readonly launchTxHash?: string;
  readonly description: string;
  readonly links: SunPumpLinksRecord;
  // Exchange to trading-page URL; detail only, with empty entries/maps omitted.
  readonly listOn?: Readonly<Record<string, string>>;
}

// No total is exposed: service totals can be zero even for nonempty results.
export interface SunPumpTokenPage {
  readonly tokens: readonly SunPumpTokenRecord[];
}

// 1-based pages.
export interface SunPumpPageWindow {
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface SunPumpListQuery extends SunPumpPageWindow {
  readonly contractAddress?: string;
  // <field>:<DIRECTION>, already validated; always sent.
  readonly sort: string;
}

export interface SunPumpOwnerQuery extends SunPumpPageWindow {
  readonly owner: string;
}

export interface SunPumpSearchQuery extends SunPumpPageWindow {
  // Must be nonempty; an empty keyword removes the API filter.
  readonly keyword: string;
  readonly sort: string;
  // Only tokens listed on SunSwap.
  readonly onSunSwap?: boolean;
  readonly twitterLaunch?: boolean;
  readonly sunAgentLaunch?: boolean;
}

export interface SunPumpMarketDataPort {
  // Use tokensByOwner for creator filtering; the catalogue endpoint ignores ownerAddress.
  listTokens(
    network: NetworkDescriptor,
    query: SunPumpListQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage>;

  // Fixed tokenCreatedInstant:DESC order; the endpoint ignores sort.
  tokensByOwner(
    network: NetworkDescriptor,
    query: SunPumpOwnerQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage>;

  getToken(
    network: NetworkDescriptor,
    address: string,
    check: DispatchCheck,
  ): Promise<SunPumpTokenRecord | null>;

  // Symbol/name substring or exact contract address.
  searchTokens(
    network: NetworkDescriptor,
    query: SunPumpSearchQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage>;
}
