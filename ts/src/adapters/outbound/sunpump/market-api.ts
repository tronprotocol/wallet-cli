// Use exact API parameter names: unknown names can silently return unfiltered results.
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
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

export type SunPumpMarketApiDeps = SunPumpApiDeps;
export type { SunPumpApiClientFactory } from "./api-transport.js";

export class SunPumpMarketApi implements SunPumpMarketDataPort {
  constructor(private readonly deps: SunPumpMarketApiDeps = {}) {}

  async listTokens(
    network: NetworkDescriptor,
    query: SunPumpListQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage> {
    return this.tokenPage(
      network,
      (client) =>
        client.listTokens({
          page: query.pageNo,
          size: query.pageSize,
          // Send sort explicitly; the service defaults to marketCap:DESC.
          sort: query.sort,
          ...(query.contractAddress === undefined
            ? {}
            : { contractAddress: query.contractAddress }),
        }),
      check,
    );
  }

  // The owner endpoint reads address and ignores sort.
  async tokensByOwner(
    network: NetworkDescriptor,
    query: SunPumpOwnerQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage> {
    return this.tokenPage(
      network,
      (client) =>
        client.tokensByOwner({ address: query.owner, page: query.pageNo, size: query.pageSize }),
      check,
    );
  }

  // Use searchV2 consistently: search has different default ordering.
  async searchTokens(
    network: NetworkDescriptor,
    query: SunPumpSearchQuery,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage> {
    return this.tokenPage(
      network,
      (client) =>
        client.searchTokensV2({
          query: query.keyword,
          page: query.pageNo,
          size: query.pageSize,
          sort: query.sort,
          // Omit disabled filters to request the unfiltered set.
          ...(query.onSunSwap === true ? { onSunSwap: true } : {}),
          ...(query.twitterLaunch === true ? { filterTwitterLaunch: true } : {}),
          ...(query.sunAgentLaunch === true ? { filterSunAgentLaunch: true } : {}),
        }),
      check,
    );
  }

  async getToken(
    network: NetworkDescriptor,
    address: string,
    check: DispatchCheck,
  ): Promise<SunPumpTokenRecord | null> {
    const payload = await this.request(network, check, (client) => client.getToken(address));
    if (payload === null || payload === undefined) return null;
    const parsed = parseSunPumpShape(rawTokenSchema, payload);
    return isTokenRow(parsed) ? mapToken(parsed) : null;
  }

  private async tokenPage(
    network: NetworkDescriptor,
    call: (client: SunPumpApiClient) => Promise<unknown>,
    check: DispatchCheck,
  ): Promise<SunPumpTokenPage> {
    const parsed = parseSunPumpShape(
      tokensResponseSchema,
      (await this.request(network, check, call)) ?? {},
    );
    // Ignore metadata.total: it can be zero even when tokens are returned.
    return { tokens: parsed.tokens.filter(isTokenRow).map(mapToken) };
  }

  private async request(
    network: NetworkDescriptor,
    check: DispatchCheck,
    call: (client: SunPumpApiClient) => Promise<unknown>,
  ): Promise<unknown> {
    return sunpumpRequest(network, check, this.deps, call);
  }
}
