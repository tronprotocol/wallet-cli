import { describe, expect, it, vi } from "vitest";
import { X402Service } from "./x402-service.js";
import type { ProviderCatalogPort } from "../ports/provider-catalog.js";
import type { X402Inspection, X402PaidResult } from "../ports/x402-payment.js";
import type { X402ServeDetails } from "../ports/x402-server.js";
import type { SignerResolver } from "../services/signer/index.js";
import { WalletError } from "../../domain/errors/index.js";
import { processBroadcastGuard } from "../services/broadcast-guard.js";

const scope = { activeAccount: "payer" } as never;
const network = { id: "eip155:56", family: "evm" } as never;
const input = { url: "https://example.test", method: "GET", headers: [] };

function fixture(failure?: "prepare" | "resolve" | "pay") {
  const pay = vi.fn(async () => {
    if (failure === "pay") throw new Error("settlement failed");
    return { settled: true } as X402PaidResult;
  });
  const close = vi.fn(async () => {});
  const request = vi.fn(async () => ({
    kind: "payment-required" as const,
    inspection: { dryRun: true } as X402Inspection,
    facts: { tokenDecimals: () => undefined },
    pay,
    close,
  }));
  const signers = {
    assertCanSign: vi.fn(),
    prepare: vi.fn(() => {
      if (failure === "prepare") throw new WalletError("watch_only_no_signer", "cannot sign");
    }),
    resolve: vi.fn(() => {
      if (failure === "resolve") throw new WalletError("watch_only_no_signer", "cannot sign");
      return { address: "payer", kind: "software", sign: vi.fn(), signTypedData: vi.fn() };
    }),
  };
  const catalog = {
    list: vi.fn(async () => ({ results: [], pagination: {} })),
    show: vi.fn(async () => ({ fqn: "a/b" })),
    endpoints: vi.fn(async () => ({ endpoints: [] })),
    update: vi.fn(async () => ({ updated: true })),
  } as unknown as ProviderCatalogPort;
  const serverClose = vi.fn(async () => {});
  const service = new X402Service(
    { request },
    signers as unknown as SignerResolver,
    catalog,
    { resolve: vi.fn() },
    {
      validate: vi.fn(),
      start: async () => ({
        details: { payUrl: input.url } as X402ServeDetails,
        close: serverClose,
      }),
    },
  );
  return { service, request, pay, close, signers, catalog, serverClose };
}

describe("X402Service", () => {
  it.each([false, true])("selects the operation in application (dryRun=%s)", async (dryRun) => {
    const f = fixture();
    await expect(f.service.pay(scope, network, { ...input, dryRun })).resolves.toEqual(
      dryRun ? { dryRun: true } : { settled: true },
    );
    expect(f.request).toHaveBeenCalledWith(scope, network, input);
    expect(f.pay).toHaveBeenCalledTimes(dryRun ? 0 : 1);
    expect(f.signers.assertCanSign).toHaveBeenCalledTimes(dryRun ? 0 : 1);
    expect(f.signers.resolve).toHaveBeenCalledTimes(dryRun ? 0 : 1);
    expect(f.signers.prepare).not.toHaveBeenCalled();
    if (!dryRun)
      expect(f.pay).toHaveBeenCalledWith({
        payer: {
          address: "payer",
          signTypedData: expect.any(Function),
          signTransaction: expect.any(Function),
          signPermit2Approval: expect.any(Function),
        },
        approver: { approve: expect.any(Function) },
        guard: processBroadcastGuard,
      });
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("fails closed when a payment needs an approval and no approval path is wired", async () => {
    const f = fixture();
    await f.service.pay(scope, network, input);
    const [{ approver }] = f.pay.mock.calls[0] as unknown as [
      { approver: { approve(request: unknown): Promise<unknown> } },
    ];
    await expect(approver.approve({})).rejects.toMatchObject({ code: "internal_error" });
  });

  it("prepares credentials only on explicit prepare", () => {
    const f = fixture();
    f.service.prepare(scope, network);
    expect(f.signers.prepare).toHaveBeenCalledWith("payer", "evm");
    expect(f.request).not.toHaveBeenCalled();
  });

  it("classifies preparation failures before any HTTP request", () => {
    const f = fixture("prepare");
    expect(() => f.service.prepare(scope, network)).toThrow(
      expect.objectContaining({
        code: "watch_only_no_signer",
        details: { phase: "sign", paymentStatus: "not_sent", retryPayment: false },
      }),
    );
    expect(f.request).not.toHaveBeenCalled();
  });

  it("releases the resource when payer creation fails", async () => {
    const f = fixture("resolve");
    await expect(f.service.pay(scope, network, input)).rejects.toMatchObject({
      code: "watch_only_no_signer",
      details: { phase: "create_payment", paymentStatus: "not_sent", retryPayment: false },
    });
    expect(f.pay).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("delegates catalog operations", async () => {
    const { service, catalog } = fixture();
    await service.providerList({ limit: 20, offset: 0 });
    await service.providerShow("a/b");
    await service.providerEndpoints("a/b");
    await service.providerUpdate();
    expect(catalog.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });
});

it.each([undefined, "pay", "resolve"] as const)(
  "closes the roundtrip server (failure=%s)",
  async (failure) => {
    const f = fixture(failure);
    const result = f.service.roundtrip(scope, network, {
      payTo: "trusted",
      amount: "10",
      token: "USDT",
      scheme: "exact",
      host: "127.0.0.1",
      port: 0,
      facilitatorUrl: "https://facilitator.example",
    });
    if (failure) await expect(result).rejects.toThrow();
    else await expect(result).resolves.toMatchObject({ pay: { settled: true } });
    expect(f.request).toHaveBeenCalledWith(
      scope,
      network,
      expect.objectContaining({
        url: input.url,
        token: "USDT",
        scheme: "exact",
        expectedPayTo: "trusted",
        exactAmount: "10",
        maxAmount: "10",
      }),
    );
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.serverClose).toHaveBeenCalledOnce();
  },
);

it("inspects roundtrip without preparing or obtaining a payer", async () => {
  const f = fixture();
  await expect(
    f.service.roundtrip(scope, network, {
      payTo: "trusted",
      amount: "10",
      token: "USDT",
      scheme: "exact",
      dryRun: true,
      host: "127.0.0.1",
      port: 0,
      facilitatorUrl: "https://facilitator.example",
    }),
  ).resolves.toMatchObject({ pay: { dryRun: true } });
  expect(f.signers.prepare).not.toHaveBeenCalled();
  expect(f.signers.resolve).not.toHaveBeenCalled();
  expect(f.pay).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.serverClose).toHaveBeenCalledOnce();
});
