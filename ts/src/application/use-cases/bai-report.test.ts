import { CommandDeadline } from "../services/command-deadline.js";
import { expect, it, vi } from "vitest";
import { BaiRechargeFlow, reportBaiTransaction } from "./bai-recharge-flow.js";
import { TransportError } from "../../domain/errors/index.js";
import { DeadlineExpiredError } from "../contracts/deadline.js";
import type { BaiRawOrder, BaiReportDelay, BaiReportResult } from "../ports/bai-recharge.js";
import { baiRechargeAmount } from "../../domain/bai/recharge-policy.js";

const NO_DEADLINE = new CommandDeadline(0);

const rawOrder = (value: object) => value as unknown as BaiRawOrder;
function delay(): BaiReportDelay & { now(): number } {
  let now = 0;
  return {
    initialDelayMs: 15000,
    now: () => now,
    wait: vi.fn(async (ms) => {
      now += ms;
    }),
  };
}
const target = {
  input: { type: "personal" as const, identifier: "recipient@example.com" },
  confirmedTarget: { type: "personal" as const, targetId: "original" },
};
const request = {
  chain: "tron",
  txHash: "a".repeat(64),
  amount: baiRechargeAmount("1"),
  rechargeTarget: target,
};
const order = {
  channel: "crypto" as const,
  chain: "tron",
  amount: baiRechargeAmount("1"),
  tokenName: "USDT",
  walletAddress: "payer",
  deviceType: "web" as const,
  rechargeTarget: target,
};
it("waits for indexing, then reports the payment once without recreating or repaying", async () => {
  const wait = delay();
  const reportTxHash = vi.fn(async (input: unknown) => {
    expect(wait.now()).toBe(15000);
    expect(input).toEqual(request);
    return { success: true as const, order: rawOrder({ id: 1 }) };
  });
  const createOrder = vi.fn(async () => ({ orderId: "1" }));
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  const flow = new BaiRechargeFlow({ createOrder, reportTxHash }, { pay }, wait);
  await expect(flow.execute(NO_DEADLINE, order)).resolves.toMatchObject({
    creditStatus: "credited",
    txHash: request.txHash,
    retryPayment: false,
  });
  expect(createOrder).toHaveBeenCalledOnce();
  expect(pay).toHaveBeenCalledOnce();
  expect(reportTxHash).toHaveBeenCalledOnce();
  expect(wait.wait).toHaveBeenCalledExactlyOnceWith(15000, NO_DEADLINE.signal);
});
it("does not retry when B.AI has not indexed the transaction; the hash and reason are returned", async () => {
  const wait = delay();
  const reportTxHash = vi
    .fn<(...args: unknown[]) => Promise<BaiReportResult>>()
    .mockResolvedValue({ success: false, code: "TX_NOT_FOUND_OR_INVALID", message: "not yet" });
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  const flow = new BaiRechargeFlow({ createOrder: async () => ({}), reportTxHash }, { pay }, wait);
  await expect(flow.execute(NO_DEADLINE, order)).resolves.toMatchObject({
    ...request,
    creditStatus: "unconfirmed",
    code: "TX_NOT_FOUND_OR_INVALID",
    warning: {
      message:
        "B.AI has not indexed the transaction yet; report it again in a minute with `bai-report-recharge`",
      parts: expect.arrayContaining([{ followUp: "bai-report-recharge" }]),
    },
    retryPayment: false,
  });
  expect(reportTxHash).toHaveBeenCalledOnce();
});
it("keeps B.AI's own reason when a report-only recovery is not found", async () => {
  const reportTxHash = vi.fn(async () => ({
    success: false as const,
    code: "TX_NOT_FOUND_OR_INVALID",
    message: "not yet",
  }));
  await expect(reportBaiTransaction(NO_DEADLINE, { reportTxHash }, request)).resolves.toMatchObject(
    {
      code: "TX_NOT_FOUND_OR_INVALID",
      warning: "not yet",
    },
  );
});
it("does not pause before a report-only recovery", async () => {
  const reportTxHash = vi.fn(async () => ({ success: true as const, order: rawOrder({ id: 1 }) }));
  await expect(reportBaiTransaction(NO_DEADLINE, { reportTxHash }, request)).resolves.toMatchObject(
    {
      creditStatus: "credited",
    },
  );
  expect(reportTxHash).toHaveBeenCalledExactlyOnceWith(request, expect.anything());
});
it("turns a transport error into an unconfirmed result that keeps the hash", async () => {
  const reportTxHash = vi
    .fn()
    .mockRejectedValue(
      new TransportError("provider_rate_limited", "slow down", { retryAfterMs: 7000 }),
    );
  await expect(reportBaiTransaction(NO_DEADLINE, { reportTxHash }, request)).resolves.toMatchObject(
    {
      ...request,
      creditStatus: "unconfirmed",
      code: "provider_rate_limited",
      error: { details: { retryAfterMs: 7000 } },
      retryPayment: false,
      warning: expect.stringContaining("Do not pay again"),
    },
  );
});
it("preserves the original recipient even if an adapter mutates its input", async () => {
  const reportTxHash = vi.fn(async (input) => {
    input.rechargeTarget.confirmedTarget.targetId = "changed";
    return { success: true as const, order: rawOrder({ id: 1 }) };
  });
  await expect(reportBaiTransaction(NO_DEADLINE, { reportTxHash }, request)).resolves.toMatchObject(
    {
      rechargeTarget: target,
    },
  );
});
it("keeps the paid hash and dispatches no report when the deadline ends the indexing wait", async () => {
  let now = 0;
  const deadline = new CommandDeadline(10_000, 0, { now: () => now });
  const reportTxHash = vi.fn(async () => ({ success: true as const, order: rawOrder({ id: 1 }) }));
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  // The deadline aborts the wait: the clock passes the limit and the wait rejects.
  const wait = vi.fn(async () => {
    now = 10_000;
    throw new Error("aborted");
  });
  const flow = new BaiRechargeFlow(
    { createOrder: async () => ({}), reportTxHash },
    { pay },
    { initialDelayMs: 60_000, wait },
  );

  await expect(flow.execute(deadline, order)).resolves.toMatchObject({
    ...request,
    creditStatus: "unconfirmed",
    code: "timeout",
    retryPayment: false,
    warning: { parts: expect.arrayContaining([{ followUp: "bai-report-recharge" }]) },
  });
  expect(pay).toHaveBeenCalledOnce();
  expect(reportTxHash).not.toHaveBeenCalled();
  deadline.dispose();
});
it("tells the caller to report later when the report is refused before dispatch", async () => {
  const reportTxHash = vi.fn().mockRejectedValue(new DeadlineExpiredError());
  await expect(reportBaiTransaction(NO_DEADLINE, { reportTxHash }, request)).resolves.toMatchObject(
    {
      ...request,
      creditStatus: "unconfirmed",
      code: "timeout",
      retryPayment: false,
      warning: { message: expect.stringContaining("Do not pay again") },
    },
  );
});
