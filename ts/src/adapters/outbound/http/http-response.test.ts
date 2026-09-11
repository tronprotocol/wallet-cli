import { expect, it, vi } from "vitest";
import { boundedResponse, fetchBounded } from "./http-response.js";

it("cancels a chunked response before buffering the whole body", async () => {
  let pulled = 0;
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream(
      {
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(1024));
        },
        cancel,
      },
      { highWaterMark: 0 },
    ),
  );
  await expect(boundedResponse(response, 2048)).rejects.toMatchObject({
    code: "response_too_large",
  });
  expect(pulled).toBe(3);
  expect(cancel).toHaveBeenCalledOnce();
});
it("times out while a body is stalled, even after response headers arrive", async () => {
  const cancel = vi.fn();
  const controller = new AbortController();
  const response = new Response(new ReadableStream({ pull() {}, cancel }));
  const result = boundedResponse(response, 1024, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ code: "timeout" });
  expect(cancel).toHaveBeenCalledOnce();
});
it("rejects an oversized Content-Length without reading the body", async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), {
    headers: { "content-length": "2049" },
  });
  await expect(boundedResponse(response, 2048)).rejects.toMatchObject({
    code: "response_too_large",
  });
  expect(cancel).toHaveBeenCalledOnce();
});
it("keeps the request's cancellation when applying the configured timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn(async (_request, init) => {
    expect(init.signal.aborted).toBe(true);
    throw init.signal.reason;
  });
  await expect(
    fetchBounded(
      fetcher as typeof fetch,
      new Request("https://example.test", { signal: controller.signal }),
      undefined,
      1000,
    ),
  ).rejects.toMatchObject({ code: "timeout" });
});
