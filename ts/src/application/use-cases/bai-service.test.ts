import { describe, expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import type { BaiApi } from "../ports/bai-api.js";
import type { BaiBindingStore } from "../ports/bai-binding-store.js";

function api(): BaiApi {
  return {
    status: vi.fn(async () => ({
      pointsBalance: "1200000",
      monthlySpent: "300000",
      monthlyChart: [{ month: "2026-09", points: "300000" }],
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

  it("reads usage summary once without fetching records", async () => {
    const remote = api();
    await expect(new BaiService(remote).usage()).resolves.toEqual({
      credits: "1200000",
      thisMonth: { month: "2026-09", credits: "300000" },
      trend: [{ month: "2026-09", credits: "300000" }],
    });
    expect(remote.status).toHaveBeenCalledOnce();
    expect(remote.usageList).not.toHaveBeenCalled();
  });
});

it("stops an unconfirmed local recharge before requesting or signing payment", async () => {
  const pay = vi.fn();
  const isConfirmed = vi.fn(() => false);
  const service = new BaiService(api(), () => new Date(), { validate: vi.fn(), roundtrip: pay }, {
    isConfirmed,
  } as unknown as BaiBindingStore);
  await expect(
    service.recharge(
      { resolveAddress: () => "payer" } as never,
      { id: "eip155:56", family: "evm", chainId: "56" } as never,
      { amount: "10", token: "USDT", apiKey: "secret" },
    ),
  ).rejects.toMatchObject({ code: "invalid_value" });
  expect(isConfirmed).toHaveBeenCalledWith("secret", "bnb", "payer");
  expect(pay).not.toHaveBeenCalled();
});
it("does not proceed when local confirmation cannot be read", async () => {
  const pay = vi.fn();
  const isConfirmed = vi.fn(() => {
    throw new Error("API unavailable");
  });
  const service = new BaiService(api(), () => new Date(), { validate: vi.fn(), roundtrip: pay }, {
    isConfirmed,
  } as unknown as BaiBindingStore);
  await expect(
    service.recharge(
      { resolveAddress: () => "payer" } as never,
      { id: "tron:728126428", family: "tron", chainId: "728126428" } as never,
      { amount: "10", token: "USDT", apiKey: "secret" },
    ),
  ).rejects.toThrow("API unavailable");
  expect(pay).not.toHaveBeenCalled();
});

it("passes the usage cursor through and exposes continuation metadata", async () => {
  const remote = api();
  vi.mocked(remote.usageList).mockResolvedValue({
    items: [],
    page: 2,
    pageSize: 20,
    hasMore: true,
    nextCursor: "next",
  });
  await expect(
    new BaiService(remote).usageList({ limit: 20, offset: 20, sort: "desc", cursor: "previous" }),
  ).resolves.toMatchObject({ pagination: { hasMore: true, nextCursor: "next" } });
  expect(remote.usageList).toHaveBeenCalledWith({
    page: 2,
    pageSize: 20,
    sortBy: "created_at",
    sortOrder: "desc",
    cursor: "previous",
  });
});
