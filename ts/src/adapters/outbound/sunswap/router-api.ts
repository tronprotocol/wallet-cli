/**
 * RouterPort over the SunSwap route service.
 *
 * Its wire shape has three traps, all measured against the live service, and this file is where
 * they stop:
 *
 * - `amountIn` and `amountOut` are HUMAN decimal strings. The base units are under `amountInRaw`
 *   and `amountOutRaw`. So the field whose NAME matches what PM asks for is the one PM does not
 *   mean, and using it would publish "100.000000" where a caller expects 100000000.
 * - There is no `feeRaw`. `fee` is human only, so a raw `tradingFee` has to be derived by the
 *   caller, which needs the input token's decimals — and the service sends no decimals either.
 * - `amountOutMinimum` equals `amountOut` unless slippage was requested, so by default it is not
 *   a minimum at all. It is deliberately not passed on; the minimum is ours to compute.
 *
 * Amounts are parsed with `lossless-json` for the same reason as the market API: `JSON.parse`
 * rewrites a 24-digit integer, and these are money.
 *
 * The transport is the market API's too: `fetchImpl` carries the call's `--timeout` and the
 * response cap, and a 429 is caught there while its `Retry-After` header is still readable.
 */
import { RouterApiClient } from "@sun-protocol/sun-sdk-api";
import { isLosslessNumber, parse as parseLosslessJson } from "lossless-json";
import type { RouterPort, RouterRoute } from "../../../application/ports/sunswap/router.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, CliError, UsageError } from "../../../domain/errors/index.js";
import { createTimedFetch } from "../http/timed-fetch.js";
import { RateLimited, rateLimitAware } from "./market-api.js";

/** What the service actually sends, named as it names things. Confined to this file. */
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

/** Injection seam. Production supplies none; it exists so tests can replay a response. */
export interface RouterApiDeps {
  /** the fetch the timeout and size cap are wrapped around. */
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
        // BASE UNITS. The service takes raw here and answers a human amount, and passing a human
        // amount is not an error — it quotes a millionth of the intended trade.
        amountIn: request.amountInRaw,
      });
    } catch (error) {
      throw translate(error);
    }
    // Compared as text, not with `!==`: `lossless-json` hands back its own number wrapper for an
    // unquoted literal, so `code !== 0` is an object compared to a number and always true. The
    // parser that protects the amounts also touches the envelope.
    if (String(response.code ?? "") !== "0") {
      throw new ChainError(
        "provider_error",
        `the SunSwap route service refused the request: ${response.message ?? response.msg ?? `code ${response.code}`}`,
      );
    }
    const wire = Array.isArray(response.data) ? (response.data as WireRoute[]) : [];
    return wire.map((route) => normalise(route));
  }
}

/**
 * A failure to get an answer, in the market API's vocabulary.
 *
 * A 429 is `provider_rate_limited` (retry later, not at once); the transport's own `timeout` and
 * `response_too_large` pass through unchanged, because re-labelling them would lose the
 * distinction the caller acts on. Anything else is the service failing.
 */
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

/**
 * One wire route as the port describes it.
 *
 * Every field is converted rather than passed through, so a rename upstream becomes a decode
 * failure here instead of a wrong number downstream.
 */
function normalise(route: WireRoute): RouterRoute {
  const tokens = (route.tokens ?? []).map(String);
  const symbols = (route.symbols ?? []).map(String);
  if (tokens.length === 0 || tokens.length !== symbols.length) {
    throw new ChainError(
      "provider_error",
      `the route service returned ${tokens.length} addresses and ${symbols.length} symbols for one route, which cannot be paired`,
    );
  }
  return {
    amountInRaw: integer(route.amountInRaw, "amountInRaw"),
    amountOutRaw: integer(route.amountOutRaw, "amountOutRaw"),
    // Human, and the only form the service sends.
    fee: String(route.fee ?? "0"),
    // May be negative, which is a real answer: the route paid better than the reference price.
    priceImpactPercent: String(route.impact ?? "0"),
    ...(route.inUsd === undefined ? {} : { inUsd: String(route.inUsd) }),
    ...(route.outUsd === undefined ? {} : { outUsd: String(route.outUsd) }),
    path: tokens.map((address, index) => ({ address, symbol: symbols[index]! })),
    // Uppercase, because PM names protocols `V2` and the service sends `v2`.
    protocols: (route.poolVersions ?? []).map((version) => String(version).toUpperCase()),
    poolFees: (route.poolFees ?? []).map(String),
    // A display flag, not a decode failure: the route is offered and the caller decides.
    containsUnverifiedHook: route.containsUnverifiedHook === true,
    // The original, for the planner — with the parser's own number wrappers unwrapped. Measured:
    // handing the wrapped object straight over fails a V4 route with "Router route poolKey has
    // invalid fields", because a pool key's `fee` arrives as a LosslessNumber rather than a number.
    source: plainNumbers(route),
  };
}

/**
 * The same object with `lossless-json`'s wrappers replaced by plain values.
 *
 * The parser exists to keep a 24-digit amount from being rewritten, and it does that by wrapping
 * EVERY unquoted number — including a pool key's fee tier and a tick, which the SDK's own validator
 * requires to be plain numbers. So a wrapper becomes a `number` when it survives the conversion
 * exactly, and a string when it would not: precision is kept where it matters and the SDK gets
 * values it recognises everywhere else.
 */
function plainNumbers(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const text = value.toString();
    // The round trip IS the definition of "survives exactly": if stringifying the number gives back
    // the text it came from, nothing was lost. Any other test is a guess about what the parser
    // considers safe.
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

/**
 * A base-unit amount, as a decimal string.
 *
 * `lossless-json` hands back its own number wrapper for an unquoted literal, so the value is
 * stringified rather than coerced — `Number()` here would undo the whole point of the parser.
 */
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
