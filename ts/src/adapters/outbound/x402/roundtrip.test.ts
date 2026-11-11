import { expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { X402Service } from "../../../application/use-cases/x402-service.js";
import type { SignerResolver } from "../../../application/services/signer/index.js";
import { X402PaymentClient } from "./payment-client.js";
import { X402FacilitatorClient } from "./facilitator-client.js";
import { X402PaywallHttpServer } from "../../inbound/http/x402/paywall-server.js";
import { baiPaymentResult } from "../../../application/services/bai-payment-result.js";
import { SigningService } from "../../../application/services/signing/signing-service.js";
import { evmTransactionChainId } from "../chain/evm/evm.js";
import { CommandDeadline } from "../../../application/services/command-deadline.js";

// Node answers the signing entry checks chain identity against.
const signing = new SigningService({
  get: () => ({
    referenceBlockStatus: async () => "held",
    transactionChainId: evmTransactionChainId,
  }),
} as never);

it.each([
  ["eip155:56", "56", "USDT", "10000000000000000000"],
  ["eip155:84532", "84532", "USDC", "10000000"],
  ["eip155:8453", "8453", "USDC", "10000000"],
])(
  "settles %s through the local roundtrip with the installed SDK",
  async (id, chainId, token, raw) => {
    const payer = "0x1111111111111111111111111111111111111111";
    const payTo = "0x2222222222222222222222222222222222222222";
    const transaction = "0x" + "a".repeat(64);
    const signTypedData = vi.fn(async (payload) => ({
      primaryType: payload.primaryType,
      signature: "0x" + "a".repeat(130),
    }));
    const resolver = {
      assertCanSign: vi.fn(),
      resolve: () => ({ address: payer, kind: "software", signTypedData }),
    } as unknown as SignerResolver;
    const facilitator = vi.fn(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/facilitator.example\/(verify|settle)$/);
      expect(init.redirect).toBe("error");
      expect(init.headers).not.toHaveProperty("Authorization");
      const body = JSON.parse(init.body);
      expect(body.paymentRequirements).toMatchObject({
        network: id,
        scheme: "exact",
        amount: raw,
        payTo,
      });
      expect(body.paymentPayload).toMatchObject({
        x402Version: 2,
        accepted: body.paymentRequirements,
      });
      return Response.json(
        String(url).endsWith("/verify")
          ? { isValid: true, payer }
          : { success: true, transaction, network: id, payer },
      );
    });
    const service = new X402Service(
      new X402PaymentClient(),
      resolver,
      {
        facilitator: new X402FacilitatorClient(facilitator as typeof fetch),
        requestTimeoutMs: 0,
        host: new X402PaywallHttpServer(
          () => {},
          () => {},
        ),
      },
      undefined,
      signing,
    );
    const result = await service.roundtrip(
      { activeAccount: "payer", deadline: new CommandDeadline(0), emit: vi.fn() } as never,
      { id, chainId, family: "evm" } as never,
      {
        host: "127.0.0.1",
        port: 0,
        payTo,
        amount: "10",
        token,
        scheme: "exact",
        facilitatorUrl: "https://facilitator.example",
      },
    );
    expect(new URL(String(result.serve.payUrl)).port).not.toBe("0");
    expect(result.settlement).toEqual({ success: true, transaction, network: id, payer });
    expect(baiPaymentResult({ ...result.pay, settlement: result.settlement }, id)).toEqual({
      txHash: transaction,
      payer,
    });
    expect(result.pay).not.toHaveProperty("settlement");
    expect(signTypedData).toHaveBeenCalledOnce();
    expect(facilitator).toHaveBeenCalledTimes(2);
    await expect(fetch(String(result.serve.payUrl))).rejects.toThrow();
  },
);

it.each([
  [200, { success: true }, undefined],
  [429, {}, "provider_rate_limited"],
  [500, {}, "provider_error"],
  [
    200,
    { success: false, errorReason: "permit2_allowance_required" },
    "permit2_allowance_required",
  ],
  [200, { success: false, errorReason: "provider_rate_limited" }, "provider_error"],
  [200, { success: false, httpStatus: 429 }, "provider_rate_limited"],
] as const)("reproduces settlement response %s %j", async (status, body, expectedError) => {
  const payer = "0x1111111111111111111111111111111111111111";
  const transaction = "0x" + "a".repeat(64);
  const signTypedData = vi.fn(async (payload) => ({
    primaryType: payload.primaryType,
    signature: "0x" + "a".repeat(130),
  }));
  const resolver = {
    assertCanSign: vi.fn(),
    resolve: () => ({ address: payer, kind: "ledger", signTypedData }),
  } as unknown as SignerResolver;
  const calls: string[] = [];
  const facilitator: typeof fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path === "/verify") return Response.json({ isValid: true, payer });
    return Response.json({ transaction, network: "eip155:97", payer, ...body }, { status });
  };
  const service = new X402Service(
    new X402PaymentClient(),
    resolver,
    {
      facilitator: new X402FacilitatorClient(facilitator),
      requestTimeoutMs: 0,
      host: new X402PaywallHttpServer(
        () => {},
        () => {},
      ),
    },
    undefined,
    signing,
  );
  const pending = service.roundtrip(
    {
      activeAccount: "payer",
      deadline: new CommandDeadline(0),
      emit: vi.fn(),
      warn: vi.fn(),
    } as never,
    { id: "eip155:97", chainId: "97", family: "evm" } as never,
    {
      host: "127.0.0.1",
      port: 0,
      payTo: "0x2222222222222222222222222222222222222222",
      amount: "0.01",
      token: "USDT",
      scheme: "exact",
      facilitatorUrl: "https://facilitator.example",
    },
  );
  if (expectedError)
    await expect(pending).rejects.toMatchObject({
      code: expectedError,
      details: { phase: "settle", retryPayment: false },
    });
  else await expect(pending).resolves.toMatchObject({ pay: { settled: true, delivered: true } });
  expect(signTypedData).toHaveBeenCalledOnce();
  expect(calls).toEqual(["/verify", "/settle"]);
});

it("pins a raw-amount roundtrip to the asset its own paywall serves", async () => {
  const payer = "0x1111111111111111111111111111111111111111";
  const transaction = "0x" + "a".repeat(64);
  const signTypedData = vi.fn(async (payload) => ({
    primaryType: payload.primaryType,
    signature: "0x" + "a".repeat(130),
  }));
  const resolver = {
    assertCanSign: vi.fn(),
    resolve: () => ({ address: payer, kind: "software", signTypedData }),
  } as unknown as SignerResolver;
  const facilitator: typeof fetch = async (url) =>
    Response.json(
      String(url).endsWith("/verify")
        ? { isValid: true, payer }
        : { success: true, transaction, network: "eip155:56", payer },
    );
  const service = new X402Service(
    new X402PaymentClient(),
    resolver,
    {
      facilitator: new X402FacilitatorClient(facilitator),
      requestTimeoutMs: 0,
      host: new X402PaywallHttpServer(
        () => {},
        () => {},
      ),
    },
    undefined,
    signing,
  );
  // The omitted asset uses the paywall's default token.
  const result = await service.roundtrip(
    { activeAccount: "payer", deadline: new CommandDeadline(0), emit: vi.fn() } as never,
    { id: "eip155:56", chainId: "56", family: "evm" } as never,
    {
      host: "127.0.0.1",
      port: 0,
      payTo: "0x2222222222222222222222222222222222222222",
      rawAmount: "10000000000000000",
      scheme: "exact",
      facilitatorUrl: "https://facilitator.example",
    },
  );
  expect(result.pay).toMatchObject({
    settled: true,
    payment: {
      asset: "0x55d398326f99059fF775485246999027B3197955",
      token: "USDT",
      amount: "0.01",
      rawAmount: "10000000000000000",
    },
  });
  expect(signTypedData).toHaveBeenCalledOnce();
});

it("ends a roundtrip whose settlement hangs at the deadline and closes its listener", async () => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const payer = "0x1111111111111111111111111111111111111111";
  const signTypedData = vi.fn(async (payload) => ({
    primaryType: payload.primaryType,
    signature: "0x" + "a".repeat(130),
  }));
  // Settlement never answers, even when its request is aborted.
  const facilitator: typeof fetch = async (url) =>
    String(url).endsWith("/verify")
      ? Response.json({ isValid: true, payer })
      : new Promise<Response>(() => {});
  const service = new X402Service(
    new X402PaymentClient(),
    {
      assertCanSign: vi.fn(),
      resolve: () => ({ address: payer, kind: "software", signTypedData }),
    } as never,
    {
      facilitator: new X402FacilitatorClient(facilitator),
      host: new X402PaywallHttpServer(
        () => {},
        () => {},
      ),
      requestTimeoutMs: 0,
    },
    undefined,
    signing,
  );
  const deadline = new CommandDeadline(2500);
  const started = performance.now();
  await expect(
    service.roundtrip(
      { activeAccount: "payer", deadline, emit: vi.fn(), warn: vi.fn() } as never,
      { id: "eip155:56", chainId: "56", family: "evm" } as never,
      {
        host: "127.0.0.1",
        port,
        payTo: "0x2222222222222222222222222222222222222222",
        amount: "0.01",
        token: "USDT",
        scheme: "exact",
        facilitatorUrl: "https://facilitator.example",
      },
    ),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(performance.now() - started).toBeLessThan(4000);
  await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  deadline.dispose();
});
