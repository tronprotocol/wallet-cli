import { expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { gasfreeRelayClient } from "./gasfree-relay.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));
const network = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  gasfree: { baseUrl: "https://open-test.gasfree.io", apiPrefix: "/nile" },
} as NetworkDescriptor;
it("keeps official credential-free and rejects missing Open API credentials early", () => {
  const fetcher = vi.fn();
  expect(gasfreeRelayClient(network, undefined, {}, NO_CHECK, fetcher)).toBeDefined();
  expect(() => gasfreeRelayClient(network, "gasfree", {}, NO_CHECK, fetcher)).toThrow(
    expect.objectContaining({ code: "gasfree_credentials_missing" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("signs only the configured GasFree Open API path and never leaks credentials to custom relays", async () => {
  const fetcher = vi.fn(async () => Response.json({ code: 200, data: { providers: [] } }));
  const creds = { gasfreeApiKey: "test-key", gasfreeApiSecret: "test-secret" };
  await gasfreeRelayClient(network, "gasfree", creds, NO_CHECK, fetcher)!.getProviders();
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
    NO_CHECK,
    fetcher,
  )!.getProviders();
  const customInit = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(customInit.headers).not.toHaveProperty("Authorization");
});
it("does not fall back after the selected relay fails", async () => {
  const fetcher = vi.fn(async () => new Response("SECRET", { status: 503 }));
  await expect(
    gasfreeRelayClient(network, "https://relay.example", {}, NO_CHECK, fetcher)!.getProviders(),
  ).rejects.toMatchObject({ code: "provider_error", details: { retryPayment: false } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  "http://relay.example",
  "https://user:secret@relay.example",
  "https://relay.example?key=secret",
])("rejects unsafe relay URL %s", (url) => {
  expect(() => gasfreeRelayClient(network, url, {}, NO_CHECK, vi.fn())).toThrow(
    expect.objectContaining({ code: "invalid_value" }),
  );
});

const relay = (fetcher: typeof fetch, check: DispatchCheck = NO_CHECK) =>
  gasfreeRelayClient(network, "https://relay.example", {}, check, fetcher)!;

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
  await expect(
    relay(
      fetcher as unknown as typeof fetch,
      requestDispatchCheck(new CommandDeadline(50)),
    ).getProviders(),
  ).rejects.toMatchObject({
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

it("reads the official relay under the command deadline and sends nothing after expiry", async () => {
  const global = vi.fn(async () => Response.json({ code: 200, data: { providers: [] } }));
  vi.stubGlobal("fetch", global);
  try {
    const deadline = new CommandDeadline(60_000);
    const relay = gasfreeRelayClient(
      network,
      "official",
      {},
      requestDispatchCheck(deadline),
      vi.fn(),
    )!;
    await relay.getProviders();
    const [url, init] = global.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://facilitator.bankofai.io/nile/api/v1/config/provider/all");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const expired = new CommandDeadline(1, 0, { now: () => 10 });
    await expect(
      gasfreeRelayClient(
        network,
        undefined,
        {},
        requestDispatchCheck(expired),
        vi.fn(),
      )!.getAddressInfo("TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ"),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(global).toHaveBeenCalledTimes(1);
    deadline.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("leaves the official relay to the SDK for networks it does not serve", () => {
  expect(
    gasfreeRelayClient(
      { ...network, id: "tron:1", chainId: "1" },
      undefined,
      {},
      NO_CHECK,
      vi.fn(),
    ),
  ).toBeUndefined();
});
