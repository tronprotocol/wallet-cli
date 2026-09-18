import { expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { gasfreeRelayClient } from "./gasfree-relay.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
const network = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  gasfree: { baseUrl: "https://open-test.gasfree.io", apiPrefix: "/nile" },
} as NetworkDescriptor;
it("keeps official credential-free and rejects missing Open API credentials early", () => {
  const fetcher = vi.fn();
  expect(gasfreeRelayClient(network, undefined, {}, 1000, fetcher)).toBeUndefined();
  expect(() => gasfreeRelayClient(network, "gasfree", {}, 1000, fetcher)).toThrow(
    expect.objectContaining({ code: "gasfree_credentials_missing" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("signs only the configured GasFree Open API path and never leaks credentials to custom relays", async () => {
  const fetcher = vi.fn(async () => Response.json({ code: 200, data: { providers: [] } }));
  const creds = { gasfreeApiKey: "test-key", gasfreeApiSecret: "test-secret" };
  await gasfreeRelayClient(network, "gasfree", creds, 1000, fetcher)!.getProviders();
  const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
  expect(url).toBe("https://open-test.gasfree.io/nile/api/v1/config/provider/all");
  const headers = init.headers as Record<string, string>;
  const sig = createHmac("sha256", "test-secret")
    .update(`GET/nile/api/v1/config/provider/all${headers.Timestamp}`)
    .digest("base64");
  expect(headers.Authorization).toBe(`ApiKey test-key:${sig}`);
  fetcher.mockClear();
  await gasfreeRelayClient(
    network,
    "https://relay.example/nile",
    creds,
    1000,
    fetcher,
  )!.getProviders();
  const customInit = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(customInit.headers).not.toHaveProperty("Authorization");
});
it("does not fall back after the selected relay fails", async () => {
  const fetcher = vi.fn(async () => new Response("SECRET", { status: 503 }));
  await expect(
    gasfreeRelayClient(network, "https://relay.example", {}, 1000, fetcher)!.getProviders(),
  ).rejects.toMatchObject({ code: "provider_error", details: { retryPayment: false } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  "http://relay.example",
  "https://user:secret@relay.example",
  "https://relay.example?key=secret",
])("rejects unsafe relay URL %s", (url) => {
  expect(() => gasfreeRelayClient(network, url, {}, 1000, vi.fn())).toThrow(
    expect.objectContaining({ code: "invalid_value" }),
  );
});

/**
 * A selected relay's failures used to collapse into one `provider_error`, so a script could not
 * tell a rate limit from a timeout from a malformed answer. Each keeps its class and the safe
 * retry metadata; none echoes the relay's text, and none falls back to another relay.
 */
const relay = (fetcher: typeof fetch, timeout = 1000) =>
  gasfreeRelayClient(network, "https://relay.example", {}, timeout, fetcher)!;

it("classifies HTTP 429 as provider_rate_limited with a numeric Retry-After only", async () => {
  const fetcher = vi.fn(
    async () => new Response("SECRET", { status: 429, headers: { "retry-after": "7" } }),
  );
  await expect(relay(fetcher as typeof fetch).getProviders()).rejects.toMatchObject({
    code: "provider_rate_limited",
    details: { httpStatus: 429, retryAfterSeconds: 7, retryPayment: false },
  });
  const bad = vi.fn(
    async () => new Response("SECRET", { status: 429, headers: { "retry-after": "Wed, 21 Oct" } }),
  );
  const error = await relay(bad as typeof fetch)
    .getProviders()
    .catch((e) => e);
  expect(error.details).not.toHaveProperty("retryAfterSeconds");
  expect(JSON.stringify(error)).not.toContain("SECRET");
});

it("keeps other HTTP failures as provider_error with the status, without the body", async () => {
  const fetcher = vi.fn(async () => new Response("SECRET", { status: 503 }));
  const error = await relay(fetcher as typeof fetch)
    .getProviders()
    .catch((e) => e);
  expect(error).toMatchObject({
    code: "provider_error",
    details: { httpStatus: 503, retryPayment: false },
  });
  expect(JSON.stringify(error)).not.toContain("SECRET");
});

it("keeps a transport timeout as timeout", async () => {
  const fetcher = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      }),
  );
  await expect(relay(fetcher as unknown as typeof fetch, 5).getProviders()).rejects.toMatchObject({
    code: "timeout",
    details: { retryPayment: false },
  });
});

it("keeps an oversized body as response_too_large", async () => {
  const fetcher = vi.fn(async () => new Response("x".repeat(11 * 1024 * 1024), { status: 200 }));
  await expect(relay(fetcher as typeof fetch).getProviders()).rejects.toMatchObject({
    code: "response_too_large",
    details: { retryPayment: false },
  });
});

it.each([
  ["not JSON", () => new Response("<html>", { status: 200 })],
  ["a non-200 envelope code", () => Response.json({ code: 500, data: {} })],
  ["a missing data object", () => Response.json({ code: 200, data: [] })],
])("reports %s as invalid_x402_response", async (_label, make) => {
  const fetcher = vi.fn(async () => make());
  await expect(relay(fetcher as typeof fetch).getProviders()).rejects.toMatchObject({
    code: "invalid_x402_response",
    details: { retryPayment: false },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
