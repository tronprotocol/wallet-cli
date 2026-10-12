/**
 * MarketDataPort over `@sun-protocol/sun-sdk-api`'s `SunApiClient`.
 *
 * The SDK owns the URLs and the request; this file owns everything that makes the answer safe to
 * use — which host was asked, how the body was parsed, what a failure is called, and what shape
 * the caller gets.
 *
 * Three constructor options carry most of that weight:
 *
 * - `baseUrl` is always passed explicitly. The SDK's default is mainnet, so a client built
 *   without it would answer a Nile question with mainnet data and look entirely healthy doing it.
 * - `jsonParser` is `lossless-json`. The default `JSON.parse` rewrites `position_liquidity` from
 *   392657176790371861588 to ...861860480 and `lpBalanceUsd` from 25 digits to 17, silently. The
 *   first of those is the number a user copies into a remove-liquidity call.
 * - `fetchImpl` carries the call's timeout and response cap, which the SDK has no option for.
 */
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
import { createTimedFetch } from "../http/timed-fetch.js";
import { epochMsToUtcMinute, mapPool, mapPosition, mapToken } from "./market-api.mapper.js";
import {
  poolCountSchema,
  poolsResponseSchema,
  positionsResponseSchema,
  pricesResponseSchema,
  tokensResponseSchema,
} from "./market-api.schema.js";

/**
 * The market API origin this network is configured with.
 *
 * Never the SDK default: that default is mainnet, so a client built without an explicit base URL
 * would answer a Nile question with mainnet data and look entirely healthy doing it. The
 * capability gate already refuses a network without one, so reaching here without it is a wiring
 * fault rather than a user error — but it still has to say which network.
 */
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

/** the filters a search page and its count must share, so the two describe the same set. */
function searchParams(query: SearchPoolsQuery): Record<string, unknown> {
  return {
    query: query.keyword,
    filterBlackList: true,
    ...(query.protocol === undefined ? {} : { protocol: query.protocol }),
    pageNo: query.pageNo,
    pageSize: query.pageSize,
  };
}

/** Long enough to identify the failure, short enough that no response body is republished. */
const BODY_EXCERPT_LIMIT = 200;

/** Injection seams. Production supplies neither; both exist so tests can replay a body. */
export interface MarketApiDeps {
  readonly clientFactory?: SunApiClientFactory;
  /** the fetch the timeout and size cap are wrapped around. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * Raised by the fetch wrapper the instant a 429 is seen, because that is the only moment the
 * `Retry-After` header exists: the SDK reads the body, throws its own error, and the `Response`
 * is gone. Every other status keeps flowing into the SDK so its own normalisation still applies.
 */
export class RateLimited extends Error {
  constructor(readonly retryAfterSeconds?: number) {
    super("rate limited");
    this.name = "RateLimited";
  }
}

export class SunSwapMarketApi implements MarketDataPort {
  constructor(
    private readonly timeoutMs: number,
    private readonly deps: MarketApiDeps = {},
  ) {}

  async listPositions(
    network: NetworkDescriptor,
    query: ListPositionsQuery,
  ): Promise<PositionPage> {
    const payload = await this.request(network, (client) =>
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

  async listPools(network: NetworkDescriptor, query: ListPoolsQuery): Promise<PoolPage> {
    return this.poolPage(network, (client) =>
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
    );
  }

  async searchPools(network: NetworkDescriptor, query: SearchPoolsQuery): Promise<PoolPage> {
    return this.poolPage(network, (client) => client.searchPools(searchParams(query)));
  }

  /**
   * The count carries the SAME filters as the page it describes. A total taken under different
   * filters would disagree with the rows beside it, and "showing 3 of 76" would be a lie about
   * which 76.
   */
  async countPools(network: NetworkDescriptor, query: SearchPoolsQuery): Promise<number | null> {
    const payload = await this.request(network, (client) =>
      client.searchCountPools(searchParams(query)),
    );
    const parsed = poolCountSchema.safeParse(payload);
    if (!parsed.success) return null;
    const total = Number(parsed.data);
    return Number.isInteger(total) && total >= 0 ? total : null;
  }

  /** both pool endpoints answer with the same record shape, so they share one reader. */
  private async poolPage(
    network: NetworkDescriptor,
    call: (client: SunApiClient) => Promise<unknown>,
  ): Promise<PoolPage> {
    const parsed = parse(poolsResponseSchema, await this.request(network, call));
    return {
      pools: parsed.list.map(mapPool),
      ...(parsed.meta?.hasMore === undefined ? {} : { hasMore: parsed.meta.hasMore }),
    };
  }

  async listTokens(network: NetworkDescriptor, query: ListTokensQuery): Promise<TokenPage> {
    return this.tokenPage(network, (client) =>
      client.getTokens({
        protocol: query.protocol,
        pageNo: query.pageNo,
        pageSize: query.pageSize,
        filterBlackList: true,
        ...(query.address === undefined ? {} : { tokenAddress: query.address }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
      }),
    );
  }

  async searchTokens(network: NetworkDescriptor, query: SearchTokensQuery): Promise<TokenPage> {
    return this.tokenPage(network, (client) =>
      client.searchTokens({
        query: query.keyword,
        protocol: query.protocol,
        pageNo: query.pageNo,
        pageSize: query.pageSize,
        filterBlackList: true,
      }),
    );
  }

  /** the two token endpoints answer with the same record shape, so they share one reader. */
  private async tokenPage(
    network: NetworkDescriptor,
    call: (client: SunApiClient) => Promise<unknown>,
  ): Promise<TokenPage> {
    const parsed = parse(tokensResponseSchema, await this.request(network, call));
    return {
      tokens: parsed.list.map(mapToken),
      ...(parsed.meta?.hasMore === undefined ? {} : { hasMore: parsed.meta.hasMore }),
    };
  }

  async prices(network: NetworkDescriptor, addresses: readonly string[]): Promise<PriceRecord[]> {
    if (addresses.length === 0) return [];
    const payload = await this.request(network, (client) =>
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
  ): Promise<Map<string, string>> {
    if (addresses.length === 0) return new Map();
    const payload = await this.request(network, (client) =>
      client.getTokens({ tokenAddress: addresses.join(","), protocol: "ALL" }),
    );
    const parsed = parse(tokensResponseSchema, payload);
    const out = new Map<string, string>();
    for (const token of parsed.list) {
      if (token.tokenAddress && token.tokenSymbol) out.set(token.tokenAddress, token.tokenSymbol);
    }
    return out;
  }

  /** run one SDK call under this scope's transport, and translate every failure it can produce. */
  private async request(
    network: NetworkDescriptor,
    call: (client: SunApiClient) => Promise<unknown>,
  ): Promise<unknown> {
    const client = (this.deps.clientFactory ?? defaultClientFactory)({
      baseUrl: marketApiBaseUrl(network),
      fetchImpl: rateLimitAware(
        createTimedFetch({
          timeoutMs: this.timeoutMs,
          ...(this.deps.fetchImpl === undefined ? {} : { fetchImpl: this.deps.fetchImpl }),
        }),
      ),
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

/**
 * Wrap a fetch so a 429 becomes a typed error while its `Retry-After` header is still readable.
 *
 * Only 429. Letting any other status through keeps the SDK's status handling, body excerpt and
 * API-message extraction intact; this adds a channel for one header rather than replacing them.
 */
export function rateLimitAware(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 429) return response;
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => {});
    throw new RateLimited(retryAfter);
  };
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110). Anything else — and anything
 * that would come out negative or NaN — yields no value at all, because a wrong wait published
 * as a number is worse than the caller deciding for itself.
 */
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  // A bare integer is delta-seconds and nothing else. Falling through to Date.parse would let
  // "-5" be read as a year and answered with a wait, which is worse than answering nothing.
  if (/^[+-]?\d+$/.test(value)) return /^\d+$/.test(value) ? Number(value) : undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** `{ code, data }` → `data`; a non-zero code is the service refusing, not a transport failure. */
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

/**
 * Every failure this adapter can produce, in one vocabulary.
 *
 * The response body never reaches `error.message`: it is remote text, it can be long, and CLI
 * messages get pasted into issues. What identifies the failure — the HTTP status and a short
 * excerpt — goes under `details`, where a reader can find it and a formatter can leave it out.
 */
function translate(error: unknown): CliError {
  if (error instanceof RateLimited) {
    return new ChainError("provider_rate_limited", "SunSwap market API rate limit exceeded", {
      httpStatus: 429,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
  }
  // TransportError from the fetch wrapper already carries this codebase's own code (`timeout`,
  // `response_too_large`); re-labelling it would lose the distinction the caller acts on.
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

/** the `{ status, body }` an `SDKError` carries, reduced to what is safe to publish. */
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
