// Use lossless JSON parsing to preserve token amounts and prices.
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { SunPumpApiClient } from "@sun-protocol/sun-sdk-api";
import { parse as parseLosslessJson } from "lossless-json";
import { isTronNetwork, type NetworkDescriptor } from "../../../domain/types/network.js";
import { ChainError, CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import { createTimedFetch } from "../http/timed-fetch.js";

const BODY_EXCERPT_LIMIT = 200;

export interface SunPumpApiDeps {
  readonly clientFactory?: SunPumpApiClientFactory;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export type SunPumpApiClientFactory = (options: {
  baseUrl: string;
  fetchImpl: typeof globalThis.fetch;
  jsonParser: (text: string) => unknown;
}) => SunPumpApiClient;

const defaultClientFactory: SunPumpApiClientFactory = (options) => new SunPumpApiClient(options);

// Require an explicit endpoint to avoid the SDK mainnet fallback.
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

class RateLimited extends Error {
  constructor(readonly retryAfterSeconds?: number) {
    super("rate limited");
    this.name = "RateLimited";
  }
}

export async function sunpumpRequest(
  network: NetworkDescriptor,
  check: DispatchCheck,
  deps: SunPumpApiDeps,
  call: (client: SunPumpApiClient) => Promise<unknown>,
): Promise<unknown> {
  const client = (deps.clientFactory ?? defaultClientFactory)({
    baseUrl: sunpumpApiBaseUrl(network),
    fetchImpl: rateLimitAware(
      createTimedFetch({
        check,
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

// Capture Retry-After before the SDK discards the response headers.
function rateLimitAware(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 429) return response;
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => {});
    throw new RateLimited(retryAfter);
  };
}

// Retry-After accepts unsigned seconds or an HTTP-date; past dates yield zero.
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (/^[+-]?\d+$/.test(value)) return /^\d+$/.test(value) ? Number(value) : undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

// HTTP 200 can contain a refusal; only envelope codes 0, 200, or absent are accepted.
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

// Keep remote response text in bounded error details, outside error.message.
function translate(error: unknown): CliError {
  if (error instanceof RateLimited) {
    return new ChainError("provider_rate_limited", "SunPump API rate limit exceeded", {
      httpStatus: 429,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
  }
  // Preserve timeout and response-size error codes from the fetch wrapper.
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
