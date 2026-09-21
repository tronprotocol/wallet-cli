import { TransportError } from "../../../domain/errors/index.js";

export const MAX_HTTP_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Enforce limits while reading, before an SDK or JSON parser can buffer the body. */
export async function boundedResponse(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Response> {
  const tooLarge = () =>
    new TransportError("response_too_large", "HTTP response exceeds its byte limit");
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(new TransportError("timeout", "HTTP request was aborted or timed out"));
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    if (signal?.aborted) {
      void reader.cancel().catch(() => {});
      throw new TransportError("timeout", "HTTP request was aborted or timed out");
    }
    while (true) {
      const next = await Promise.race([reader.read(), interrupted]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(next.value);
    }
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const result = new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperty(result, "url", { value: response.url });
  return result;
}

export async function fetchBounded(
  fetcher: typeof fetch,
  request: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  timeoutMs: number,
  maxBytes = MAX_HTTP_RESPONSE_BYTES,
): Promise<Response> {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (request instanceof Request) signals.push(request.signal);
  if (init?.signal) signals.push(init.signal);
  const signal = AbortSignal.any(signals);
  try {
    return await boundedResponse(await fetcher(request, { ...init, signal }), maxBytes, signal);
  } catch (error) {
    if (signal.aborted)
      throw new TransportError("timeout", "HTTP request timed out or was aborted");
    throw error;
  }
}
