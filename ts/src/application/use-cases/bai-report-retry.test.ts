import { expect, it, vi } from "vitest";
import { BaiRechargeFlow, reportBaiTransaction } from "./bai-recharge-flow.js";
import { TransportError } from "../../domain/errors/index.js";
import type { BaiReportRetry, BaiReportResult } from "../ports/bai-recharge.js";
function clock(): BaiReportRetry {
  let now = 0;
  return {
    timeoutMs: 90000,
    delaysMs: [15000, 20000, 25000],
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
it("waits for indexing and credits the original payment without recreating or repaying", async () => {
  const retry = clock();
  const reportTxHash = vi
    .fn<(...args: unknown[]) => Promise<BaiReportResult>>()
    .mockResolvedValueOnce({ success: false, code: "TX_NOT_FOUND_OR_INVALID" })
    .mockResolvedValueOnce({ success: false, code: "TX_TIMESTAMP_UNAVAILABLE" })
    .mockResolvedValueOnce({ success: true, order: { id: 1 } });
  const createOrder = vi.fn(async () => ({ id: 1 }));
  const pay = vi.fn(async () => ({ txHash: request.txHash, chain: "tron", payer: "payer" }));
  const flow = new BaiRechargeFlow({ createOrder, reportTxHash }, { pay }, retry);
  const result = await flow.execute({
    channel: "crypto",
    chain: "tron",
    amount: "1",
    tokenName: "USDT",
    walletAddress: "payer",
    deviceType: "web",
    rechargeTarget: target,
  });
  expect(result).toMatchObject({
    creditStatus: "credited",
    txHash: request.txHash,
    retryPayment: false,
  });
  expect(createOrder).toHaveBeenCalledOnce();
  expect(pay).toHaveBeenCalledOnce();
  expect(reportTxHash).toHaveBeenCalledTimes(3);
  for (const [input, options] of reportTxHash.mock.calls) {
    expect(input).toEqual(request);
    expect(options).toMatchObject({ signal: expect.any(AbortSignal) });
  }
  expect(retry.now()).toBe(35000);
});
it("caps attempts and retains recovery input when still unconfirmed", async () => {
  const reportTxHash = vi.fn(async () => ({
    success: false as const,
    code: "TX_NOT_FOUND_OR_INVALID",
  }));
  const result = await reportBaiTransaction({ reportTxHash }, request, clock());
  expect(reportTxHash).toHaveBeenCalledTimes(4);
  expect(result).toMatchObject({ ...request, creditStatus: "unconfirmed", retryPayment: false });
});
it("counts API elapsed time and does not start another request beyond its deadline", async () => {
  const retry = clock();
  const reportTxHash = vi.fn(async () => {
    await retry.wait(85000);
    return { success: false as const, code: "TX_NOT_FOUND_OR_INVALID" };
  });
  await reportBaiTransaction({ reportTxHash }, request, retry);
  expect(reportTxHash).toHaveBeenCalledOnce();
});
it.each(["PAYER_MISMATCH", "UNSUPPORTED_TOKEN", "WALLET_NOT_BOUND"])(
  "does not retry a definitive rejection: %s",
  async (code) => {
    const reportTxHash = vi.fn(async () => ({ success: false as const, code }));
    await reportBaiTransaction({ reportTxHash }, request, clock());
    expect(reportTxHash).toHaveBeenCalledOnce();
  },
);
it("does not retry authentication or transport errors", async () => {
  const reportTxHash = vi.fn().mockRejectedValue(new TransportError("bai_auth_failed", "rejected"));
  await expect(reportBaiTransaction({ reportTxHash }, request, clock())).resolves.toMatchObject({
    code: "bai_auth_failed",
    retryPayment: false,
  });
  expect(reportTxHash).toHaveBeenCalledOnce();
});
it("preserves the original recipient even if an adapter mutates its input", async () => {
  const reportTxHash = vi
    .fn()
    .mockImplementationOnce(async (input) => {
      input.rechargeTarget.confirmedTarget.targetId = "changed";
      return { success: false, code: "TX_TIMESTAMP_UNAVAILABLE" };
    })
    .mockResolvedValueOnce({ success: true, order: { id: 1 } });
  await reportBaiTransaction({ reportTxHash }, request, clock());
  expect(reportTxHash.mock.calls[1]![0]).toEqual(request);
});
