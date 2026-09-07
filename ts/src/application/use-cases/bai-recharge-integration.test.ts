import { expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import type { BaiApi } from "../ports/bai-api.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";
const payer = "0x1111111111111111111111111111111111111111";
const txHash = "0x" + "a".repeat(64);
const network = { id: "eip155:56", chainId: "56", family: "evm" } as const;
function fixture() {
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
    pay: vi.fn(async () => {
      calls.push("pay");
      return {
        payer: { address: payer },
        response: {
          jsonrpc: "2.0",
          id: 1,
          result: { transaction_hash: txHash, network: "eip155:56", payment_status: "settled" },
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
      amount: 10,
      rechargeTarget: target,
    }),
  );
  expect(api.reportTxHash).toHaveBeenCalledWith({
    chain: "bnb",
    amount: 10,
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
    expect(payments.pay).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        expectedPayTo: "0x060f7fd9c9622bdcf9f2887c8171d6e6b4b4ba17",
        exactAmount: amount,
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
  expect(payments.pay).not.toHaveBeenCalled();
});
it("retains paid hash and target when reporting fails", async () => {
  const { api, payments, run } = fixture();
  api.reportTxHash.mockRejectedValue(new Error("secret"));
  await expect(run("recipient")).resolves.toMatchObject({
    creditStatus: "unconfirmed",
    txHash,
    retryPayment: false,
  });
  expect(payments.pay).toHaveBeenCalledTimes(1);
});
