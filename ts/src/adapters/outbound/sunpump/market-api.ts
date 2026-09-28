/**
 * SunPumpMarketDataPort over `@sun-protocol/sun-sdk-api`'s `SunPumpApiClient`.
 *
 * The SDK owns the paths and nothing else: every method returns `Promise<unknown>` and the query
 * type is an open record, so this file owns which host was asked, which parameters exist, how the
 * body was parsed and what the caller gets. The transport itself — base URL, lossless parsing,
 * timeout, envelope and error translation — is `./api-transport.js`, shared with the create call.
 *
 * 🔴 The parameter names below are pinned, not guessed. This service ignores an unknown
 * parameter and answers 200 with an UNFILTERED list: `keyword`, `symbol`, `name` and `search` all
 * return the whole catalogue instead of a search, and an unknown `sort` field returns
 * `marketCap` order while echoing the string it was sent. A misspelling here is not an error, it
 * is a different question answered confidently — so the names are `query`, `address`,
 * `contractAddress`, `onSunSwap`, `filterTwitterLaunch`, `filterSunAgentLaunch`, `page`, `size`
 * and `sort`, each verified against live responses that would differ if it were ignored.
 */
import type { SunPumpApiClient } from "@sun-protocol/sun-sdk-api";
import type { NetworkDescriptor } from "../../../domain/types/network.js";
import type {
  SunPumpListQuery,
  SunPumpMarketDataPort,
  SunPumpOwnerQuery,
  SunPumpSearchQuery,
  SunPumpTokenPage,
  SunPumpTokenRecord,
} from "../../../application/ports/sunpump/market-data.js";
import { isTokenRow, mapToken } from "./market-api.mapper.js";
import { rawTokenSchema, tokensResponseSchema } from "./market-api.schema.js";
import { parseSunPumpShape, sunpumpRequest, type SunPumpApiDeps } from "./api-transport.js";

/** the injection seams, under the name this adapter has always exported them. */
export type SunPumpMarketApiDeps = SunPumpApiDeps;
export type { SunPumpApiClientFactory } from "./api-transport.js";

export class SunPumpMarketApi implements SunPumpMarketDataPort {
  constructor(
    private readonly timeoutMs: number,
    private readonly deps: SunPumpMarketApiDeps = {},
  ) {}

  async listTokens(network: NetworkDescriptor, query: SunPumpListQuery): Promise<SunPumpTokenPage> {
    return this.tokenPage(network, (client) =>
      client.listTokens({
        page: query.pageNo,
        size: query.pageSize,
        // Always sent. Asked without one, `/token` answers `marketCap:DESC`, which is a
        // different listing from the "newest first" this CLI's default promises.
        sort: query.sort,
        ...(query.contractAddress === undefined ? {} : { contractAddress: query.contractAddress }),
      }),
    );
  }

  /**
   * `/token/search/by_owner`, whose creator parameter is `address` — NOT `ownerAddress`, which
   * this endpoint rejects outright and which `/token` accepts and then ignores.
   *
   * No `sort` is sent: the endpoint answers `tokenCreatedInstant:DESC` whatever it is given, and
   * a parameter that is dropped on the floor should not be in the request.
   */
  async tokensByOwner(
    network: NetworkDescriptor,
    query: SunPumpOwnerQuery,
  ): Promise<SunPumpTokenPage> {
    return this.tokenPage(network, (client) =>
      client.tokensByOwner({ address: query.owner, page: query.pageNo, size: query.pageSize }),
    );
  }

  /**
   * `/token/searchV2` — always, never `/token/search`.
   *
   * The two endpoints take the same parameters and apply different default orderings, so
   * switching between them by whether a filter was given would change the ranking as a
   * side-effect of an unrelated flag.
   */
  async searchTokens(
    network: NetworkDescriptor,
    query: SunPumpSearchQuery,
  ): Promise<SunPumpTokenPage> {
    return this.tokenPage(network, (client) =>
      client.searchTokensV2({
        query: query.keyword,
        page: query.pageNo,
        size: query.pageSize,
        sort: query.sort,
        // Only sent when true. `false` is not "no filter" to every service, and asking for the
        // unfiltered set by leaving the parameter out is the form verified here.
        ...(query.onSunSwap === true ? { onSunSwap: true } : {}),
        ...(query.twitterLaunch === true ? { filterTwitterLaunch: true } : {}),
        ...(query.sunAgentLaunch === true ? { filterSunAgentLaunch: true } : {}),
      }),
    );
  }

  async getToken(network: NetworkDescriptor, address: string): Promise<SunPumpTokenRecord | null> {
    const payload = await this.request(network, (client) => client.getToken(address));
    if (payload === null || payload === undefined) return null;
    const parsed = parseSunPumpShape(rawTokenSchema, payload);
    return isTokenRow(parsed) ? mapToken(parsed) : null;
  }

  /** every listing endpoint answers with the same `{ tokens: [...] }` body, so they share a reader. */
  private async tokenPage(
    network: NetworkDescriptor,
    call: (client: SunPumpApiClient) => Promise<unknown>,
  ): Promise<SunPumpTokenPage> {
    const parsed = parseSunPumpShape(
      tokensResponseSchema,
      (await this.request(network, call)) ?? {},
    );
    // `metadata.total` is NOT read: it is 0 on every endpoint, including responses that returned
    // tokens, so there is no page count to publish and none is inferred from a full page either.
    return { tokens: parsed.tokens.filter(isTokenRow).map(mapToken) };
  }

  private async request(
    network: NetworkDescriptor,
    call: (client: SunPumpApiClient) => Promise<unknown>,
  ): Promise<unknown> {
    return sunpumpRequest(network, this.timeoutMs, this.deps, call);
  }
}
