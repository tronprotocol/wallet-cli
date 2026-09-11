import { TransportError } from "../../domain/errors/index.js";
import { expect, it, vi } from "vitest";
import { BaiRechargeFlow } from "./bai-recharge-flow.js";
const input = {
  channel: "crypto" as const,
  chain: "bnb",
  tokenName: "USDT",
  amount: "10",
  walletAddress: "payer",
  deviceType: "web" as const,
  rechargeTarget: {
    input: { type: "personal" as const, identifier: "recipient" },
    confirmedTarget: { type: "personal" as const, targetId: "recipient-id" },
  },
};
function fixture() {
  const sequence: string[] = [];
  const api = {
    isBound: vi.fn(async () => {
      sequence.push("check");
      return true;
    }),
    bind: vi.fn(async () => ({ userId: "payer-id", address: "payer", chain: "bnb" })),
    createOrder: vi.fn(async () => {
      sequence.push("order");
      return { id: 1 };
    }),
    reportTxHash: vi.fn(async () => {
      sequence.push("report");
      return { success: true as const, order: { id: 1, points: 100000 } };
    }),
  };
  const pay = vi.fn(async () => {
    sequence.push("pay");
    return { txHash: "hash", chain: "bnb", payer: "payer" };
  });
  return { api, pay, sequence, flow: new BaiRechargeFlow(api, { pay }) };
}
it("creates the target preorder, pays once and reports without repeating setup binding checks", async () => {
  const { flow, sequence, api, pay } = fixture();
  await expect(flow.execute(input)).resolves.toMatchObject({
    txHash: "hash",
    creditStatus: "credited",
    order: { points: 100000 },
    rechargeTarget: input.rechargeTarget,
  });
  expect(sequence).toEqual(["order", "pay", "report"]);
  expect(api.reportTxHash).toHaveBeenCalledWith({
    chain: "bnb",
    txHash: "hash",
    amount: "10",
    rechargeTarget: input.rechargeTarget,
  });
  expect(pay).toHaveBeenCalledTimes(1);
});
it("does not contact binding endpoints during an already configured recharge", async () => {
  const { flow, api } = fixture();
  api.isBound.mockRejectedValue(new Error("must not query"));
  await expect(flow.execute(input)).resolves.toMatchObject({ creditStatus: "credited" });
  expect(api.isBound).not.toHaveBeenCalled();
  expect(api.bind).not.toHaveBeenCalled();
});
it("does not pay if preorder creation fails", async () => {
  const { flow, api, pay } = fixture();
  api.createOrder.mockRejectedValue(new Error("unavailable"));
  await expect(flow.execute(input)).rejects.toThrow();
  expect(pay).not.toHaveBeenCalled();
});
it("retains the transaction if reporting fails and resumes only reporting", async () => {
  const { flow, api, pay } = fixture();
  api.reportTxHash.mockRejectedValueOnce(new Error("secret"));
  const result = await flow.execute(input);
  expect(result).toMatchObject({
    txHash: "hash",
    creditStatus: "unconfirmed",
    retryPayment: false,
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  await expect(
    flow.report({
      chain: input.chain,
      txHash: result.txHash,
      amount: input.amount,
      rechargeTarget: input.rechargeTarget,
    }),
  ).resolves.toMatchObject({ creditStatus: "credited" });
  expect(pay).toHaveBeenCalledTimes(1);
  expect(api.createOrder).toHaveBeenCalledTimes(1);
});
it("does not report a transaction from a mismatched payer", async () => {
  const { flow, api, pay } = fixture();
  pay.mockResolvedValue({ txHash: "hash", chain: "bnb", payer: "other" });
  await expect(flow.execute(input)).resolves.toMatchObject({
    txHash: "hash",
    creditStatus: "unconfirmed",
    retryPayment: false,
  });
  expect(api.reportTxHash).not.toHaveBeenCalled();
});

it("never substitutes the payer ID for a missing recipient ID", async () => {
  const { flow, api, pay } = fixture();
  const request = structuredClone(input);
  request.rechargeTarget.confirmedTarget.targetId = "";
  await expect(flow.execute(request)).rejects.toMatchObject({ code: "invalid_value" });
  expect(api.isBound).not.toHaveBeenCalled();
  expect(pay).not.toHaveBeenCalled();
});
it("does not automatically retry an uncertain payment", async () => {
  const { flow, api, pay } = fixture();
  pay.mockRejectedValue(new Error("secret"));
  await expect(flow.execute(input)).rejects.toMatchObject({
    message: expect.stringContaining("reconcile"),
  });
  expect(pay).toHaveBeenCalledTimes(1);
  expect(api.reportTxHash).not.toHaveBeenCalled();
});
it("keeps the confirmed recipient stable if the payment adapter mutates its input", async () => {
  const { api } = fixture();
  const flow = new BaiRechargeFlow(api, {
    pay: async (_order, request) => {
      request.rechargeTarget!.confirmedTarget.targetId = "payer-id";
      return { txHash: "hash", chain: "bnb", payer: "payer" };
    },
  });
  await flow.execute(input);
  expect(api.reportTxHash).toHaveBeenCalledWith(
    expect.objectContaining({ rechargeTarget: input.rechargeTarget }),
  );
});

it("preserves classified errors and settlement evidence without reporting or paying again", async () => {
  const { flow, api, pay } = fixture();
  const failure = new TransportError("invalid_x402_response", "Response processing failed", {
    paymentStatus: "settled",
    txHash: "confirmed-hash",
    retryPayment: false,
  });
  pay.mockRejectedValue(failure);
  await expect(flow.execute(input)).rejects.toMatchObject({
    code: failure.code,
    details: {
      ...failure.details,
      chain: input.chain,
      amount: input.amount,
      rechargeTarget: input.rechargeTarget,
    },
  });
  expect(pay).toHaveBeenCalledOnce();
  expect(api.reportTxHash).not.toHaveBeenCalled();
});

it("retains a classified reporting failure and the paid transaction for recovery", async () => {
  const { flow, api, pay } = fixture();
  api.reportTxHash.mockRejectedValue(
    new TransportError("bai_rejected", "B.AI could not verify the transaction", {
      reason: "TX_NOT_FOUND_OR_INVALID",
      procedure: "order.reportTxHash",
      httpStatus: 400,
      retryPayment: false,
    }),
  );
  await expect(flow.execute(input)).resolves.toMatchObject({
    creditStatus: "unconfirmed",
    retryPayment: false,
    txHash: "hash",
    error: {
      code: "bai_rejected",
      message: "B.AI could not verify the transaction",
      details: { reason: "TX_NOT_FOUND_OR_INVALID" },
    },
  });
  expect(pay).toHaveBeenCalledOnce();
  expect(api.reportTxHash).toHaveBeenCalledOnce();
});
