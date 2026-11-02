import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { ChainError, type CliError, TransportError } from "../../../domain/errors/index.js";
import { boundedResponse, fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";

type FetchFunction = typeof globalThis.fetch;

export interface RateLimitDetails {
  readonly httpStatus: 429;
  readonly retryAfterSeconds?: number;
}

const IMF_FIXDATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

// Retry-After is unsigned delta-seconds or an HTTP-date; a past date gives zero.
export function retryAfterSeconds(header: string | null): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  // An IMF-fixdate, such as "Sun, 06 Nov 1994 08:49:37 GMT", must also format back to itself:
  // Date.parse accepts wrong weekdays and rolls over out-of-range fields ("31 Feb"), and
  // toUTCString emits five-digit years, which the syntax check refuses.
  if (!IMF_FIXDATE.test(value)) return undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date) || new Date(date).toUTCString() !== value) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

export function rateLimitDetails(headers: Headers): RateLimitDetails {
  const seconds = retryAfterSeconds(headers.get("retry-after"));
  return { httpStatus: 429, ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }) };
}

// `service` names the service in the message, for example "GasFree service". `context` holds the
// flow's own detail fields; the rate-limit keys win over it.
export function rateLimitedError(
  service: string,
  headers: Headers,
  context: Readonly<Record<string, string | number | boolean>> = {},
): ChainError {
  return new ChainError("provider_rate_limited", `${service} rate limit exceeded`, {
    ...context,
    ...rateLimitDetails(headers),
  });
}

// A fetch hook for SDK clients: the dispatch check, no redirects, the size bound, and 429 as
// provider_rate_limited, thrown before the SDK can discard the response headers.
export function serviceFetch(options: {
  readonly service: string;
  readonly check: DispatchCheck;
  readonly fetchImpl?: FetchFunction;
  readonly maxBytes?: number;
}): FetchFunction {
  const { service, check, fetchImpl = globalThis.fetch, maxBytes } = options;
  const limited: FetchFunction = async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 429) return response;
    await response.body?.cancel().catch(() => {});
    throw rateLimitedError(service, response.headers);
  };
  return (input, init) =>
    fetchBounded(limited, input, { ...init, redirect: "error" }, check, maxBytes);
}

// The service's own errors for failures that are not an HTTP status it answered with.
export interface JsonServiceErrors {
  // The signal aborted after the request was sent.
  readonly timeout: () => CliError;
  // The request failed without a response, or the body could not be read.
  readonly unreachable: () => CliError;
  readonly malformed: (status: number) => CliError;
  // Defaults to TransportError response_too_large.
  readonly tooLarge?: () => CliError;
}

export interface JsonServiceRequest {
  readonly service: string;
  readonly check: DispatchCheck;
  readonly errors: JsonServiceErrors;
  // Defaults to MAX_HTTP_RESPONSE_BYTES.
  readonly maxBytes?: number;
  // Defaults to JSON.parse.
  readonly parse?: (text: string) => unknown;
  // An error for a non-2xx status other than 429; the body is not read. Undefined reads the body.
  readonly refuse?: (response: Response) => CliError | undefined;
  // Detail fields of the flow that a 429 error carries beside the rate-limit keys.
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export interface JsonServiceResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

export async function requestJson(
  fetchImpl: FetchFunction,
  url: string,
  init: RequestInit,
  request: JsonServiceRequest,
): Promise<JsonServiceResponse> {
  const { check, errors } = request;
  const signal = check.signal;
  check.assertDispatchable();
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal, redirect: "error" });
  } catch {
    throw signal.aborted ? errors.timeout() : errors.unreachable();
  }
  const refused =
    response.status === 429
      ? rateLimitedError(request.service, response.headers, request.context)
      : response.ok
        ? undefined
        : request.refuse?.(response);
  if (refused) {
    await response.body?.cancel().catch(() => {});
    throw refused;
  }
  let text: string;
  try {
    const bounded = await boundedResponse(
      response,
      request.maxBytes ?? MAX_HTTP_RESPONSE_BYTES,
      signal,
    );
    text = await bounded.text();
  } catch (error) {
    if (error instanceof TransportError && error.code === "response_too_large") {
      throw errors.tooLarge ? errors.tooLarge() : error;
    }
    throw signal.aborted ? errors.timeout() : errors.unreachable();
  }
  let body: unknown;
  try {
    body = (request.parse ?? JSON.parse)(text);
  } catch {
    throw errors.malformed(response.status);
  }
  return { status: response.status, ok: response.ok, body };
}
