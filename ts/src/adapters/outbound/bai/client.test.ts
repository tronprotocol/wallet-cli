import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";
import { BaiService } from "../../../application/use-cases/bai-service.js";
import { baiUsageText } from "../../inbound/cli/render/bai.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("BaiClient", () => {
  describe.each(["direct", "tRPC", "tRPC JSON"])("%s summary precision", (envelope) => {
    it.each([
      ["9007199254740991", "9007199254740991"],
      ["9007199254740993", "9007199254740993"],
      ["123.456789012345678901", "123.456789012345678901"],
      ['"9007199254740993.123456789012345678901"', "9007199254740993.123456789012345678901"],
    ])("preserves raw credits %s through JSON and text output", async (literal, expected) => {
      // Construct raw HTTP JSON: converting the fixture to a JS number would lose precision first.
      const summary = `{"points_balance":${literal},"monthly_spent":${literal},"monthly_chart":[{"month":"2026-09","points":${literal}}]}`;
      const body =
        envelope === "direct"
          ? summary
          : envelope === "tRPC"
            ? `[{"result":{"data":${summary}}}]`
            : `[{"result":{"data":{"json":${summary}}}}]`;
      const client = new BaiClient({ baiApiKey: "test-key" }, 1000, async () => new Response(body));
      const usage = await new BaiService(client).usage();
      expect(JSON.parse(JSON.stringify(usage))).toEqual({
        credits: expected,
        thisMonth: { month: "2026-09", credits: expected },
        trend: [{ month: "2026-09", credits: expected }],
      });
      const text = baiUsageText(usage);
      expect(text).toContain(`Credit balance: ${expected}\n`);
      expect(text).toContain(`Credits spent this month: ${expected}\n`);
      expect(text).toContain(`credits: ${expected}`);
    });
  });

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
    ).resolves.toEqual({
      items: [{ id: "u1", total_tokens: 42 }],
      page: 2,
      pageSize: 10,
      total: 11,
    });
    await expect(
      client.rechargeList({ page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" }),
    ).resolves.toMatchObject({ items: [{ id: "o1", status: "paid" }], page: 1, pageSize: 20 });
  });

  it.each([
    ['[{"error":{"json":{"code":-32001,"data":{"code":"UNAUTHORIZED"}}}}]', 200, "bai_auth_failed"],
    [
      '[{"error":{"json":{"code":-32029,"data":{"code":"TOO_MANY_REQUESTS"}}}}]',
      200,
      "provider_rate_limited",
    ],
    ['{"error":{"json":{"code":-32603}}}', 500, "provider_error"],
    ['{"points_balance":', 200, "provider_error"],
    ['{"points_balance":', 503, "provider_error"],
  ])("classifies summary response %s at HTTP %s as %s", async (body, status, code) => {
    const client = new BaiClient(
      { baiApiKey: "test-key" },
      1000,
      async () => new Response(body, { status }),
    );
    await expect(client.status()).rejects.toMatchObject({ code });
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
