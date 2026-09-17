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
    await expect(new BaiService(api()).usage()).resolves.toEqual({
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
  const service = new BaiService(
    api(),
    () => new Date(),
    { validate: vi.fn(), roundtrip: pay },
    {
      isConfirmed,
    } as unknown as BaiBindingStore,
    {} as never,
    {
      facilitatorUrl: "https://facilitator.example",
      payTo: { bnb: "destination", tron: "destination" },
    },
  );
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
  const service = new BaiService(
    api(),
    () => new Date(),
    { validate: vi.fn(), roundtrip: pay },
    {
      isConfirmed,
    } as unknown as BaiBindingStore,
    {} as never,
    {
      facilitatorUrl: "https://facilitator.example",
      payTo: { bnb: "destination", tron: "destination" },
    },
  );
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

it.each([100, 101, 200])(
  "caps recharge list %s without losing an unaligned offset",
  async (limit) => {
    const remote = api();
    const rows = Array.from({ length: 400 }, (_, id) => ({ id }));
    vi.mocked(remote.rechargeList).mockImplementation(async ({ page, pageSize }) => ({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
    }));
    const result = await new BaiService(remote).rechargeList({ limit, offset: 101, sort: "asc" });
    expect(result.orders).toEqual(rows.slice(101, 201));
    expect(result.pagination).toEqual({ offset: 101, limit: 100, total: 400 });
    expect(result.warnings.length).toBe(limit > 100 ? 1 : 0);
    expect(
      vi.mocked(remote.rechargeList).mock.calls.every(([input]) => input.pageSize <= 100),
    ).toBe(true);
  },
);

it.each(["0", "0.000", "-1", "1e3", "9007199254740992", "0.5"])(
  "rejects invalid USDT amount %s before credentials or wallet resolution",
  async (amount) => {
    const resolveAddress = vi.fn();
    await expect(
      new BaiService(api()).recharge(
        { resolveAddress } as never,
        { id: "eip155:56", family: "evm", chainId: "56" } as never,
        { amount, token: "USDT" },
      ),
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(resolveAddress).not.toHaveBeenCalled();
  },
);
