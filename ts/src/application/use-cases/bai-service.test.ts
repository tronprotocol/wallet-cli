import { describe, expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import type { BaiApi } from "../ports/bai-api.js";
import type { X402PaymentPort } from "../ports/x402-payment.js";

function api(): BaiApi {
  return {
    status: vi.fn(async () => ({
      pointsBalance: "1200000",
      monthlySpent: "300000",
      monthlyChart: [{ month: "2026-09", points: "300000" }],
    })),
    usage: vi.fn(async () => ({
      totalMessages: "4",
      totalSessions: "2",
      totalTokens: "100",
      totalCost: "25",
      byModel: [{ model: "m", count: "4", tokens: "100", cost: "25" }],
      byDate: [{ date: "2026-09-01", count: "4" }],
    })),
    usageList: vi.fn(async () => ({ page: 1, pageSize: 20, total: 1, items: [] })),
    rechargeList: vi.fn(async () => ({ page: 1, pageSize: 20, total: 1, items: [] })),
  };
}

describe("BaiService", () => {
  it("maps the account summary to stable credit names", async () => {
    await expect(new BaiService(api()).status()).resolves.toEqual({
      credits: "1200000",
      thisMonth: { month: "2026-09", credits: "300000" },
      trend: [{ month: "2026-09", credits: "300000" }],
    });
  });

  it("defaults usage to the latest 30 UTC calendar days", async () => {
    const remote = api();
    const service = new BaiService(remote, () => new Date("2026-09-04T18:00:00Z"));
    await service.usage({});
    expect(remote.usage).toHaveBeenCalledWith({
      startDate: "2026-08-06",
      endDate: "2026-09-04",
      range: ["2026-08-06", "2026-09-04"],
    });
  });

  it("rejects an inverted date range before calling B.AI", async () => {
    const remote = api();
    await expect(
      new BaiService(remote).usage({ from: "2026-09-02", to: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    expect(remote.usage).not.toHaveBeenCalled();
  });

  it("sends recharge through x402 without exposing the API key in the result", async () => {
    const payments = {
      pay: vi.fn(async () => ({ delivered: true, settled: true })),
    } as unknown as X402PaymentPort;
    const service = new BaiService(api(), () => new Date(), payments);
    const result = await service.recharge({} as never, { id: "tron:728126428" } as never, {
      amount: "10",
      token: "USDT",
      apiKey: "secret-key",
    });
    expect(result).toMatchObject({ network: "tron:728126428", token: "USDT", amount: "10" });
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(payments.pay).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        url: "https://recharge.bankofai.io/mcp",
        method: "POST",
        headers: expect.arrayContaining(["Authorization: Bearer secret-key"]),
      }),
    );
  });
});
