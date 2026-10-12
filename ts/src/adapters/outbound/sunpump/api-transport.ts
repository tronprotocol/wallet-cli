/**
 * The transport every SunPump adapter in this folder shares: one call, one vocabulary of failures.
 *
 * Extracted because the catalogue reads and the create call speak to the SAME service, whose
 * defining trap is that it answers a refusal with HTTP 200 and a non-zero `code`. A second copy of
 * the envelope handling would be a second place for that to be forgotten, and forgetting it on the
 * create call would report a token that was never created.
 *
 * Three constructor options carry most of the weight:
 *
 * - `baseUrl` is always passed explicitly. The SDK falls back to its mainnet default, so a client
 *   built for a network that has no SunPump would answer with mainnet data and look healthy.
 *   The capability gate refuses such a network first; reaching here without one is a wiring
 *   fault, and it still has to name the network.
 * - `jsonParser` is `lossless-json`. The default `JSON.parse` rewrites `marketCap`
 *   20477938.60521827 and every eighteen-decimal price, silently.
 * - `fetchImpl` carries the call's timeout and response cap, which the SDK has no option for.
 */
import { SunPumpApiClient } from "@sun-protocol/sun-sdk-api";
import { parse as parseLosslessJson } from "lossless-json";
import { isTronNetwork, type NetworkDescriptor } from "../../../domain/types/network.js";
import { ChainError, CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { createTimedFetch } from "../http/timed-fetch.js";

/** Long enough to identify the failure, short enough that no response body is republished. */
const BODY_EXCERPT_LIMIT = 200;

/** Injection seams. Production supplies neither; both exist so tests can replay a body. */
export interface SunPumpApiDeps {
  readonly clientFactory?: SunPumpApiClientFactory;
  /** the fetch the timeout and size cap are wrapped around. */
  readonly fetchImpl?: typeof globalThis.fetch;
}

export type SunPumpApiClientFactory = (options: {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  jsonParser: (text: string) => unknown;
}) => SunPumpApiClient;

const defaultClientFactory: SunPumpApiClientFactory = (options) => new SunPumpApiClient(options);

/**
 * The SunPump API origin this network is configured with.
 *
 * Never the SDK default, which is mainnet. The SDK's own chain config has `sunPump: null` for
 * Nile, so there is no testnet catalogue to fall back to either: a network without one is
 * refused rather than answered with another network's tokens.
 */
export function sunpumpApiBaseUrl(network: NetworkDescriptor): string {
  const configured = isTronNetwork(network) ? network.sunpump?.apiBaseUrl : undefined;
  if (!configured) {
    throw new UsageError(
      "unsupported_network",
      `network ${network.id} has no SunPump API configured`,
    );
  }
  return configured;
}

/**
 * Raised by the fetch wrapper the instant a 429 is seen, because that is the only moment the
 * `Retry-After` header exists: the SDK reads the body, throws its own error, and the `Response`
 * is gone. Every other status keeps flowing into the SDK so its own normalisation still applies.
 */
class RateLimited extends Error {
  constructor(readonly retryAfterSeconds?: number) {
    super("rate limited");
    this.name = "RateLimited";
  }
}

/** run one SDK call under this scope's transport, and translate every failure it can produce. */
export async function sunpumpRequest(
  network: NetworkDescriptor,
  timeoutMs: number,
  deps: SunPumpApiDeps,
  call: (client: SunPumpApiClient) => Promise<unknown>,
): Promise<unknown> {
  const client = (deps.clientFactory ?? defaultClientFactory)({
    baseUrl: sunpumpApiBaseUrl(network),
    fetchImpl: rateLimitAware(
      createTimedFetch({
        timeoutMs,
        ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
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

/**
 * Wrap a fetch so a 429 becomes a typed error while its `Retry-After` header is still readable.
 *
 * Only 429. Letting any other status through keeps the SDK's status handling, body excerpt and
 * API-message extraction intact; this adds a channel for one header rather than replacing them.
 */
function rateLimitAware(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
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
  if (/^[+-]?\d+$/.test(value)) return /^\d+$/.test(value) ? Number(value) : undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

/** `{ code, msg, data }` → `data`; a non-zero code is the service refusing, not a transport failure. */
function unwrap(envelope: unknown): unknown {
  if (!envelope || typeof envelope !== "object") {
    throw new ChainError("provider_error", "SunPump API returned an unexpected body");
  }
  const { code, data, msg, message } = envelope as Record<string, unknown>;
  const numeric = code === undefined ? 0 : Number(String(code));
  if (numeric !== 0 && numeric !== 200) {
    throw new ChainError("provider_error", "SunPump API rejected the request", {
      apiCode: numeric,
      ...(typeof (msg ?? message) === "string"
        ? { apiMessage: excerpt(String(msg ?? message)) }
        : {}),
    });
  }
  return data;
}

/** validate a body against a shape, or refuse it — never publish a half-understood response. */
export function parseSunPumpShape<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new ChainError("provider_error", "SunPump API returned an unexpected shape");
  }
  return result.data;
}

/**
 * Every failure this adapter can produce, in one vocabulary.
 *
 * The response body never reaches `error.message`: it is remote text, it can be long, and CLI
 * messages get pasted into issues. What identifies the failure goes under `details`.
 */
function translate(error: unknown): CliError {
  if (error instanceof RateLimited) {
    return new ChainError("provider_rate_limited", "SunPump API rate limit exceeded", {
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
    return new ChainError("provider_error", "SunPump API request failed", context);
  }
  if (isAbort(error)) {
    return new TransportError("timeout", "SunPump API request timed out");
  }
  return new TransportError("provider_error", "SunPump API request failed");
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
