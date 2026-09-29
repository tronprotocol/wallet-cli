/**
 * SunSwap market queries — the meaning above the adapter's shapes.
 *
 * Symbol resolution, input validation, enrichment and the rules about what a partial failure
 * should do all live here. The adapter below knows how to ask the service; this knows what the
 * answer has to be before a person can act on it.
 */
import type { NetworkDescriptor, NetworkId } from "../../../../domain/types/index.js";
import type {
  MarketDataPort,
  PositionRecord,
  PoolRecord,
  PoolView,
  PriceRecord,
  TokenRecord,
} from "../../../ports/sunswap/market-data.js";
import type { TokenRepository } from "../../../ports/token-repository.js";
import { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { TronAddress } from "../../../../domain/address/index.js";
import {
  isPoolId,
  normalisePoolId,
  normaliseProtocol,
  SUNSWAP_PROTOCOL_FILTERS,
} from "../../../../domain/sunswap/protocol.js";
import { pairPrices } from "../../../../domain/sunswap/pair-price.js";
import { offsetWindowToPage } from "../../../../domain/sunswap/pagination.js";
import { poolSortField, tokenSortField } from "../../../../domain/sunswap/sort.js";

const ADDRESS = new TronAddress();

export interface PriceQuery {
  /** a token SYMBOL, resolved locally; mutually exclusive with `addresses`. */
  readonly token?: string;
  /** contract addresses exactly as typed, before validation or deduplication. */
  readonly addresses?: readonly string[];
}

/** the offset window every list command takes, before it is translated to the service's paging. */
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

/**
 * A page of tokens plus the window that produced it.
 *
 * `total` is null because the service does not count: obtaining one would mean fetching every
 * record. A caller pages until a page comes back shorter than the limit.
 */
export interface TokenListView {
  readonly tokens: readonly TokenRecord[];
  readonly pagination: { offset: number; limit: number; total: null; hasMore?: boolean };
  /** what the rows were ordered by, echoed so a caller need not re-derive it; list only. */
  readonly query?: { orderBy: string; sort: string };
}

export interface PositionListQuery extends ListWindow {
  /** the address to look up; never defaulted to an active account — this command takes none. */
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
  /** a token SYMBOL or contract address; resolved locally before it reaches the service. */
  readonly token?: string;
  readonly protocol?: string;
  readonly orderBy: string;
  readonly sort: string;
}

export interface PoolSearchQuery extends ListWindow {
  readonly keyword: string;
  readonly protocol?: string;
}

export interface PoolListView {
  readonly pools: readonly PoolView[];
  readonly pagination: { offset: number; limit: number; total: number | null; hasMore?: boolean };
  readonly query?: { orderBy: string; sort: string };
  /**
   * Text-mode scaffolding, stripped before the JSON envelope is written.
   *
   * The price column needs a heading naming the token it quotes in, but PM 7.3.4's json payload
   * is `pools` and nothing else — a caller reads the quote token off `pairPrices[].quote`, which
   * is an address rather than a symbol that proves nothing.
   */
  readonly view?: { quoteSymbol: string };
}

export interface PriceView {
  readonly prices: readonly PriceRecord[];
  /** catalogue symbol per address, for display beside it; absent when unknown. */
  readonly symbols: ReadonlyMap<string, string>;
  /** non-fatal problems worth telling the caller about, in `meta.warnings`. */
  readonly warnings: readonly string[];
}

export class SunSwapMarketQueryService {
  /**
   * `aliases` is the resolved config's alias book, injected for one reason: a refusal names the
   * network the way the caller types it ("on tron"), not by canonical id. Same book and same
   * reasoning as the capability gate's message.
   */
  constructor(
    private readonly market: MarketDataPort,
    private readonly tokens: TokenRepository,
    private readonly aliases: Record<string, NetworkId> = {},
    /** The shared symbol resolver. Defaulted from the two arguments above so every existing
     *  caller keeps working; the liquidity service takes the same instance, so there is exactly
     *  one implementation of the rule on both paths. */
    private readonly resolver: SunSwapTokenResolver = new SunSwapTokenResolver(tokens, aliases),
  ) {}

  async prices(network: NetworkDescriptor, query: PriceQuery): Promise<PriceView> {
    const addresses = this.#resolveAddresses(network, query);
    const prices = await this.market.prices(network, addresses);
    const quoted = prices.map((price) => price.address);
    // The symbol column is decoration. Losing it must not lose the prices the caller asked for,
    // so its failure becomes a warning and the command still succeeds.
    let symbols: ReadonlyMap<string, string> = new Map();
    const warnings: string[] = [];
    try {
      symbols = await this.market.symbols(network, quoted);
    } catch {
      warnings.push("token symbols are unavailable; the Symbol column is shown as —");
    }
    return { prices, symbols, warnings };
  }

  /**
   * Positions held by one address.
   *
   * The server sorts by LP value descending and takes no ordering parameter, so there is no
   * `meta.query` to echo. `--owner` is required by the schema rather than defaulted here: a
   * listing that silently answered about whichever account happened to be active would be a
   * different question from the one asked, and this command takes no account at all.
   */
  async positionList(
    network: NetworkDescriptor,
    query: PositionListQuery,
  ): Promise<PositionListView> {
    const page = offsetWindowToPage(query);
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

  async poolList(network: NetworkDescriptor, query: PoolListQuery): Promise<PoolListView> {
    const page = offsetWindowToPage(query);
    const quote = query.token === undefined ? undefined : this.#resolveToken(network, query.token);
    const result = await this.market.listPools(network, {
      sort: poolSortField(query.orderBy),
      desc: this.#descending(query.sort),
      ...(query.pool === undefined ? {} : { pool: this.#resolvePool(query.pool) }),
      ...(quote === undefined ? {} : { token: quote }),
      ...(query.protocol === undefined
        ? {}
        : { protocol: normaliseProtocol(query.protocol, SUNSWAP_PROTOCOL_FILTERS) }),
      ...page,
    });
    return {
      pools: result.pools.map((pool) => this.#poolView(pool, quote)),
      pagination: this.#window(query, result.hasMore),
      query: { orderBy: query.orderBy, sort: query.sort },
      ...(query.token === undefined ? {} : { view: { quoteSymbol: query.token } }),
    };
  }

  /**
   * Search is fixed at TVL descending and takes no ordering flag, so it reports no `meta.query`.
   * It is the one listing with a real total, and the count is asked under the SAME filters as
   * the page — a total taken under different ones would describe a different set of pools.
   */
  async poolSearch(network: NetworkDescriptor, query: PoolSearchQuery): Promise<PoolListView> {
    const keyword = this.#searchKeyword(query.keyword);
    const page = offsetWindowToPage(query);
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

  /**
   * Drop the service's raw rates and, when a quote token was chosen, replace them with prices
   * expressed in it. Stripping happens HERE for both listings so the orientation detail cannot
   * leak into the payload by whichever path a caller takes.
   */
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

  /** a pool contract address, or a V4 pool id with the 0x prefix the service will not accept. */
  #resolvePool(value: string): string {
    return isPoolId(value) ? normalisePoolId(value) : value;
  }

  /** `--token` takes a symbol or an address; a symbol resolves the same way `price` resolves one. */
  #resolveToken(network: NetworkDescriptor, value: string): string {
    const trimmed = value.trim();
    return ADDRESS.validate(trimmed) ? trimmed : this.#resolveSymbol(network, trimmed);
  }

  #descending(sort: string): boolean {
    if (sort === "desc") return true;
    if (sort === "asc") return false;
    throw new UsageError("invalid_value", "--sort must be one of asc, desc");
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
    const result = await this.market.listTokens(network, {
      protocol: normaliseProtocol(query.protocol),
      sort: tokenSortField(query.orderBy),
      ...(query.address === undefined ? {} : { address: this.#validAddress(query.address) }),
      ...page,
    });
    return {
      tokens: result.tokens,
      pagination: this.#window(query, result.hasMore),
      // The service sorts descending and offers no direction parameter, so `sort` is reported as
      // the constant it is rather than as a choice the caller could have made.
      query: { orderBy: query.orderBy, sort: "desc" },
    };
  }

  /**
   * Search has no sort flag, so it reports no `meta.query`: echoing an ordering nobody chose
   * would read as one they could change.
   */
  async tokenSearch(network: NetworkDescriptor, query: TokenSearchQuery): Promise<TokenListView> {
    // An empty keyword reaches the service as "no filter" and returns the whole catalogue,
    // which is a different question from the one that was asked.
    const keyword = this.#searchKeyword(query.keyword);
    const page = offsetWindowToPage(query);
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

  /**
   * Exactly one of the symbol or the address list, per PM 8.3.
   *
   * Taking one silently when both are given would answer a question the caller did not ask: they
   * would read a price believing it came from the symbol they typed.
   */
  #resolveAddresses(network: NetworkDescriptor, query: PriceQuery): string[] {
    const listed = (query.addresses ?? []).filter((value) => value.trim() !== "");
    const symbol = query.token?.trim() ?? "";
    if (symbol !== "" && listed.length > 0) {
      throw new UsageError("invalid_option", "give either a token symbol or --address, not both");
    }
    if (symbol === "" && listed.length === 0) {
      throw new UsageError(
        "missing_option",
        "this command requires a token symbol or --address <addresses>",
      );
    }
    if (symbol !== "") return [this.#resolveSymbol(network, symbol)];
    for (const address of listed) this.#validAddress(address);
    return [...new Set(listed)];
  }

  #resolveSymbol(network: NetworkDescriptor, symbol: string): string {
    return this.resolver.resolveSymbol(network, symbol);
  }
}
