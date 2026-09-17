import { X402HttpServer } from "../../adapters/outbound/x402/server.js";
import { expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import type { BaiApi } from "../ports/bai-api.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";
const payer = "0x1111111111111111111111111111111111111111";
const txHash = "0x" + "a".repeat(64);
const network = { id: "eip155:56", chainId: "56", family: "evm" } as const;
function fixture(
  payTo: Record<string, string> = { bnb: "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17" },
) {
  const calls: string[] = [];
  const api = {
    resolveTarget: vi.fn(async () => {
      calls.push("resolve");
      return { type: "personal" as const, targetId: "recipient-id", displayLabel: "Recipient" };
    }),
    isBound: vi.fn(),
    bind: vi.fn(),
    createOrder: vi.fn(async () => {
      calls.push("order");
      return { id: 1 };
    }),
    reportTxHash: vi.fn(async () => {
      calls.push("report");
      return { success: true as const, order: { id: 1, points: 100000 } };
    }),
  };
  const payments = {
    validate: vi.fn(),
    roundtrip: vi.fn(async () => {
      calls.push("pay");
      return {
        serve: {},
        pay: {
          settled: true,
          payer: { address: payer },
          paymentResponse: { success: true, transaction: txHash, network: "eip155:56" },
        },
      };
    }),
  };
  const service = new BaiService(
    {} as BaiApi,
    () => new Date(),
    payments,
    { isConfirmed: () => true } as unknown as BaiBindingStore,
    api,
    { facilitatorUrl: "https://facilitator.example", payTo },
  );
  const run = (to?: string, amount = "10", token = "USDT") =>
    service.recharge({ resolveAddress: () => payer } as never, network as never, {
      amount,
      token,
      apiKey: "secret",
      to,
    });
  return { api, payments, calls, run };
}
it("resolves another recipient, then reuses exactly that target for preorder and report", async () => {
  const { api, calls, run } = fixture();
  const result = await run("recipient@example.com");
  expect(calls).toEqual(["resolve", "order", "pay", "report"]);
  const target = {
    input: { type: "personal", identifier: "recipient@example.com" },
    confirmedTarget: { type: "personal", targetId: "recipient-id" },
  };
  expect(api.createOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      walletAddress: payer,
      chain: "bnb",
      tokenName: "USDT",
      amount: "10",
      rechargeTarget: target,
    }),
  );
  expect(api.reportTxHash).toHaveBeenCalledWith({
    chain: "bnb",
    amount: "10",
    txHash,
    rechargeTarget: target,
  });
  expect(result).toMatchObject({ creditStatus: "credited", txHash });
  expect(api.isBound).not.toHaveBeenCalled();
});
it.each([
  ["TRX", "14.999999", "15"],
  ["USDT", "0.999999", "1"],
  ["usdc", "0.999999", "1"],
  ["ETH", "0.000099999999999999", "0.0001"],
  ["SOL", "0.009999999", "0.01"],
])(
  "rejects %s below its minimum before resolving or creating an order",
  async (token, amount, minimum) => {
    const { run, calls } = fixture();
    await expect(run("recipient", amount, token)).rejects.toThrow(`minimum recharge is ${minimum}`);
    expect(calls).toEqual([]);
  },
);
it.each([
  ["TRX", "15"],
  ["USDT", "1"],
  ["USDC", "1"],
  ["ETH", "0.0001"],
  ["SOL", "0.01"],
  ["OTHER", "0.000001"],
])(
  "accepts the %s boundary or an unlisted token without an extra minimum",
  async (token, amount) => {
    const { run, payments } = fixture();
    await run(undefined, amount, token);
    expect(payments.roundtrip).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        facilitatorUrl: "https://facilitator.example",
        host: "127.0.0.1",
        port: 0,
        scheme: "exact",
        payTo: "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17",
        amount,
      }),
    );
  },
);
it.each([undefined, payer, payer.toUpperCase().replace("0X", "0x")])(
  "skips other-recipient resolution for self %s",
  async (to) => {
    const { api, calls, run } = fixture();
    await run(to);
    expect(calls).toEqual(["order", "pay", "report"]);
    expect(api.resolveTarget).not.toHaveBeenCalled();
    expect(api.createOrder).toHaveBeenCalledWith(
      expect.not.objectContaining({ rechargeTarget: expect.anything() }),
    );
  },
);
it("does not create an order or pay when target validation fails", async () => {
  const { api, payments, run } = fixture();
  api.resolveTarget.mockRejectedValue(new Error("invalid target"));
  await expect(run("recipient")).rejects.toThrow("invalid target");
  expect(api.createOrder).not.toHaveBeenCalled();
  expect(payments.roundtrip).not.toHaveBeenCalled();
});
it("retains paid hash and target when reporting fails", async () => {
  const { api, payments, run } = fixture();
  api.reportTxHash.mockRejectedValue(new Error("secret"));
  await expect(run("recipient")).resolves.toMatchObject({
    creditStatus: "unconfirmed",
    txHash,
    retryPayment: false,
  });
  expect(payments.roundtrip).toHaveBeenCalledTimes(1);
});

it("rejects missing trusted destinations before resolving, ordering or paying", async () => {
  const { run, calls } = fixture({});
  await expect(run("recipient@example.com")).rejects.toMatchObject({
    code: "unsupported_network_capability",
  });
  expect(calls).toEqual([]);
});

it.each([
  ["USDC", "1"],
  ["USDT", "1.0000000000000000001"],
])(
  "validates BSC token and precision before target resolution and preorder: %s %s",
  async (token, amount) => {
    const { payments, api, run } = fixture();
    const server = new X402HttpServer();
    payments.validate.mockImplementation((...args: unknown[]) =>
      server.validate(args[0] as never, args[1] as never),
    );
    await expect(run("recipient", amount, token)).rejects.toMatchObject({
      code: token === "USDT" ? "invalid_amount" : "invalid_value",
    });
    expect(api.resolveTarget).not.toHaveBeenCalled();
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(payments.roundtrip).not.toHaveBeenCalled();
  },
);

it("previews a recipient recharge without creating an order or obtaining any signature", async () => {
  const { X402Service } = await import("./x402-service.js");
  const { X402PaymentClient } = await import("../../adapters/outbound/x402/payment-client.js");
  const signing = {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => {
      throw new Error("must not unlock");
    }),
  };
  const payments = new X402Service(
    new X402PaymentClient(signing as never),
    {} as never,
    {} as never,
    new X402HttpServer(undefined, 1000, () => {}),
  );
  const api = {
    resolveTarget: vi.fn(async () => ({ targetId: "recipient-id" })),
    createOrder: vi.fn(),
    reportTxHash: vi.fn(),
  };
  const service = new BaiService(
    {} as never,
    () => new Date(),
    payments,
    { isConfirmed: () => true } as never,
    api as never,
    { facilitatorUrl: "https://fake.invalid", payTo: { bnb: payer } },
  );
  const result = await service.recharge(
    { resolveAddress: () => payer, timeoutMs: 1000 } as never,
    network as never,
    { amount: "1", token: "USDT", apiKey: "test-key", dryRun: true, to: "recipient@example.com" },
  );
  expect(result).toMatchObject({
    dryRun: true,
    rawAmount: "1000000000000000000",
    payer,
    payTo: payer,
    payment: { dryRun: true, settled: false },
    rechargeTarget: { confirmedTarget: { targetId: "recipient-id" } },
  });
  expect(api.createOrder).not.toHaveBeenCalled();
  expect(api.reportTxHash).not.toHaveBeenCalled();
  expect(signing.resolve).not.toHaveBeenCalled();
  expect(signing.assertCanSign).not.toHaveBeenCalled();
});

it("reports account ambiguity before checking binding or contacting B.AI", async () => {
  const { UsageError } = await import("../../domain/errors/index.js");
  const isConfirmed = vi.fn();
  const remote = { createOrder: vi.fn(), resolveTarget: vi.fn() };
  const service = new BaiService(
    {} as never,
    undefined,
    { validate: vi.fn(), roundtrip: vi.fn() },
    { isConfirmed } as never,
    remote as never,
    { facilitatorUrl: "https://facilitator.example", payTo: { bnb: "destination" } },
    undefined,
    undefined,
    {
      resolveAccount: () => {
        throw new UsageError("ambiguous_account", "Select an account", {
          accountIds: ["software", "watch"],
        });
      },
    },
  );
  await expect(
    service.recharge({ activeAccount: payer } as never, network as never, {
      amount: "1",
      token: "USDT",
      apiKey: "test-key",
    }),
  ).rejects.toMatchObject({
    code: "ambiguous_account",
    details: { accountIds: ["software", "watch"] },
  });
  expect(isConfirmed).not.toHaveBeenCalled();
  expect(remote.createOrder).not.toHaveBeenCalled();
  expect(remote.resolveTarget).not.toHaveBeenCalled();
});

it("checks relay configuration before creating any preorder", async () => {
  const { X402Service } = await import("./x402-service.js");
  const { X402PaymentClient } = await import("../../adapters/outbound/x402/payment-client.js");
  const { X402HttpServer } = await import("../../adapters/outbound/x402/server.js");
  const api = { createOrder: vi.fn(), reportTxHash: vi.fn() };
  const payments = new X402Service(
    new X402PaymentClient({} as never),
    {} as never,
    {} as never,
    new X402HttpServer(),
  );
  const service = new BaiService(
    {} as never,
    undefined,
    payments,
    { isConfirmed: () => true } as never,
    api as never,
    {
      facilitatorUrl: "https://fake.invalid",
      payTo: { tron: "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ" },
    },
  );
  await expect(
    service.recharge(
      { resolveAddress: () => "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ" } as never,
      { id: "tron:728126428", family: "tron", chainId: "728126428" } as never,
      {
        amount: "1",
        token: "USDT",
        apiKey: "test-key",
        gasfreeRelay: "gasfree",
        scheme: "exact_gasfree",
      },
    ),
  ).rejects.toMatchObject({ code: "gasfree_credentials_missing" });
  expect(api.createOrder).not.toHaveBeenCalled();
});

it("rejects token precision before account and binding checks", async () => {
  const isConfirmed = vi.fn();
  const resolveAddress = vi.fn();
  const resolveAccount = vi.fn();
  const createOrder = vi.fn();
  const roundtrip = vi.fn();
  const server = new X402HttpServer();
  const service = new BaiService(
    {} as never,
    undefined,
    { validate: (net, input) => server.validate(net, input), roundtrip },
    { isConfirmed } as never,
    { createOrder } as never,
    { facilitatorUrl: "https://facilitator.example", payTo: { bnb: payer } },
    undefined,
    undefined,
    { resolveAccount },
  );
  await expect(
    service.recharge({ resolveAddress } as never, network as never, {
      amount: "1.0000000000000000001",
      token: "USDT",
      apiKey: "test-key",
    }),
  ).rejects.toMatchObject({ code: "invalid_amount" });
  for (const operation of [isConfirmed, resolveAddress, resolveAccount, createOrder, roundtrip])
    expect(operation).not.toHaveBeenCalled();
});
