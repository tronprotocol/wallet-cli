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

it.each([false, true])(
  "closes the roundtrip server after payment (failure=%s)",
  async (failure) => {
    const close = vi.fn(async () => {});
    const pay = vi.fn(async () => {
      if (failure) throw new Error("settlement failed");
      return { settled: true };
    });
    const service = new X402Service({ pay }, {} as ProviderCatalogPort, {
      validate: vi.fn(),
      start: async () => ({ details: { payUrl: "http://127.0.0.1:45678/pay" }, close }),
    });
    const result = service.roundtrip({} as never, {} as never, {
      payTo: "trusted",
      amount: "10",
      token: "USDT",
      scheme: "exact",
      host: "127.0.0.1",
      port: 0,
      facilitatorUrl: "https://facilitator.example",
    });
    if (failure) await expect(result).rejects.toThrow("settlement failed");
    else await expect(result).resolves.toMatchObject({ pay: { settled: true } });
    expect(pay).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({
        url: "http://127.0.0.1:45678/pay",
        token: "USDT",
        scheme: "exact",
        expectedPayTo: "trusted",
        exactAmount: "10",
        maxAmount: "10",
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  },
);
