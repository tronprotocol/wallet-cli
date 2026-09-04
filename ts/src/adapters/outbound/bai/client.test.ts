import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BaiClient", () => {
  it("queries points with a bearer key and unwraps a tRPC batch envelope", async () => {
    const fetcher = vi.fn(async () =>
      response([
        {
          result: {
            data: {
              json: {
                points_balance: 123.5,
                monthly_spent: 20,
                monthly_chart: [{ month: "2026-09", points: 20 }],
              },
            },
          },
        },
      ]),
    );
    const client = new BaiClient(
      { baiApiKey: "secret" },
      1000,
      fetcher as typeof fetch,
      "https://bai.example",
    );

    await expect(client.status()).resolves.toEqual({
      pointsBalance: "123.5",
      monthlySpent: "20",
      monthlyChart: [{ month: "2026-09", points: "20" }],
    });
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string | URL | Request, RequestInit];
    expect(String(url)).toContain("/trpc/lambda/usage.summary?batch=1&input=");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("normalizes usage stats and preserves exact quantities as strings", async () => {
    const fetcher = vi.fn(async () =>
      response([
        {
          result: {
            data: {
              json: {
                totalMessages: 5,
                totalSessions: 2,
                totalTokens: "9007199254740993",
                totalCost: 8.25,
                byModel: [{ model: "m", count: 5, tokens: 99, cost: 8.25 }],
                byDate: [{ date: "2026-09-01", count: 5 }],
              },
            },
          },
        },
      ]),
    );
    const client = new BaiClient(
      { baiApiKey: "secret" },
      1000,
      fetcher as typeof fetch,
      "https://bai.example",
    );

    await expect(client.usage({ range: ["2026-08-06", "2026-09-04"] })).resolves.toMatchObject({
      totalMessages: "5",
      totalSessions: "2",
      totalTokens: "9007199254740993",
      totalCost: "8.25",
      byModel: [{ model: "m", count: "5", tokens: "99", cost: "8.25" }],
    });
    const call = fetcher.mock.calls[0]! as unknown as [string | URL | Request, RequestInit];
    const input = new URL(String(call[0])).searchParams.get("input")!;
    expect(JSON.parse(input)).toEqual({
      0: { json: { range: ["2026-08-06", "2026-09-04"] } },
    });
  });

  it("normalizes usage records and recharge orders", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          {
            result: {
              data: {
                json: { data: [{ id: "u1", total_tokens: 42 }], page: 2, pageSize: 10, total: 11 },
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            result: {
              data: { json: { orders: [{ id: "o1", status: "paid" }], page: 1, pageSize: 20 } },
            },
          },
        ]),
      );
    const client = new BaiClient(
      { baiApiKey: "secret" },
      1000,
      fetcher as typeof fetch,
      "https://bai.example",
    );

    await expect(
      client.usageList({ page: 2, pageSize: 10, sortBy: "createdAt", sortOrder: "desc" }),
    ).resolves.toMatchObject({ items: [{ id: "u1" }], page: 2, pageSize: 10, total: 11 });
    await expect(
      client.rechargeList({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" }),
    ).resolves.toMatchObject({ items: [{ id: "o1", status: "paid" }], page: 1, pageSize: 20 });
  });

  it("classifies missing credentials and rejected credentials without exposing the key", async () => {
    const missing = new BaiClient({}, 1000, vi.fn(), "https://bai.example");
    await expect(missing.status()).rejects.toMatchObject({ code: "bai_credentials_missing" });

    const rejected = new BaiClient(
      { baiApiKey: "top-secret" },
      1000,
      vi.fn(async () => response({ error: "top-secret" }, 401)) as typeof fetch,
      "https://bai.example",
    );
    await expect(rejected.status()).rejects.toMatchObject({
      code: "bai_auth_failed",
      message: expect.not.stringContaining("top-secret"),
    });
  });
});
