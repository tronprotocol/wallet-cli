import { CommandDeadline } from "../services/command-deadline.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import { describe, expect, it, vi } from "vitest";
import { X402Service } from "./x402-service.js";
import type { X402Inspection, X402PaidResult } from "../ports/x402-payment.js";
import type { X402ServeDetails } from "../ports/x402-server.js";
import type { SignerResolver } from "../services/signer/index.js";
import { ExecutionError, WalletError } from "../../domain/errors/index.js";
import { BaiRechargeFlow } from "./bai-recharge-flow.js";
import { processBroadcastGuard } from "../services/broadcast-guard.js";

const NO_DEADLINE = new CommandDeadline(0);

const scope = { deadline: NO_DEADLINE, activeAccount: "payer" } as never;
const network = { id: "eip155:56", family: "evm" } as never;
const input = { url: "https://example.test", method: "GET", headers: [] };
const PAY_TO = "0x2222222222222222222222222222222222222222";

function fixture(failure?: "prepare" | "resolve" | "pay") {
  const pay = vi.fn(async () => {
    if (failure === "pay") throw new Error("settlement failed");
    return { settled: true } as X402PaidResult;
  });
  const close = vi.fn(async () => {});
  const request = vi.fn(async () => ({
    kind: "payment-required" as const,
    inspection: { dryRun: true, selected: { asset: "0xasset", amount: "1" } } as X402Inspection,
    pay,
    close,
  }));
  const facts = vi.fn(() => ({ tokenDecimals: (): number | undefined => undefined }));
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
  const serverClose = vi.fn(async () => {});
  const start = vi.fn(async () => ({
    details: { payUrl: input.url, asset: "0xasset", rawAmount: "10000000" } as X402ServeDetails,
    close: serverClose,
  }));
  const service = new X402Service({ request, facts }, signers as unknown as SignerResolver, {
    facilitator: {
      assetBySymbol: () => ({ symbol: "USDT", address: "0xasset", decimals: 6 }),
      assetByAddress: () => undefined,
      offer: vi.fn(),
    },
    host: { start },
    requestTimeoutMs: 0,
  });
  return { service, request, pay, close, signers, serverClose, start, facts };
}

describe("X402Service", () => {
  it.each(["0", (1n << 256n).toString()])(
    "refuses a GasFree raw fee ceiling of %s before any request",
    async (maxGasfreeFeeRaw) => {
      const f = fixture();
      await expect(
        f.service.pay(scope, network, { ...input, maxGasfreeFeeRaw }),
      ).rejects.toMatchObject({ code: "invalid_amount" });
      expect(f.request).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])("selects the operation in application (dryRun=%s)", async (dryRun) => {
    const f = fixture();
    await expect(f.service.pay(scope, network, { ...input, dryRun })).resolves.toMatchObject(
      dryRun ? { dryRun: true } : { settled: true },
    );
    expect(f.request).toHaveBeenCalledWith(scope, network, input, expect.anything());
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
        submit: { signal: expect.any(AbortSignal), assertDispatchable: expect.any(Function) },
        limits: { gasfreeFeeCapped: false },
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
});

it.each([undefined, "pay", "resolve"] as const)(
  "closes the roundtrip server (failure=%s)",
  async (failure) => {
    const f = fixture(failure);
    const result = f.service.roundtrip(scope, network, {
      payTo: PAY_TO,
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
        expectedPayTo: PAY_TO,
        asset: "0xasset",
        exactRawAmount: "10000000",
      }),
      expect.anything(),
    );
    expect(f.start).toHaveBeenCalledWith(
      expect.anything(),
      {
        host: "127.0.0.1",
        port: 0,
        accessLog: "diagnostic",
        daemon: false,
        persistent: false,
      },
      NO_DEADLINE,
    );
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.serverClose).toHaveBeenCalledOnce();
  },
);

it("inspects roundtrip without preparing or obtaining a payer", async () => {
  const f = fixture();
  await expect(
    f.service.roundtrip(scope, network, {
      payTo: PAY_TO,
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

describe("payer limits", () => {
  function limited(selectedAmount: string, decimals: number | undefined) {
    const pay = vi.fn(async () => ({ settled: true }) as X402PaidResult);
    const close = vi.fn(async () => {});
    const request = vi.fn(async () => ({
      kind: "payment-required" as const,
      inspection: {
        dryRun: true,
        selected: { asset: "0xasset", amount: selectedAmount },
      } as unknown as X402Inspection,
      pay,
      close,
    }));
    const signers = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => ({ address: "payer", kind: "software" })),
    };
    const service = new X402Service(
      { request, facts: () => ({ tokenDecimals: () => decimals }) },
      signers as unknown as SignerResolver,
    );
    return { service, request, pay, close };
  }

  it("converts a whole-token ceiling with the selected asset's precision", async () => {
    const f = limited("1000000", 6);
    await f.service.pay(scope, network, { ...input, maxAmount: "1" });
    expect(f.pay).toHaveBeenCalledWith(
      expect.objectContaining({
        limits: { maxRawAmount: "1000000", limitAsset: "0xasset", gasfreeFeeCapped: false },
      }),
    );
    expect((f.request.mock.calls[0] as unknown[])[2]).not.toHaveProperty("maxAmount");
  });

  it.each([
    [{ maxAmount: "0.999999" }, "amount_exceeds_limit"],
    [{ maxRawAmount: "999999", token: "USDT" }, "amount_exceeds_limit"],
  ])("refuses %j before signing, in dry-run as well", async (limit, code) => {
    for (const dryRun of [false, true]) {
      const f = limited("1000000", 6);
      await expect(
        f.service.pay(scope, network, { ...input, ...limit, dryRun }),
      ).rejects.toMatchObject({
        code,
        details: { phase: "challenge", paymentStatus: "not_sent", retryPayment: false },
      });
      expect(f.pay).not.toHaveBeenCalled();
      expect(f.close).toHaveBeenCalledOnce();
    }
  });

  it("needs a known precision for a whole-token ceiling", async () => {
    const f = limited("1", undefined);
    await expect(f.service.pay(scope, network, { ...input, maxAmount: "1" })).rejects.toMatchObject(
      {
        code: "invalid_option",
        message: "maxAmount requires a known token or explicit decimals",
        details: { paymentStatus: "not_sent" },
      },
    );
  });

  it.each([
    [{ maxRawAmount: "1" }, "invalid_option"],
    [{ maxRawAmount: "0", token: "USDT" }, "invalid_amount"],
    [{ maxAmount: "0" }, "invalid_amount"],
    [{ asset: "0xasset", decimals: 19 }, "invalid_value"],
  ])("refuses %j before any request", async (extra, code) => {
    const f = limited("1", 6);
    await expect(f.service.pay(scope, network, { ...input, ...extra })).rejects.toMatchObject({
      code,
    });
    expect(f.request).not.toHaveBeenCalled();
  });

  it("records a GasFree fee ceiling for the payment adapter", async () => {
    const f = limited("1", 6);
    await f.service.pay(scope, network, { ...input, maxGasfreeFeeRaw: "5" });
    expect(f.pay).toHaveBeenCalledWith(
      expect.objectContaining({ limits: { gasfreeFeeCapped: true } }),
    );
  });
});

describe("roundtrip failures before the payment request", () => {
  const roundtripInput = {
    payTo: PAY_TO,
    amount: "10",
    token: "USDT",
    scheme: "exact" as const,
    host: "127.0.0.1",
    port: 0,
    facilitatorUrl: "https://facilitator.example",
  };
  const recharge = (service: X402Service) =>
    new BaiRechargeFlow(
      { createOrder: async () => ({ orderId: "order-1" }), reportTxHash: vi.fn() },
      {
        pay: async () => {
          await service.roundtrip(scope, network, roundtripInput);
          throw new Error("unreachable");
        },
      },
    ).execute(NO_DEADLINE, {
      channel: "crypto",
      chain: "bnb",
      tokenName: "USDT",
      amount: "10",
      walletAddress: "payer",
      deviceType: "web",
    } as never);

  it.each([
    ["a port in use", new ExecutionError("port_in_use", "in use"), "port_in_use"],
    ["an unclassified error", new Error("EACCES"), "internal_error"],
    ["a deadline refusal", new DeadlineExpiredError(), "timeout"],
  ])("reports a paywall host start failure (%s) as not sent", async (_case, failure, code) => {
    const f = fixture();
    f.start.mockRejectedValueOnce(failure);
    const error = (await recharge(f.service).catch((e: unknown) => e)) as {
      code: string;
      details: object;
    };
    expect(error).toMatchObject({
      code,
      details: { paymentStatus: "not_sent", retryPayment: false, orderId: "order-1" },
    });
    expect(error.details).not.toHaveProperty("outcome");
    expect(error instanceof DeadlineExpiredError).toBe(failure instanceof DeadlineExpiredError);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("reports a limit check failure before the paid request as not sent", async () => {
    const f = fixture();
    f.facts.mockReturnValue({ tokenDecimals: () => 18 });
    const error = (await f.service
      .roundtrip(scope, network, {
        ...roundtripInput,
        token: undefined,
        asset: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 6,
      })
      .catch((e: unknown) => e)) as { code: string; details: object };
    expect(error).toMatchObject({
      code: "invalid_option",
      details: { paymentStatus: "not_sent", retryPayment: false },
    });
    expect(error.details).not.toHaveProperty("outcome");
    expect(f.start).toHaveBeenCalledOnce();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.serverClose).toHaveBeenCalledOnce();
  });

  it("reports a submit-admission refusal before the paid request as not sent", async () => {
    const f = fixture();
    const deadline = new CommandDeadline(1999);
    const error = (await f.service
      .roundtrip({ deadline, activeAccount: "payer" } as never, network, roundtripInput)
      .catch((e: unknown) => e)) as { code: string; details: object };
    deadline.dispose();
    expect(error).toMatchObject({
      code: "timeout",
      details: { phase: "payment_request", paymentStatus: "not_sent", retryPayment: false },
    });
    expect(error).toBeInstanceOf(DeadlineExpiredError);
    expect(error.details).not.toHaveProperty("outcome");
    expect(f.pay).not.toHaveBeenCalled();
  });

  it("reports a pay submit-admission refusal with its phase and payment status", async () => {
    const f = fixture();
    const deadline = new CommandDeadline(1999);
    const error = (await f.service
      .pay({ deadline, activeAccount: "payer" } as never, network, input)
      .catch((e: unknown) => e)) as { code: string; details: object };
    deadline.dispose();
    expect(error).toBeInstanceOf(DeadlineExpiredError);
    expect(error).toMatchObject({
      code: "timeout",
      details: { phase: "payment_request", paymentStatus: "not_sent", retryPayment: false },
    });
    expect(error.details).not.toHaveProperty("outcome");
    expect(f.pay).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledOnce();
  });
});
