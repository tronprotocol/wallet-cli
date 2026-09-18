import { expect, it, vi } from "vitest";
import { BaiRechargeFlow, reportBaiTransaction } from "./bai-recharge-flow.js";
import { TransportError } from "../../domain/errors/index.js";
import type { BaiReportDelay, BaiReportResult } from "../ports/bai-recharge.js";
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
const request = { chain: "tron", txHash: "a".repeat(64), amount: "1", rechargeTarget: target };
const order = {
  channel: "crypto" as const,
  chain: "tron",
  amount: "1",
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
    return { success: true as const, order: { id: 1 } };
  });
  const createOrder = vi.fn(async () => ({ id: 1 }));
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  const flow = new BaiRechargeFlow({ createOrder, reportTxHash }, { pay }, wait);
  await expect(flow.execute(order)).resolves.toMatchObject({
    creditStatus: "credited",
    txHash: request.txHash,
    retryPayment: false,
  });
  expect(createOrder).toHaveBeenCalledOnce();
  expect(pay).toHaveBeenCalledOnce();
  expect(reportTxHash).toHaveBeenCalledOnce();
  expect(wait.wait).toHaveBeenCalledExactlyOnceWith(15000);
});
it("does not retry when B.AI has not indexed the transaction; the hash and reason are returned", async () => {
  const wait = delay();
  const reportTxHash = vi
    .fn<(...args: unknown[]) => Promise<BaiReportResult>>()
    .mockResolvedValue({ success: false, code: "TX_NOT_FOUND_OR_INVALID", message: "not yet" });
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  const flow = new BaiRechargeFlow({ createOrder: async () => ({}), reportTxHash }, { pay }, wait);
  await expect(flow.execute(order)).resolves.toMatchObject({
    ...request,
    creditStatus: "unconfirmed",
    code: "TX_NOT_FOUND_OR_INVALID",
    warning: expect.stringContaining("not indexed the transaction yet"),
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
  await expect(reportBaiTransaction({ reportTxHash }, request)).resolves.toMatchObject({
    code: "TX_NOT_FOUND_OR_INVALID",
    warning: "not yet",
  });
});
it("does not pause before a report-only recovery", async () => {
  const reportTxHash = vi.fn(async () => ({ success: true as const, order: { id: 1 } }));
  await expect(reportBaiTransaction({ reportTxHash }, request)).resolves.toMatchObject({
    creditStatus: "credited",
  });
  expect(reportTxHash).toHaveBeenCalledExactlyOnceWith(request);
});
it("turns a transport error into an unconfirmed result that keeps the hash", async () => {
  const reportTxHash = vi
    .fn()
    .mockRejectedValue(
      new TransportError("provider_rate_limited", "slow down", { retryAfterMs: 7000 }),
    );
  await expect(reportBaiTransaction({ reportTxHash }, request)).resolves.toMatchObject({
    ...request,
    creditStatus: "unconfirmed",
    code: "provider_rate_limited",
    error: { details: { retryAfterMs: 7000 } },
    retryPayment: false,
    warning: expect.stringContaining("Do not pay again"),
  });
});
it("preserves the original recipient even if an adapter mutates its input", async () => {
  const reportTxHash = vi.fn(async (input) => {
    input.rechargeTarget.confirmedTarget.targetId = "changed";
    return { success: true as const, order: { id: 1 } };
  });
  await expect(reportBaiTransaction({ reportTxHash }, request)).resolves.toMatchObject({
    rechargeTarget: target,
  });
});
