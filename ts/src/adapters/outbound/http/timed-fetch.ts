/**
 * A `fetch` bound to one call scope's timeout and response-size cap.
 *
 * Vendor SDK clients take a `fetchImpl` and nothing else: no timeout option, no byte limit. Left
 * on the platform default they wait forever and buffer whatever the remote sends, which turns a
 * slow or hostile endpoint into a hung CLI. Binding both limits into the function handed to the
 * SDK is the only place they can be enforced, because everything after it is the SDK's own code.
 *
 * Proxy environment variables are deliberately NOT handled here. Node's native fetch ignores
 * them, and the nine fetch-based clients in this codebase are all equally affected, so proxy
 * support is one change across all of them rather than a private one here. This wrapper is where
 * it will go when it is picked up.
 */
import { fetchBounded, MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";

type FetchFunction = typeof globalThis.fetch;

export interface TimedFetchOptions {
  readonly timeoutMs: number;
  /** defaults to the shared CLI cap; lower it for an endpoint known to answer small. */
  readonly maxBytes?: number;
  /** injection seam for tests; production always uses the platform fetch. */
  readonly fetchImpl?: FetchFunction;
}

/**
 * Build a `fetch` that aborts after `timeoutMs` and refuses a body over the cap.
 *
 * Failures surface as this codebase's own `TransportError` — `timeout` when the deadline or an
 * upstream abort fires, `response_too_large` when the cap does — so a caller maps one error
 * vocabulary rather than sniffing at `AbortError` names.
 */
export function createTimedFetch(options: TimedFetchOptions): FetchFunction {
  const { timeoutMs, maxBytes = MAX_HTTP_RESPONSE_BYTES, fetchImpl = globalThis.fetch } = options;
  return (input, init) => fetchBounded(fetchImpl, input, init, timeoutMs, maxBytes);
}
