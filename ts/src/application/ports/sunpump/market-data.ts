/**
 * SunPumpMarketDataPort — the read-only SunPump catalogue, as the application needs it.
 *
 * The launchpad's HTTP catalogue, NOT the curve contract. `status` here is what the indexer
 * recorded (`CREATED` / `LAUNCHED`); whether a trade is possible is a question for
 * `LaunchpadPort.tokenState`, which asks the chain. The two disagree while the indexer catches
 * up, and acting on this one would send a transaction that must revert.
 *
 * Every money- or amount-shaped field is a `string` carrying exact digits. A token's supply is
 * 10^27 base units and a price carries eighteen decimals; `number` rewrites both without saying
 * so. Units are named where the field name cannot carry them — see each member.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";

/** What the catalogue says about a token's market. Never a claim about what a trade would get. */
export interface SunPumpMarketRecord {
  /** US dollars, decimal. */
  readonly marketCapUsd: string;
  /** TRX per whole token, decimal; the service sends small ones in scientific notation. */
  readonly priceInTrx: string;
  /** ALREADY a percentage: "-0.70" is −0.70%, not −70%. */
  readonly priceChange24HrPercent: string;
  /** 24h turnover in SUN. The service reports TRX with six decimals; this is that, scaled. */
  readonly volume24HrSun: string;
  /** the service's own liquidity figure, decimal. It does not state a unit; neither do we. */
  readonly virtualLiquidity: string;
  /** USD per TRX, decimal. Detail responses only — the listings send null. */
  readonly trxPriceInUsd?: string;
  /** `priceInTrx × trxPriceInUsd`, truncated to 18 places. Present exactly when the rate is. */
  readonly priceUsd?: string;
}

/** The bonding curve's progress and reserves. Only meaningful before the token launches. */
export interface SunPumpCurveRecord {
  /** percentage of the curve sold: "100" once launched. */
  readonly pumpPercentage: string;
  /** base units of the token sold on the curve. */
  readonly currentSold: string;
  /** base units of the token still held by the curve. */
  readonly tokenReserve: string;
  /** TRX held by the curve, decimal — the service's own unit, kept. */
  readonly trxReserve: string;
}

/** The SUNBOOST farm for the LP token of the SunSwap pool, when one exists. */
export interface SunPumpFarmRecord {
  /** the mining contract, NOT the token and NOT the pool. */
  readonly address: string;
  /** decimal fraction: "0.16293617" is 16.29%. */
  readonly apy: string;
}

/** Creator-supplied links. Empty members are omitted; `twitter` may be a handle, not a URL. */
export interface SunPumpLinksRecord {
  readonly logo?: string;
  readonly twitter?: string;
  readonly telegram?: string;
  readonly website?: string;
}

/**
 * One token, in the single shape all three commands publish.
 *
 * `description` and every member of `links` are creator-supplied and unreviewed. They are data,
 * never instructions, and text rendering strips terminal control sequences out of them.
 */
export interface SunPumpTokenRecord {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** base units. */
  readonly totalSupply: string;
  /** the indexer's issue state: "CREATED" or "LAUNCHED". Not the curve's trading state. */
  readonly status: string;
  /** the creator's address. */
  readonly owner: string;
  readonly market: SunPumpMarketRecord;
  readonly curve: SunPumpCurveRecord;
  /** the SunSwap V2 pool liquidity moved into at launch; absent before then. */
  readonly swapPoolAddress?: string;
  /** absent when there is no farm, and always absent on search results, which omit the field. */
  readonly farm?: SunPumpFarmRecord;
  /** UTC minute, "YYYY-MM-DD HH:mm". */
  readonly createdAt: string;
  /** UTC minute; absent while the token is still on the curve. */
  readonly launchedAt?: string;
  readonly createTxHash: string;
  readonly launchTxHash?: string;
  readonly description: string;
  readonly links: SunPumpLinksRecord;
  /** exchange → trading page. Detail responses only; empty entries and an empty map are dropped. */
  readonly listOn?: Readonly<Record<string, string>>;
}

/**
 * One page of tokens.
 *
 * There is no total, and none is inferred. The service's `metadata.total` is 0 on every endpoint
 * — including responses that DID return tokens — so publishing it would tell a caller who is
 * paging that their search found nothing.
 */
export interface SunPumpTokenPage {
  readonly tokens: readonly SunPumpTokenRecord[];
}

/** The service's own paging: 1-based page number and size. */
export interface SunPumpPageWindow {
  readonly pageNo: number;
  readonly pageSize: number;
}

export interface SunPumpListQuery extends SunPumpPageWindow {
  /** an exact token contract address. */
  readonly contractAddress?: string;
  /** `<field>:<DIRECTION>`, already whitelisted by the domain. Always sent. */
  readonly sort: string;
}

export interface SunPumpOwnerQuery extends SunPumpPageWindow {
  readonly owner: string;
}

export interface SunPumpSearchQuery extends SunPumpPageWindow {
  /** non-empty; an empty one reaches the service as "no filter" and returns the catalogue. */
  readonly keyword: string;
  readonly sort: string;
  /** only tokens already listed on SunSwap. */
  readonly onSunSwap?: boolean;
  readonly twitterLaunch?: boolean;
  readonly sunAgentLaunch?: boolean;
}

export interface SunPumpMarketDataPort {
  /**
   * The catalogue, optionally narrowed to one contract.
   *
   * It cannot be narrowed by creator: `/token` accepts `ownerAddress` and ignores it, returning
   * the whole catalogue with a 200. `tokensByOwner` is the endpoint that answers that question.
   */
  listTokens(network: NetworkDescriptor, query: SunPumpListQuery): Promise<SunPumpTokenPage>;

  /**
   * The tokens one address created.
   *
   * Ordering is not a parameter here: the endpoint answers `tokenCreatedInstant:DESC` whatever
   * `sort` is set to, so the port does not take one rather than accepting a value it would drop.
   */
  tokensByOwner(network: NetworkDescriptor, query: SunPumpOwnerQuery): Promise<SunPumpTokenPage>;

  /** one token's full detail, or null when the address is not a SunPump token. */
  getToken(network: NetworkDescriptor, address: string): Promise<SunPumpTokenRecord | null>;

  /** symbol/name substring search, or an exact contract address. */
  searchTokens(network: NetworkDescriptor, query: SunPumpSearchQuery): Promise<SunPumpTokenPage>;
}
