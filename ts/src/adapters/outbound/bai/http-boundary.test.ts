import { expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";
import { BaiRechargeClient } from "./recharge-client.js";

for (const kind of ["query", "recharge"] as const) {
  const call = (fetcher: typeof fetch, timeout = 1000) =>
    kind === "query"
      ? new BaiClient({ baiApiKey: "test-key" }, timeout, fetcher).status()
      : new BaiRechargeClient({ baiApiKey: "test-key" }, timeout, fetcher).createOrder({
          channel: "crypto",
          walletAddress: "payer",
          chain: "tron",
          tokenName: "USDT",
          amount: 1,
          deviceType: "web",
        });
  it(`${kind} cancels oversized chunked responses before reading to the end`, async () => {
    let chunks = 0;
    const cancel = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream(
            {
              pull(controller) {
                chunks++;
                controller.enqueue(new Uint8Array(1024 * 1024));
              },
              cancel,
            },
            { highWaterMark: 0 },
          ),
        ),
    );
    await expect(call(fetcher)).rejects.toMatchObject({ code: "response_too_large" });
    expect(chunks).toBe(11);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it(`${kind} maps stalled response bodies to timeout without retrying`, async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ pull() {}, cancel })));
    await expect(call(fetcher, 10)).rejects.toMatchObject({ code: "timeout" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it(`${kind} keeps malformed JSON distinct from timeout`, async () => {
    await expect(call(async () => new Response("{"))).rejects.toMatchObject({
      code: "provider_error",
    });
  });
}
