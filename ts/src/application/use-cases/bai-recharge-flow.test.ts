import { CommandDeadline } from "../services/command-deadline.js";
import { errorMessage, TransportError, UsageError } from "../../domain/errors/index.js";
import { expect, it, vi } from "vitest";
import { BaiRechargeFlow } from "./bai-recharge-flow.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import type { BaiRawOrder } from "../ports/bai-recharge.js";
import { baiRechargeAmount } from "../../domain/bai/recharge-policy.js";
import { errorEnvelope } from "../../adapters/inbound/cli/output/errors.js";

const NO_DEADLINE = new CommandDeadline(0);

const rawOrder = (value: object) => value as unknown as BaiRawOrder;
const input = {
  channel: "crypto" as const,
  chain: "bnb",
  tokenName: "USDT",
  amount: baiRechargeAmount("10"),
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
      return { orderId: "1" };
    }),
    reportTxHash: vi.fn(async () => {
      sequence.push("report");
      return { success: true as const, order: rawOrder({ id: 1, points: 100000 }) };
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
  await expect(flow.execute(NO_DEADLINE, input)).resolves.toMatchObject({
    txHash: "hash",
    creditStatus: "credited",
    order: { points: 100000 },
    rechargeTarget: input.rechargeTarget,
  });
  expect(sequence).toEqual(["order", "pay", "report"]);
  expect(api.reportTxHash).toHaveBeenCalledWith(
    {
      chain: "bnb",
      txHash: "hash",
      amount: baiRechargeAmount("10"),
      rechargeTarget: input.rechargeTarget,
    },
    expect.anything(),
  );
  expect(pay).toHaveBeenCalledTimes(1);
});
it("does not contact binding endpoints during an already configured recharge", async () => {
  const { flow, api } = fixture();
  api.isBound.mockRejectedValue(new Error("must not query"));
  await expect(flow.execute(NO_DEADLINE, input)).resolves.toMatchObject({
    creditStatus: "credited",
  });
  expect(api.isBound).not.toHaveBeenCalled();
  expect(api.bind).not.toHaveBeenCalled();
});
it("preserves safe text and raw JSON when attaching recharge context", async () => {
  const { flow, pay, api } = fixture();
  pay.mockRejectedValue(
    new UsageError("account_not_found", errorMessage`unknown account ${"missing\nFAKE_LOG"}`),
  );
  const error = await flow.execute(NO_DEADLINE, input).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(UsageError);
  expect((error as UsageError).textMessage).toBe("unknown account missing\\nFAKE_LOG");
  expect(errorEnvelope(error as UsageError).message).toBe("unknown account missing\nFAKE_LOG");
  expect(api.reportTxHash).not.toHaveBeenCalled();
});

it("does not pay if preorder creation fails", async () => {
  const { flow, api, pay } = fixture();
  api.createOrder.mockRejectedValue(new Error("unavailable"));
  await expect(flow.execute(NO_DEADLINE, input)).rejects.toThrow();
  expect(pay).not.toHaveBeenCalled();
});
it("retains the transaction if reporting fails and resumes only reporting", async () => {
  const { flow, api, pay } = fixture();
  api.reportTxHash.mockRejectedValueOnce(new Error("secret"));
  const result = await flow.execute(NO_DEADLINE, input);
  expect(result).toMatchObject({
    txHash: "hash",
    creditStatus: "unconfirmed",
    retryPayment: false,
  });
  expect(JSON.stringify(result)).not.toContain("secret");
  await expect(
    flow.report(NO_DEADLINE, {
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
  await expect(flow.execute(NO_DEADLINE, input)).resolves.toMatchObject({
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
  await expect(flow.execute(NO_DEADLINE, request)).rejects.toMatchObject({ code: "invalid_value" });
  expect(api.isBound).not.toHaveBeenCalled();
  expect(pay).not.toHaveBeenCalled();
});
it("does not automatically retry an uncertain payment", async () => {
  const { flow, api, pay } = fixture();
  pay.mockRejectedValue(new Error("secret"));
  await expect(flow.execute(NO_DEADLINE, input)).rejects.toMatchObject({
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
  await flow.execute(NO_DEADLINE, input);
  expect(api.reportTxHash).toHaveBeenCalledWith(
    expect.objectContaining({ rechargeTarget: input.rechargeTarget }),
    expect.anything(),
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
  await expect(flow.execute(NO_DEADLINE, input)).rejects.toMatchObject({
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
  await expect(flow.execute(NO_DEADLINE, input)).resolves.toMatchObject({
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
it("creates no preorder when too little of the command's time is left to submit", async () => {
  const { flow, api, pay } = fixture();
  const deadline = new CommandDeadline(1999);
  await expect(flow.execute(deadline, input)).rejects.toMatchObject({ code: "timeout" });
  expect(api.createOrder).not.toHaveBeenCalled();
  expect(pay).not.toHaveBeenCalled();
  deadline.dispose();
});

it.each([
  ["a classified failure", new TransportError("provider_error", "relay failed")],
  ["an unclassified failure", new Error("boom")],
])("keeps the created preorder's id when payment ends in %s", async (_case, failure) => {
  const { flow, pay, api } = fixture();
  pay.mockRejectedValueOnce(failure);
  await expect(flow.execute(NO_DEADLINE, input)).rejects.toMatchObject({
    details: { orderId: "1", paymentStatus: "unknown", outcome: "unknown", retryPayment: false },
  });
  expect(api.reportTxHash).not.toHaveBeenCalled();
});

it.each([
  [
    "a payment reported as not sent",
    new TransportError("provider_error", "no signer", { paymentStatus: "not_sent" }),
  ],
  ["a deadline refusal before dispatch", new DeadlineExpiredError()],
])("does not mark %s as an unknown outcome", async (_case, failure) => {
  const { flow, pay } = fixture();
  pay.mockRejectedValueOnce(failure);
  const error = (await flow.execute(NO_DEADLINE, input).catch((e: unknown) => e)) as {
    details: object;
  };
  expect(error.details).toMatchObject({ paymentStatus: "not_sent", orderId: "1" });
  expect(error.details).not.toHaveProperty("outcome");
});

it("reports no order id when B.AI returned none", async () => {
  const { flow, pay, api } = fixture();
  api.createOrder.mockResolvedValueOnce({} as never);
  pay.mockRejectedValueOnce(new TransportError("provider_error", "relay failed"));
  const error = await flow.execute(NO_DEADLINE, input).catch((e: unknown) => e);
  expect((error as TransportError).details).not.toHaveProperty("orderId");
});
