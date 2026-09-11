import { expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import { TransportError } from "../../domain/errors/index.js";
function fixture() {
  const api = {
    reportTxHash: vi.fn(async () => ({ success: true as const, order: { id: 1 } })),
    createOrder: vi.fn(),
    resolveTarget: vi.fn(),
  };
  const payments = { validate: vi.fn(), roundtrip: vi.fn() };
  const service = new BaiService({} as never, () => new Date(), payments, undefined, api as never);
  return { api, payments, service };
}
const request = {
  chain: "base" as const,
  txHash: "0x" + "a".repeat(64),
  amount: "1",
  to: "recipient@example.com",
  targetId: "original-id",
};
it("reports the original recipient without a wallet, preorder, target resolution or payment", async () => {
  const { api, payments, service } = fixture();
  await expect(service.rechargeReport(request)).resolves.toMatchObject({
    creditStatus: "credited",
    retryPayment: false,
  });
  expect(api.reportTxHash).toHaveBeenCalledExactlyOnceWith({
    chain: "base",
    txHash: request.txHash,
    amount: "1",
    rechargeTarget: {
      input: { type: "personal", identifier: request.to },
      confirmedTarget: { type: "personal", targetId: request.targetId },
    },
  });
  expect(api.createOrder).not.toHaveBeenCalled();
  expect(api.resolveTarget).not.toHaveBeenCalled();
  expect(payments.roundtrip).not.toHaveBeenCalled();
  expect(payments.validate).not.toHaveBeenCalled();
});
it.each([
  { txHash: "bad" },
  { chain: "tron" },
  { amount: "0" },
  { amount: "9007199254740992" },
  { targetId: undefined },
  { to: undefined },
])("rejects invalid recovery before an API mutation: %j", async (override) => {
  const { service, api } = fixture();
  await expect(service.rechargeReport({ ...request, ...override } as never)).rejects.toMatchObject({
    code: "invalid_value",
  });
  expect(api.reportTxHash).not.toHaveBeenCalled();
});
it("retains the original recovery data and error code when reporting fails", async () => {
  const { service, api } = fixture();
  api.reportTxHash.mockRejectedValue(new TransportError("bai_auth_failed", "rejected"));
  await expect(service.rechargeReport(request)).resolves.toMatchObject({
    txHash: request.txHash,
    chain: "base",
    amount: "1",
    code: "bai_auth_failed",
    creditStatus: "unconfirmed",
    retryPayment: false,
    rechargeTarget: { confirmedTarget: { targetId: request.targetId } },
  });
  expect(api.reportTxHash).toHaveBeenCalledOnce();
});
