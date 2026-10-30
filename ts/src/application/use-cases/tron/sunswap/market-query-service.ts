import type { NetworkDescriptor, NetworkId } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type {
  ListPoolsQuery,
  MarketDataPort,
  PositionRecord,
  PoolRecord,
  PoolView,
  PriceRecord,
  TokenRecord,
} from "../../../ports/sunswap/market-data.js";
import type { TokenRepository } from "../../../ports/token-repository.js";
import { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { errorMessage, inputRef, UsageError } from "../../../../domain/errors/index.js";
import { TronAddress } from "../../../../domain/address/index.js";
import {
  isPoolId,
  normalisePoolId,
  normaliseProtocol,
  SUNSWAP_PROTOCOL_FILTERS,
} from "../../../../domain/sunswap/protocol.js";
import { pairPrices } from "../../../../domain/sunswap/pair-price.js";
import {
  offsetWindowToPage,
  refuseBeyondMarketWindow,
  SUNSWAP_MARKET_WINDOW,
} from "../../../../domain/sunswap/pagination.js";
import {
  POOL_ORDER_BY,
  poolSortField,
  tokenSortField,
  type PoolOrderBy,
} from "../../../../domain/sunswap/sort.js";
import { isSignedDecimal } from "../../../../domain/sunswap/decimal.js";
import {
  isNoThreshold,
  meetsMinTvl,
  parseMinTvl,
  sortPoolsBy,
} from "../../../../domain/sunswap/min-tvl.js";

const ADDRESS = new TronAddress();

type WarnScope = Pick<TransactionScope, "warn">;

const SCAN_PAGE_SIZE = 100;

type PoolSortField = (typeof POOL_ORDER_BY)[PoolOrderBy];

interface PoolScan {
  readonly qualifying: readonly PoolRecord[];
  // Exhausted the service or reached a below-threshold pool in descending TVL order.
  readonly complete: boolean;
}

export interface PriceQuery {
  // Local token symbol; mutually exclusive with addresses.
  readonly token?: string;
  // Unvalidated, potentially duplicate contract addresses.
  readonly addresses?: readonly string[];
}

export interface ListWindow {
  readonly limit: number;
  readonly offset: number;
}

export interface TokenListQuery extends ListWindow {
  readonly address?: string;
  readonly protocol: string;
  readonly orderBy: string;
}

export interface TokenSearchQuery extends ListWindow {
  readonly keyword: string;
  readonly protocol: string;
}

// The service provides no token count, so pagination.total is null.
export interface TokenListView {
  readonly tokens: readonly TokenRecord[];
  readonly pagination: { offset: number; limit: number; total: null; hasMore?: boolean };
  readonly query?: { orderBy: string; sort: string };
}

export interface PositionListQuery extends ListWindow {
  // Address supplied by the caller; this service does not resolve an account.
  readonly owner: string;
  readonly pool?: string;
  readonly protocol?: string;
}

export interface PositionListView {
  readonly positions: readonly PositionRecord[];
  readonly pagination: { offset: number; limit: number; total: null; hasMore?: boolean };
}

export interface PoolListQuery extends ListWindow {
  readonly pool?: string;
  // Local token symbol or contract address.
  readonly token?: string;
  readonly protocol?: string;
  readonly orderBy: string;
  readonly sort: string;
  // Minimum reserveUsd, applied before pagination.
  readonly minTvl?: string;
}

export interface PoolSearchQuery extends ListWindow {
  readonly keyword: string;
  readonly protocol?: string;
}

export interface PoolListView {
  readonly pools: readonly PoolView[];
  readonly pagination: { offset: number; limit: number; total: number | null; hasMore?: boolean };
  readonly query?: { orderBy: string; sort: string };
  // Text-only heading metadata; omitted from the JSON envelope.
  readonly view?: { quoteSymbol: string };
}

export interface PriceView {
  readonly prices: readonly PriceRecord[];
  readonly symbols: ReadonlyMap<string, string>;
  readonly warnings: readonly string[];
}

export class SunSwapMarketQueryService {
  constructor(
    private readonly market: MarketDataPort,
    private readonly tokens: TokenRepository,
    private readonly aliases: Record<string, NetworkId> = {},
    private readonly resolver: SunSwapTokenResolver = new SunSwapTokenResolver(tokens, aliases),
  ) {}

  async prices(network: NetworkDescriptor, query: PriceQuery): Promise<PriceView> {
    const addresses = this.#resolveAddresses(network, query);
    const prices = await this.market.prices(network, addresses);
    const quoted = prices.map((price) => price.address);
    // Missing symbols must not hide available prices.
    let symbols: ReadonlyMap<string, string> = new Map();
    const warnings: string[] = [];
    try {
      symbols = await this.market.symbols(network, quoted);
    } catch {
      warnings.push("token symbols are unavailable; the Symbol column is shown as —");
    }
    return { prices, symbols, warnings };
  }

  async positionList(
    network: NetworkDescriptor,
    query: PositionListQuery,
  ): Promise<PositionListView> {
    const page = offsetWindowToPage(query);
    refuseBeyondMarketWindow(query);
    const result = await this.market.listPositions(network, {
      owner: this.#validAddress(query.owner),
      ...(query.pool === undefined ? {} : { pool: this.#resolvePool(query.pool) }),
      ...(query.protocol === undefined
        ? {}
        : { protocol: normaliseProtocol(query.protocol, SUNSWAP_PROTOCOL_FILTERS) }),
      ...page,
    });
    return { positions: result.positions, pagination: this.#window(query, result.hasMore) };
  }

  async poolList(
    scope: WarnScope,
    network: NetworkDescriptor,
    query: PoolListQuery,
  ): Promise<PoolListView> {
    const page = offsetWindowToPage(query);
    refuseBeyondMarketWindow(query);
    const sort = poolSortField(query.orderBy);
    const desc = this.#descending(query.sort);
    const minTvl = query.minTvl === undefined ? undefined : parseMinTvl(query.minTvl);
    const quote = query.token === undefined ? undefined : this.#resolveToken(network, query.token);
    const filters = {
      ...(query.pool === undefined ? {} : { pool: this.#resolvePool(query.pool) }),
      ...(quote === undefined ? {} : { token: quote }),
      ...(query.protocol === undefined
        ? {}
        : { protocol: normaliseProtocol(query.protocol, SUNSWAP_PROTOCOL_FILTERS) }),
    };
    const shown = (pools: readonly PoolRecord[], hasMore: boolean | undefined): PoolListView => ({
      pools: pools.map((pool) => this.#poolView(pool, quote)),
      pagination: this.#window(query, hasMore),
      query: { orderBy: query.orderBy, sort: query.sort },
      ...(query.token === undefined ? {} : { view: { quoteSymbol: query.token } }),
    });
    if (minTvl === undefined || isNoThreshold(minTvl)) {
      const result = await this.market.listPools(network, { sort, desc, ...filters, ...page });
      return shown(result.pools, result.hasMore);
    }
    const found = await this.#qualifyingPools(network, { sort, desc, ...filters }, minTvl, query);
    const end = query.offset + query.limit;
    // A full window is exact even if later qualifying rows are unreachable.
    if (!found.complete && found.pools.length < end) {
      scope.warn({
        code: "sunswap_scan_truncated",
        message: errorMessage`only the first ${SUNSWAP_MARKET_WINDOW} pools of this ordering could be scanned, and more than ${SUNSWAP_MARKET_WINDOW} pools meet ${inputRef("minTvl")}, so this list may be incomplete`,
      });
    }
    return shown(found.pools.slice(query.offset, end), !found.complete || found.pools.length > end);
  }

  // The API caps each ordering at 1,000 rows; retry by TVL to recover a complete qualifying set.
  async #qualifyingPools(
    network: NetworkDescriptor,
    query: Omit<ListPoolsQuery, "pageNo" | "pageSize">,
    minTvl: string,
    window: ListWindow,
  ): Promise<{ pools: readonly PoolRecord[]; complete: boolean }> {
    // Read one extra row to determine hasMore.
    const wanted = window.offset + window.limit + 1;
    const byTvl = { ...query, sort: poolSortField("tvl"), desc: true };
    if (query.sort === byTvl.sort && query.desc) {
      const scan = await this.#scanPools(network, byTvl, minTvl, wanted, true);
      return {
        pools: scan.qualifying,
        complete: scan.complete || scan.qualifying.length >= wanted,
      };
    }
    const first = await this.#scanPools(network, query, minTvl, wanted, false);
    if (first.complete || first.qualifying.length >= wanted) {
      return { pools: first.qualifying, complete: true };
    }
    const all = await this.#scanPools(network, byTvl, minTvl, Infinity, true);
    if (!all.complete) return { pools: first.qualifying, complete: false };
    const value = POOL_SORT_VALUE[query.sort as PoolSortField];
    return { pools: sortPoolsBy(all.qualifying, value, query.desc), complete: true };
  }

  // stopBelow is valid only for descending TVL order.
  async #scanPools(
    network: NetworkDescriptor,
    query: Omit<ListPoolsQuery, "pageNo" | "pageSize">,
    minTvl: string,
    wanted: number,
    stopBelow: boolean,
  ): Promise<PoolScan> {
    const qualifying: PoolRecord[] = [];
    for (let pageNo = 1; pageNo * SCAN_PAGE_SIZE <= SUNSWAP_MARKET_WINDOW; pageNo += 1) {
      const result = await this.market.listPools(network, {
        ...query,
        pageNo,
        pageSize: SCAN_PAGE_SIZE,
      });
      for (const pool of result.pools) {
        if (meetsMinTvl(pool.reserveUsd, minTvl)) {
          qualifying.push(pool);
        } else if (stopBelow && isBelow(pool.reserveUsd, minTvl)) {
          return { qualifying, complete: true };
        }
      }
      if (result.hasMore === false || result.pools.length < SCAN_PAGE_SIZE) {
        return { qualifying, complete: true };
      }
      if (qualifying.length >= wanted) break;
    }
    return { qualifying, complete: false };
  }

  // Count and page must use identical filters.
  async poolSearch(network: NetworkDescriptor, query: PoolSearchQuery): Promise<PoolListView> {
    const keyword = this.#searchKeyword(query.keyword);
    const page = offsetWindowToPage(query);
    refuseBeyondMarketWindow(query);
    const filters = {
      keyword,
      ...(query.protocol === undefined
        ? {}
        : { protocol: normaliseProtocol(query.protocol, SUNSWAP_PROTOCOL_FILTERS) }),
      ...page,
    };
    const [result, total] = await Promise.all([
      this.market.searchPools(network, filters),
      this.market.countPools(network, filters),
    ]);
    return {
      pools: result.pools.map((pool) => this.#poolView(pool)),
      pagination: { ...this.#window(query, result.hasMore), total },
    };
  }

  // Raw rates have ambiguous orientation; publish only prices oriented to the quote token.
  #poolView(pool: PoolRecord, quote?: string): PoolView {
    const { rates, ...rest } = pool;
    if (quote === undefined) return rest;
    return {
      ...rest,
      pairPrices: pairPrices(
        pool.tokens.map((token) => token.address),
        rates,
        quote,
      ),
    };
  }

  // The market API requires V4 pool ids without 0x.
  #resolvePool(value: string): string {
    return isPoolId(value) ? normalisePoolId(value) : value;
  }

  #resolveToken(network: NetworkDescriptor, value: string): string {
    const trimmed = value.trim();
    return ADDRESS.validate(trimmed) ? trimmed : this.#resolveSymbol(network, trimmed, "pool-list");
  }

  #descending(sort: string): boolean {
    if (sort === "desc") return true;
    if (sort === "asc") return false;
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("sort")} must be one of asc, desc`,
    );
  }

  #searchKeyword(value: string): string {
    const keyword = value.trim();
    if (keyword === "") {
      throw new UsageError("invalid_value", "the search keyword must not be empty");
    }
    return isPoolId(keyword) ? normalisePoolId(keyword) : keyword;
  }

  async tokenList(network: NetworkDescriptor, query: TokenListQuery): Promise<TokenListView> {
    const page = offsetWindowToPage(query);
    refuseBeyondMarketWindow(query);
    const result = await this.market.listTokens(network, {
      protocol: normaliseProtocol(query.protocol),
      sort: tokenSortField(query.orderBy),
      ...(query.address === undefined ? {} : { address: this.#validAddress(query.address) }),
      ...page,
    });
    return {
      tokens: result.tokens,
      pagination: this.#window(query, result.hasMore),
      // The service supports descending order only.
      query: { orderBy: query.orderBy, sort: "desc" },
    };
  }

  async tokenSearch(network: NetworkDescriptor, query: TokenSearchQuery): Promise<TokenListView> {
    // An empty keyword would request the whole catalogue.
    const keyword = this.#searchKeyword(query.keyword);
    const page = offsetWindowToPage(query);
    refuseBeyondMarketWindow(query);
    const result = await this.market.searchTokens(network, {
      keyword,
      protocol: normaliseProtocol(query.protocol),
      ...page,
    });
    return { tokens: result.tokens, pagination: this.#window(query, result.hasMore) };
  }

  #window(window: ListWindow, hasMore: boolean | undefined) {
    return {
      offset: window.offset,
      limit: window.limit,
      total: null,
      ...(hasMore === undefined ? {} : { hasMore }),
    };
  }

  #validAddress(address: string): string {
    if (!ADDRESS.validate(address)) {
      throw new UsageError("invalid_address", `not a valid TRON address: ${address}`);
    }
    return address;
  }

  #resolveAddresses(network: NetworkDescriptor, query: PriceQuery): string[] {
    const listed = (query.addresses ?? []).filter((value) => value.trim() !== "");
    const symbol = query.token?.trim() ?? "";
    if (symbol !== "" && listed.length > 0) {
      throw new UsageError(
        "invalid_option",
        errorMessage`give either a token symbol or ${inputRef("address")}, not both`,
      );
    }
    if (symbol === "" && listed.length === 0) {
      throw new UsageError(
        "missing_option",
        errorMessage`this command requires a token symbol or ${inputRef("address")} <addresses>`,
      );
    }
    if (symbol !== "") return [this.#resolveSymbol(network, symbol, "price")];
    for (const address of listed) this.#validAddress(address);
    return [...new Set(listed)];
  }

  // Official token layer only; no account-specific book.
  #resolveSymbol(
    network: NetworkDescriptor,
    symbol: string,
    caller: "price" | "pool-list",
  ): string {
    return this.resolver.resolveSymbol(network, symbol, { caller }).address;
  }
}

const POOL_SORT_VALUE: Record<PoolSortField, (pool: PoolRecord) => string> = {
  reserveUsd: (pool) => pool.reserveUsd,
  volumeUsd1d: (pool) => pool.volumeUsd1d,
  feeUsd1d: (pool) => pool.feeUsd1d,
  totalApr: (pool) => pool.totalApr,
};

// Missing TVL cannot prove that later pools are below the threshold.
function isBelow(reserveUsd: string, minTvl: string): boolean {
  return isSignedDecimal(reserveUsd) && !meetsMinTvl(reserveUsd, minTvl);
}
