// SDK fetch hooks enforce timeouts and response limits before SDK parsing.
import { fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";

type FetchFunction = typeof globalThis.fetch;

export interface TimedFetchOptions {
  readonly timeoutMs: number;
  // Defaults to MAX_HTTP_RESPONSE_BYTES.
  readonly maxBytes?: number;
  readonly fetchImpl?: FetchFunction;
}

// Limit failures use TransportError codes timeout and response_too_large.
export function createTimedFetch(options: TimedFetchOptions): FetchFunction {
  const { timeoutMs, maxBytes = MAX_HTTP_RESPONSE_BYTES, fetchImpl = globalThis.fetch } = options;
  return (input, init) => fetchBounded(fetchImpl, input, init, timeoutMs, maxBytes);
}
