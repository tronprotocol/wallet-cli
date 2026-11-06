// SDK fetch hooks enforce the dispatch check and response limits before SDK parsing.
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";

type FetchFunction = typeof globalThis.fetch;

export interface TimedFetchOptions {
  // Every request of the hook runs this check before it is sent and aborts with its signal.
  readonly check: DispatchCheck;
  // Defaults to MAX_HTTP_RESPONSE_BYTES.
  readonly maxBytes?: number;
  readonly fetchImpl?: FetchFunction;
}

// Limit failures use TransportError codes timeout and response_too_large.
export function createTimedFetch(options: TimedFetchOptions): FetchFunction {
  const { check, maxBytes = MAX_HTTP_RESPONSE_BYTES, fetchImpl = globalThis.fetch } = options;
  return (input, init) => fetchBounded(fetchImpl, input, init, check, maxBytes);
}
