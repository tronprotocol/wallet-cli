// Use amountInRaw/amountOutRaw: response amountIn/amountOut are human decimals.
import { RouterApiClient } from "@sun-protocol/sun-sdk-api";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type { RouterPort, RouterRoute } from "../../../application/ports/sunswap/router.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, CliError, UsageError } from "../../../domain/errors/index.js";
import { tronHexAddress } from "../../../domain/address/index.js";
import { createTimedFetch } from "../http/timed-fetch.js";
import { RateLimited, rateLimitAware } from "./market-api.js";

interface WireRoute {
  readonly amountInRaw?: unknown;
  readonly amountOutRaw?: unknown;
  readonly fee?: unknown;
  readonly impact?: unknown;
  readonly inUsd?: unknown;
  readonly outUsd?: unknown;
  readonly tokens?: readonly unknown[];
  readonly symbols?: readonly unknown[];
  readonly poolFees?: readonly unknown[];
  readonly poolVersions?: readonly unknown[];
  readonly containsUnverifiedHook?: unknown;
}

export interface RouterApiDeps {
  readonly fetchImpl?: typeof globalThis.fetch;
}

export class SunSwapRouterApi implements RouterPort {
  constructor(
    private readonly timeoutMs: number,
    private readonly deps: RouterApiDeps = {},
  ) {}

  async routes(
    network: NetworkDescriptor,
    request: { fromToken: string; toToken: string; amountInRaw: string },
  ): Promise<readonly RouterRoute[]> {
    const baseUrl = routerBaseUrl(network);
    const client = new RouterApiClient({
      fetchImpl: rateLimitAware(
        createTimedFetch({
          timeoutMs: this.timeoutMs,
          ...(this.deps.fetchImpl === undefined ? {} : { fetchImpl: this.deps.fetchImpl }),
        }),
      ),
      jsonParser: (text: string) => parseLosslessJson(text) as unknown,
    });
    let response: { code?: unknown; data?: unknown; message?: string; msg?: string };
    try {
      response = await client.getRoutes(baseUrl, {
        fromToken: request.fromToken,
        toToken: request.toToken,
        // The request amountIn is in base units despite the human-decimal response field.
        amountIn: request.amountInRaw,
      });
    } catch (error) {
      throw translate(error);
    }
    // Lossless parsing wraps numeric envelope codes too.
    if (String(response.code ?? "") !== "0") {
      throw new ChainError(
        "provider_error",
        `the SunSwap route service refused the request: ${response.message ?? response.msg ?? `code ${response.code}`}`,
      );
    }
    const wire = Array.isArray(response.data) ? (response.data as WireRoute[]) : [];
    return wire.map((route) => normalise(route, request));
  }
}

function translate(error: unknown): CliError {
  if (error instanceof RateLimited) {
    return new ChainError("provider_rate_limited", "SunSwap route service rate limit exceeded", {
      httpStatus: 429,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
  }
  if (error instanceof CliError) return error;
  return new ChainError(
    "provider_error",
    `the SunSwap route service did not answer: ${error instanceof Error ? error.message : String(error)}`,
  );
}

function normalise(
  route: WireRoute,
  request: { fromToken: string; toToken: string; amountInRaw: string },
): RouterRoute {
  const tokens = (route.tokens ?? []).map(String);
  const symbols = (route.symbols ?? []).map(String);
  if (tokens.length === 0 || tokens.length !== symbols.length) {
    throw new ChainError(
      "provider_error",
      `the route service returned ${tokens.length} addresses and ${symbols.length} symbols for one route, which cannot be paired`,
    );
  }
  const amountInRaw = integer(route.amountInRaw, "amountInRaw");
  assertMatchesRequest(tokens, amountInRaw, request);
  return {
    amountInRaw,
    amountOutRaw: integer(route.amountOutRaw, "amountOutRaw"),
    // Human units; the service supplies no raw fee.
    fee: String(route.fee ?? "0"),
    // Negative impact means the quote beats the reference price.
    priceImpactPercent: String(route.impact ?? "0"),
    ...(route.inUsd === undefined ? {} : { inUsd: String(route.inUsd) }),
    ...(route.outUsd === undefined ? {} : { outUsd: String(route.outUsd) }),
    path: tokens.map((address, index) => ({ address, symbol: symbols[index]! })),
    protocols: (route.poolVersions ?? []).map((version) => String(version).toUpperCase()),
    poolFees: (route.poolFees ?? []).map(String),
    containsUnverifiedHook: route.containsUnverifiedHook === true,
    // The SDK requires plain numbers for pool-key fees and ticks.
    source: plainNumbers(route),
  };
}

// Bind endpoints and amount to the request; compare decoded address identities.
function assertMatchesRequest(
  tokens: readonly string[],
  amountInRaw: string,
  request: { fromToken: string; toToken: string; amountInRaw: string },
): void {
  if (!sameInteger(amountInRaw, request.amountInRaw)) {
    throw new ChainError(
      "provider_error",
      "the route service returned a route for a different input amount than requested",
    );
  }
  if (!sameTronAddress(tokens[0]!, request.fromToken)) {
    throw new ChainError(
      "provider_error",
      "the route service returned a route for a different input token than requested",
    );
  }
  if (!sameTronAddress(tokens[tokens.length - 1]!, request.toToken)) {
    throw new ChainError(
      "provider_error",
      "the route service returned a route for a different output token than requested",
    );
  }
}

// Avoid allocating a BigInt from an unbounded provider string.
function sameInteger(left: string, right: string): boolean {
  if (!/^\d+$/.test(right)) return false;
  return left.replace(/^0+(?=\d)/, "") === right.replace(/^0+(?=\d)/, "");
}

function sameTronAddress(left: string, right: string): boolean {
  try {
    return tronIdentity(left) === tronIdentity(right);
  } catch {
    return false;
  }
}

function tronIdentity(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address.slice(2).toLowerCase();
  if (/^41[0-9a-fA-F]{40}$/.test(address)) return address.slice(2).toLowerCase();
  return tronHexAddress(address).slice(2).toLowerCase();
}

// Convert lossless wrappers to numbers only when their text round-trips; otherwise keep strings.
function plainNumbers(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const text = value.toString();
    return String(Number(text)) === text ? Number(text) : text;
  }
  if (Array.isArray(value)) return value.map(plainNumbers);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        plainNumbers(item),
      ]),
    );
  }
  return value;
}

// Keep base-unit amounts as strings; Number would round large values.
function integer(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    throw new ChainError(
      "provider_error",
      `the route service sent ${field} as ${JSON.stringify(value)}, which is not a base-unit amount`,
    );
  }
  return text;
}

function routerBaseUrl(network: NetworkDescriptor): string {
  const baseUrl = isTronNetwork(network) ? network.sunswap?.routerApiBaseUrl : undefined;
  if (!baseUrl) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} has no SunSwap route service configured`,
    );
  }
  return baseUrl;
}
