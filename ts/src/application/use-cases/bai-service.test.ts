import { CommandDeadline } from "../services/command-deadline.js";
import { describe, expect, it, vi } from "vitest";
import { BaiService } from "./bai-service.js";
import type { BaiApi } from "../ports/bai-api.js";
import type { BaiRawOrder } from "../ports/bai-recharge.js";
import type { CliError } from "../../domain/errors/index.js";
import { errorEnvelope } from "../../adapters/inbound/cli/output/errors.js";

const NO_DEADLINE = new CommandDeadline(0);

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
    await expect(new BaiService(api()).usage(NO_DEADLINE)).resolves.toEqual({
      credits: "1200000",
      thisMonth: { month: "2026-09", credits: "300000" },
      trend: [{ month: "2026-09", credits: "300000" }],
    });
  });

  it("reads usage summary once without fetching records", async () => {
    const remote = api();
    await expect(new BaiService(remote).usage(NO_DEADLINE)).resolves.toEqual({
      credits: "1200000",
      thisMonth: { month: "2026-09", credits: "300000" },
      trend: [{ month: "2026-09", credits: "300000" }],
    });
    expect(remote.status).toHaveBeenCalledOnce();
    expect(remote.usageList).not.toHaveBeenCalled();
  });
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
    new BaiService(remote).usageList(NO_DEADLINE, {
      limit: 20,
      offset: 20,
      sort: "desc",
      cursor: "previous",
    }),
  ).resolves.toMatchObject({ pagination: { hasMore: true, nextCursor: "next" } });
  expect(remote.usageList).toHaveBeenCalledWith(
    {
      page: 2,
      pageSize: 20,
      sortOrder: "desc",
      cursor: "previous",
    },
    expect.anything(),
  );
});

it.each([100, 101, 200])(
  "caps recharge list %s without losing an unaligned offset",
  async (limit) => {
    const remote = api();
    const rows = Array.from({ length: 400 }, (_, id) => ({ id }) as unknown as BaiRawOrder);
    vi.mocked(remote.rechargeList).mockImplementation(async ({ page, pageSize }) => ({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
    }));
    const result = await new BaiService(remote).rechargeList(NO_DEADLINE, {
      limit,
      offset: 101,
      sort: "asc",
    });
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
        { deadline: NO_DEADLINE, resolveAddress } as never,
        { id: "eip155:56", family: "evm", chainId: "56" } as never,
        { amount, token: "USDT" },
      ),
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(resolveAddress).not.toHaveBeenCalled();
  },
);

it.each([
  ["eip155:56", "USDT", "1.0000001"],
  ["eip155:8453", "USDC", "2.1234567"],
  ["tron:728126428", "TRX", "15.0000001"],
])("rejects more than 6 decimal places on %s %s before any request", async (id, token, amount) => {
  const resolveAddress = vi.fn();
  await expect(
    new BaiService(api()).recharge(
      { deadline: NO_DEADLINE, resolveAddress } as never,
      { id, family: id.startsWith("tron") ? "tron" : "evm" } as never,
      { amount, token, apiKey: "key", dryRun: true },
    ),
  ).rejects.toMatchObject({ code: "invalid_amount" });
  expect(resolveAddress).not.toHaveBeenCalled();
});

it("names the offset and limit inputs when the page offset is unaligned", async () => {
  const error = await new BaiService(api())
    .usageList(NO_DEADLINE, { limit: 20, offset: 5, sort: "desc" })
    .catch((e: unknown) => e);
  expect(error).toMatchObject({
    code: "invalid_value",
    message: "offset must be a multiple of limit for the B.AI page API",
  });
  expect(errorEnvelope(error as CliError).message).toBe(
    "--offset must be a multiple of --limit for the B.AI page API",
  );
});

it.each([
  ["evm", "eip155:56", "56", "getErc20Balance"],
  ["tron", "tron:728126428", "728126428", "getTrc20Balance"],
] as const)(
  "previews the %s payer's token balance through that family's reader",
  async (family, id, chainId, method) => {
    const readers = {
      evm: { getErc20Balance: vi.fn(async () => "11") },
      tron: { getTrc20Balance: vi.fn(async () => "22") },
    };
    const gateways = {
      get: vi.fn((_network: unknown, f: "evm" | "tron") => readers[f]),
      client: () => ({ getNativeBalance: async () => "5" }),
    };
    const payments = {
      validate: vi.fn(),
      prepare: vi.fn(),
      roundtrip: vi.fn(async () => ({
        serve: { asset: "token-contract", rawAmount: "1000000" },
        pay: { dryRun: true },
      })),
    };
    const rechargeApi = { isBound: vi.fn(async () => true) };
    const service = new BaiService(
      api(),
      undefined,
      payments as never,
      undefined,
      rechargeApi as never,
      {
        facilitatorUrl: "https://example.com",
        payTo: { bnb: "payee", base: "payee", tron: "payee" },
      },
      undefined,
      gateways as never,
    );
    const scope = {
      deadline: NO_DEADLINE,
      resolveAddress: () => "payer",
      emit: vi.fn(),
      warn: vi.fn(),
    } as never;
    const result = await service.recharge(scope, { id, family, chainId } as never, {
      amount: "1",
      token: "USDT",
      apiKey: "key",
      dryRun: true,
    });
    const tokenRaw = family === "evm" ? "11" : "22";
    expect(result).toMatchObject({ balance: { tokenRaw, nativeRaw: "5" } });
    const reader = readers[family] as Record<string, ReturnType<typeof vi.fn>>;
    expect(reader[method]).toHaveBeenCalledWith("token-contract", "payer");
    expect(gateways.get).toHaveBeenCalledWith(expect.anything(), family, expect.anything());
  },
);
