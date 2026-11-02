import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { SunApiClient } from "@sun-protocol/sun-sdk-api";
import { parse as parseLosslessJson } from "lossless-json";
import { isTronNetwork, type NetworkDescriptor } from "../../../domain/types/network.js";
import type {
  ListPoolsQuery,
  ListPositionsQuery,
  ListTokensQuery,
  PoolPage,
  MarketDataPort,
  PositionPage,
  PriceRecord,
  SearchPoolsQuery,
  SearchTokensQuery,
  TokenPage,
} from "../../../application/ports/sunswap/market-data.js";
import { ChainError, CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { expandScientificNotation } from "../../../domain/sunswap/amount.js";
import { serviceFetch } from "../http/json-service.js";
import { epochMsToUtcMinute, mapPool, mapPosition, mapToken } from "./market-api.mapper.js";
import {
  poolCountSchema,
  poolsResponseSchema,
  positionsResponseSchema,
  pricesResponseSchema,
  tokensResponseSchema,
} from "./market-api.schema.js";

// Require a configured URL: the SDK default points to mainnet.
function marketApiBaseUrl(network: NetworkDescriptor): string {
  const configured = isTronNetwork(network) ? network.sunswap?.marketApiBaseUrl : undefined;
  if (!configured) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} has no SunSwap market API configured`,
    );
  }
  return configured;
}

// Search pages and counts must use identical filters.
function searchParams(query: SearchPoolsQuery): Record<string, unknown> {
  return {
    query: query.keyword,
    filterBlackList: true,
    ...(query.protocol === undefined ? {} : { protocol: query.protocol }),
    pageNo: query.pageNo,
    pageSize: query.pageSize,
  };
}

const BODY_EXCERPT_LIMIT = 200;

export interface MarketApiDeps {
  readonly clientFactory?: SunApiClientFactory;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export class SunSwapMarketApi implements MarketDataPort {
  constructor(private readonly deps: MarketApiDeps = {}) {}

  async listPositions(
    network: NetworkDescriptor,
    query: ListPositionsQuery,
    check: DispatchCheck,
  ): Promise<PositionPage> {
    const payload = await this.request(network, check, (client) =>
      client.getUserPositions({
        userAddress: query.owner,
        pageNo: query.pageNo,
        pageSize: query.pageSize,
        ...(query.pool === undefined ? {} : { poolAddress: query.pool }),
        ...(query.protocol === undefined ? {} : { protocol: query.protocol }),
      }),
    );
    const parsed = parse(positionsResponseSchema, payload);
    return {
      positions: parsed.list.map(mapPosition),
      ...(parsed.meta?.hasMore === undefined ? {} : { hasMore: parsed.meta.hasMore }),
    };
  }

  async listPools(
    network: NetworkDescriptor,
    query: ListPoolsQuery,
    check: DispatchCheck,
  ): Promise<PoolPage> {
    return this.poolPage(
      network,
      (client) =>
        client.getPools({
          pageNo: query.pageNo,
          pageSize: query.pageSize,
          desc: query.desc,
          filterBlackList: true,
          ...(query.pool === undefined ? {} : { poolAddress: query.pool }),
          ...(query.token === undefined ? {} : { tokenAddress: query.token }),
          ...(query.protocol === undefined ? {} : { protocol: query.protocol }),
          ...(query.sort === undefined ? {} : { sort: query.sort }),
        }),
      check,
    );
  }

  async searchPools(
    network: NetworkDescriptor,
    query: SearchPoolsQuery,
    check: DispatchCheck,
  ): Promise<PoolPage> {
    return this.poolPage(network, (client) => client.searchPools(searchParams(query)), check);
  }

  async countPools(
    network: NetworkDescriptor,
    query: SearchPoolsQuery,
    check: DispatchCheck,
  ): Promise<number | null> {
    const payload = await this.request(network, check, (client) =>
      client.searchCountPools(searchParams(query)),
    );
    const parsed = poolCountSchema.safeParse(payload);
    if (!parsed.success) return null;
    const total = Number(parsed.data);
    return Number.isInteger(total) && total >= 0 ? total : null;
  }

  private async poolPage(
    network: NetworkDescriptor,
    call: (client: SunApiClient) => Promise<unknown>,
    check: DispatchCheck,
  ): Promise<PoolPage> {
    const parsed = parse(poolsResponseSchema, await this.request(network, check, call));
    return {
      pools: parsed.list.map(mapPool),
      ...(parsed.meta?.hasMore === undefined ? {} : { hasMore: parsed.meta.hasMore }),
    };
  }

  async listTokens(
    network: NetworkDescriptor,
    query: ListTokensQuery,
    check: DispatchCheck,
  ): Promise<TokenPage> {
    return this.tokenPage(
      network,
      (client) =>
        client.getTokens({
          protocol: query.protocol,
          pageNo: query.pageNo,
          pageSize: query.pageSize,
          filterBlackList: true,
          ...(query.address === undefined ? {} : { tokenAddress: query.address }),
          ...(query.sort === undefined ? {} : { sort: query.sort }),
        }),
      check,
    );
  }

  async searchTokens(
    network: NetworkDescriptor,
    query: SearchTokensQuery,
    check: DispatchCheck,
  ): Promise<TokenPage> {
    return this.tokenPage(
      network,
      (client) =>
        client.searchTokens({
          query: query.keyword,
          protocol: query.protocol,
          pageNo: query.pageNo,
          pageSize: query.pageSize,
          filterBlackList: true,
        }),
      check,
    );
  }

  private async tokenPage(
    network: NetworkDescriptor,
    call: (client: SunApiClient) => Promise<unknown>,
    check: DispatchCheck,
  ): Promise<TokenPage> {
    const parsed = parse(tokensResponseSchema, await this.request(network, check, call));
    return {
      tokens: parsed.list.map(mapToken),
      ...(parsed.meta?.hasMore === undefined ? {} : { hasMore: parsed.meta.hasMore }),
    };
  }

  async prices(
    network: NetworkDescriptor,
    addresses: readonly string[],
    check: DispatchCheck,
  ): Promise<PriceRecord[]> {
    if (addresses.length === 0) return [];
    const payload = await this.request(network, check, (client) =>
      client.getPrice({ tokenAddress: addresses.join(",") }),
    );
    const parsed = parse(pricesResponseSchema, payload ?? {});
    return Object.entries(parsed).map(([address, entry]) => ({
      address,
      priceUsd: expandScientificNotation(entry.quote?.USD?.price ?? "0"),
      quotedAt: epochMsToUtcMinute(entry.quote?.USD?.last_updated ?? ""),
    }));
  }

  async symbols(
    network: NetworkDescriptor,
    addresses: readonly string[],
    check: DispatchCheck,
  ): Promise<Map<string, string>> {
    if (addresses.length === 0) return new Map();
    const payload = await this.request(network, check, (client) =>
      client.getTokens({ tokenAddress: addresses.join(","), protocol: "ALL" }),
    );
    const parsed = parse(tokensResponseSchema, payload);
    const out = new Map<string, string>();
    for (const token of parsed.list) {
      if (token.tokenAddress && token.tokenSymbol) out.set(token.tokenAddress, token.tokenSymbol);
    }
    return out;
  }

  private async request(
    network: NetworkDescriptor,
    check: DispatchCheck,
    call: (client: SunApiClient) => Promise<unknown>,
  ): Promise<unknown> {
    const client = (this.deps.clientFactory ?? defaultClientFactory)({
      baseUrl: marketApiBaseUrl(network),
      fetchImpl: serviceFetch({
        service: "SunSwap market API",
        check,
        ...(this.deps.fetchImpl === undefined ? {} : { fetchImpl: this.deps.fetchImpl }),
      }),
      // JSON.parse would round liquidity and monetary values.
      jsonParser: (text: string) => parseLosslessJson(text),
    });
    let envelope: unknown;
    try {
      envelope = await call(client);
    } catch (error) {
      throw translate(error);
    }
    return unwrap(envelope);
  }
}

export type SunApiClientFactory = (options: {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  jsonParser: (text: string) => unknown;
}) => SunApiClient;

const defaultClientFactory: SunApiClientFactory = (options) => new SunApiClient(options);

// Envelope codes 0, 200, or absent indicate success.
function unwrap(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object") {
    throw new ChainError("provider_error", "SunSwap market API returned an unexpected body");
  }
  const { code, data, msg, message } = envelope as Record<string, unknown>;
  const numeric = code === undefined ? 0 : Number(String(code));
  if (numeric !== 0 && numeric !== 200) {
    throw new ChainError("provider_error", "SunSwap market API rejected the request", {
      apiCode: numeric,
      ...(typeof (msg ?? message) === "string"
        ? { apiMessage: excerpt(String(msg ?? message)) }
        : {}),
    });
  }
  return data;
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new ChainError("provider_error", "SunSwap market API returned an unexpected shape");
  }
  return result.data;
}

// Keep remote text out of error messages; expose only bounded excerpts in details.
function translate(error: unknown): CliError {
  // Preserve typed failures such as provider_rate_limited, timeout and response_too_large.
  if (error instanceof CliError) return error;
  const context = sdkContext(error);
  if (context) {
    return new ChainError("provider_error", "SunSwap market API request failed", context);
  }
  if (isAbort(error)) {
    return new TransportError("timeout", "SunSwap market API request timed out");
  }
  return new TransportError("provider_error", "SunSwap market API request failed");
}

function sdkContext(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof Error) || !("context" in error)) return undefined;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== "object") return undefined;
  const { status, body, apiMessage } = context as Record<string, unknown>;
  return {
    ...(typeof status === "number" ? { httpStatus: status } : {}),
    ...(typeof body === "string" && body !== "" ? { body: excerpt(body) } : {}),
    ...(typeof apiMessage === "string" && apiMessage !== ""
      ? { apiMessage: excerpt(apiMessage) }
      : {}),
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function excerpt(text: string): string {
  return text.length > BODY_EXCERPT_LIMIT ? `${text.slice(0, BODY_EXCERPT_LIMIT)}…` : text;
}
