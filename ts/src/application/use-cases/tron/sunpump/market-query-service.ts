/**
 * SunPump catalogue queries — the meaning above the adapter's shapes.
 *
 * Which endpoint answers which question, what an address has to be before it is sent, how an
 * offset window becomes a page, and what "not found" means all live here. The adapter below
 * knows how to ask; this knows what the answer has to be before a person can act on it.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type {
  SunPumpMarketDataPort,
  SunPumpTokenRecord,
} from "../../../ports/sunpump/market-data.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";
import { TronAddress } from "../../../../domain/address/index.js";
import { sunpumpSortParam } from "../../../../domain/sunpump/market.js";
// The offset→page translation is the CLI's, not SunSwap's: both services page by 1-based page
// number and size, and both commands take --limit/--offset, so the rule and its refusal are the
// same one. A second copy would be a second place for it to drift.
import { offsetWindowToPage } from "../../../../domain/sunswap/pagination.js";

const ADDRESS = new TronAddress();

/** the offset window every SunPump listing takes, before the service's paging is derived. */
export interface SunPumpListWindow {
  readonly limit: number;
  readonly offset: number;
}

export interface SunPumpTokenListQuery extends SunPumpListWindow {
  readonly contract?: string;
  readonly owner?: string;
  readonly orderBy: string;
  readonly sort: string;
}

export interface SunPumpTokenSearchQuery extends SunPumpListWindow {
  readonly keyword: string;
  readonly orderBy: string;
  readonly sort: string;
  readonly onSunSwap: boolean;
  readonly twitterLaunch: boolean;
  readonly sunAgentLaunch: boolean;
}

/**
 * A page of tokens plus the window that produced it.
 *
 * `total` is always null, on every one of these listings. The service's own `metadata.total` is
 * 0 even in responses that returned tokens, so there is nothing to publish — and publishing the
 * zero would tell a caller who is paging that their query matched nothing.
 */
export interface SunPumpTokenListView {
  readonly tokens: readonly SunPumpTokenRecord[];
  readonly pagination: { offset: number; limit: number; total: null };
  /** the ordering actually applied, echoed so a caller need not re-derive it. */
  readonly query: { orderBy: string; sort: string };
}

export interface SunPumpTokenInfoView {
  readonly token: SunPumpTokenRecord;
}

export class SunPumpMarketQueryService {
  constructor(private readonly market: SunPumpMarketDataPort) {}

  /**
   * The catalogue, by contract, by creator, or neither.
   *
   * Three routes, because one endpoint cannot serve all three questions. `/token` filters by
   * contract but IGNORES a creator parameter and returns the whole catalogue with a 200;
   * `/token/search/by_owner` filters by creator but ignores a contract. Asking for both
   * therefore takes the contract route and drops any row whose creator is someone else — the
   * intersection PM 9.1.3 asks for, computed where the service will not compute it.
   */
  async tokenList(
    network: NetworkDescriptor,
    query: SunPumpTokenListQuery,
  ): Promise<SunPumpTokenListView> {
    const page = offsetWindowToPage(query);
    const sort = sunpumpSortParam(query.orderBy, query.sort);
    const owner = query.owner === undefined ? undefined : this.#validAddress(query.owner);
    const contract = query.contract === undefined ? undefined : this.#validAddress(query.contract);
    const result =
      owner !== undefined && contract === undefined
        ? await this.market.tokensByOwner(network, { owner, ...page })
        : await this.market.listTokens(network, {
            sort,
            ...(contract === undefined ? {} : { contractAddress: contract }),
            ...page,
          });
    const tokens =
      owner !== undefined && contract !== undefined
        ? result.tokens.filter((token) => token.owner === owner)
        : result.tokens;
    return {
      tokens,
      pagination: this.#window(query),
      query: { orderBy: query.orderBy, sort: query.sort },
    };
  }

  async tokenSearch(
    network: NetworkDescriptor,
    query: SunPumpTokenSearchQuery,
  ): Promise<SunPumpTokenListView> {
    const page = offsetWindowToPage(query);
    const result = await this.market.searchTokens(network, {
      // Already refused at parse time; kept because an empty keyword reaches the service as "no
      // filter" and comes back as the whole catalogue with a 200, which looks like a real answer.
      keyword: this.#searchKeyword(query.keyword),
      sort: sunpumpSortParam(query.orderBy, query.sort),
      ...(query.onSunSwap ? { onSunSwap: true } : {}),
      ...(query.twitterLaunch ? { twitterLaunch: true } : {}),
      ...(query.sunAgentLaunch ? { sunAgentLaunch: true } : {}),
      ...page,
    });
    return {
      tokens: result.tokens,
      pagination: this.#window(query),
      query: { orderBy: query.orderBy, sort: query.sort },
    };
  }

  /**
   * One token's detail.
   *
   * An address the launchpad has never seen is answered with HTTP 200, `code: 0` and no token,
   * so "not found" has to be decided here rather than read off a status. Returning that as a
   * success would publish a token object whose every field is null.
   */
  async tokenInfo(network: NetworkDescriptor, address: string): Promise<SunPumpTokenInfoView> {
    const token = await this.market.getToken(network, this.#validAddress(address));
    if (token === null) {
      throw new ChainError(
        "launchpad_token_not_found",
        `${address} is not a SunPump token on this network`,
      );
    }
    return { token };
  }

  #window(window: SunPumpListWindow) {
    return { offset: window.offset, limit: window.limit, total: null } as const;
  }

  #searchKeyword(value: string): string {
    const keyword = value.trim();
    if (keyword === "") {
      throw new UsageError("invalid_value", "the search keyword must not be empty");
    }
    return keyword;
  }

  #validAddress(address: string): string {
    const trimmed = address.trim();
    if (!ADDRESS.validate(trimmed)) {
      throw new UsageError("invalid_address", `not a valid TRON address: ${address}`);
    }
    return trimmed;
  }
}
