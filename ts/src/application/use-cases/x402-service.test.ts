import { describe, expect, it, vi } from "vitest";
import { X402Service } from "./x402-service.js";
import type { X402PaymentPort } from "../ports/x402-payment.js";
import type { ProviderCatalogPort } from "../ports/provider-catalog.js";

describe("X402Service", () => {
  it("delegates payments and catalog operations through ports", async () => {
    const payment = { pay: vi.fn(async () => ({ delivered: true })) } as X402PaymentPort;
    const catalog = {
      list: vi.fn(async () => ({ results: [], pagination: {} })),
      show: vi.fn(async () => ({ fqn: "a/b" })),
      endpoints: vi.fn(async () => ({ endpoints: [] })),
      update: vi.fn(async () => ({ updated: true })),
    } as unknown as ProviderCatalogPort;
    const service = new X402Service(payment, catalog);
    const scope = {} as never;
    const network = { id: "eip155:56" } as never;

    await expect(
      service.pay(scope, network, { url: "https://example.test", method: "GET", headers: [] }),
    ).resolves.toEqual({ delivered: true });
    await service.providerList({ limit: 20, offset: 0 });
    await service.providerShow("a/b");
    await service.providerEndpoints("a/b");
    await service.providerUpdate();
    expect(catalog.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });
});
