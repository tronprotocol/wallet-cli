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
