import { requestDispatchCheck } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { SunPumpMarketDataPort, SunPumpTokenRecord } from "../../ports/sunpump/market-data.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { TronAddress } from "../../../domain/address/index.js";
import { sunpumpSortParam } from "../../../domain/sunpump/market.js";
import { offsetWindowToPage } from "../../../domain/sunswap/pagination.js";

const ADDRESS = new TronAddress();

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

// Upstream totals can be zero for nonempty pages, so publish an unknown total.
export interface SunPumpTokenListView {
  readonly tokens: readonly SunPumpTokenRecord[];
  readonly pagination: { offset: number; limit: number; total: null };
  readonly query: { orderBy: string; sort: string };
}

export interface SunPumpTokenInfoView {
  readonly token: SunPumpTokenRecord;
}

export class SunPumpMarketQueryService {
  constructor(private readonly market: SunPumpMarketDataPort) {}

  // Endpoints cannot combine owner and contract filters; intersect them locally.
  async tokenList(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    query: SunPumpTokenListQuery,
  ): Promise<SunPumpTokenListView> {
    const page = offsetWindowToPage(query);
    const sort = sunpumpSortParam(query.orderBy, query.sort);
    const owner = query.owner === undefined ? undefined : this.#validAddress(query.owner);
    const contract = query.contract === undefined ? undefined : this.#validAddress(query.contract);
    const result =
      owner !== undefined && contract === undefined
        ? await this.market.tokensByOwner(
            network,
            { owner, ...page },
            requestDispatchCheck(deadline),
          )
        : await this.market.listTokens(
            network,
            {
              sort,
              ...(contract === undefined ? {} : { contractAddress: contract }),
              ...page,
            },
            requestDispatchCheck(deadline),
          );
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
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    query: SunPumpTokenSearchQuery,
  ): Promise<SunPumpTokenListView> {
    const page = offsetWindowToPage(query);
    const result = await this.market.searchTokens(
      network,
      {
        // An empty keyword would return the whole catalogue.
        keyword: this.#searchKeyword(query.keyword),
        sort: sunpumpSortParam(query.orderBy, query.sort),
        ...(query.onSunSwap ? { onSunSwap: true } : {}),
        ...(query.twitterLaunch ? { twitterLaunch: true } : {}),
        ...(query.sunAgentLaunch ? { sunAgentLaunch: true } : {}),
        ...page,
      },
      requestDispatchCheck(deadline),
    );
    return {
      tokens: result.tokens,
      pagination: this.#window(query),
      query: { orderBy: query.orderBy, sort: query.sort },
    };
  }

  // An unknown token can return HTTP 200; absence determines not-found.
  async tokenInfo(
    deadline: ExecutionDeadline,
    network: NetworkDescriptor,
    address: string,
  ): Promise<SunPumpTokenInfoView> {
    const token = await this.market.getToken(
      network,
      this.#validAddress(address),
      requestDispatchCheck(deadline),
    );
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
