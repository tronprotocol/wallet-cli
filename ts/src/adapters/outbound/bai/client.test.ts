import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BaiClient", () => {
  it("uses the live B.AI origin and prevents credential-bearing redirects", async () => {
    const fetcher = vi.fn(async () =>
      response([
        { result: { data: { json: { points_balance: 1, monthly_spent: 0, monthly_chart: [] } } } },
      ]),
    );
    await new BaiClient({ baiApiKey: "test-key" }, 1000, fetcher).status();
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(new URL(url).origin).toBe("https://chat.bankofai.io");
    expect(init.redirect).toBe("error");
  });

  it("maps the shared creation sort field to the order API's accepted spelling", async () => {
    const fetcher = vi.fn(async () =>
      response([{ result: { data: { json: { data: [], page: 1, pageSize: 5 } } } }]),
    );
    await new BaiClient({ baiApiKey: "test-key" }, 1000, fetcher).rechargeList({
      page: 1,
      pageSize: 5,
      sortBy: "created_at",
      sortOrder: "desc",
    });
    const [url] = fetcher.mock.calls[0]! as unknown as [string];
    expect(JSON.parse(new URL(url).searchParams.get("input")!)).toEqual({
      0: { json: { page: 1, pageSize: 5, sortBy: "createdAt", order: "desc" } },
    });
  });
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
    expect(String(url)).toContain("/trpc/lambda/usage.summary");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret" });
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
