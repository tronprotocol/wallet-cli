import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";
import { BaiService } from "../../../application/use-cases/bai-service.js";
import { baiUsageText } from "../../inbound/cli/render/bai.js";

const NO_DEADLINE = new CommandDeadline(0);
const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

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
      // Raw JSON avoids rounding the fixture before parsing.
      const summary = `{"points_balance":${literal},"monthly_spent":${literal},"monthly_chart":[{"month":"2026-09","points":${literal}}]}`;
      const body =
        envelope === "direct"
          ? summary
          : envelope === "tRPC"
            ? `[{"result":{"data":${summary}}}]`
            : `[{"result":{"data":{"json":${summary}}}}]`;
      const client = new BaiClient({ baiApiKey: "test-key" }, async () => new Response(body));
      const usage = await new BaiService(client).usage(NO_DEADLINE);
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
    await new BaiClient({ baiApiKey: "test-key" }, fetcher).status(NO_CHECK);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(new URL(url).origin).toBe("https://chat.bankofai.io");
    expect(init.redirect).toBe("error");
  });

  it("sorts each list by creation time in the spelling its API accepts", async () => {
    const fetcher = vi.fn(async () =>
      response([{ result: { data: { json: { data: [], page: 1, pageSize: 5 } } } }]),
    );
    const client = new BaiClient({ baiApiKey: "test-key" }, fetcher);
    await client.rechargeList({ page: 1, pageSize: 5, sortOrder: "desc" }, NO_CHECK);
    await client.usageList({ page: 1, pageSize: 5, sortOrder: "asc", cursor: "c1" }, NO_CHECK);
    const [orders] = fetcher.mock.calls[0]! as unknown as [string];
    expect(JSON.parse(new URL(orders).searchParams.get("input")!)).toEqual({
      0: { json: { page: 1, pageSize: 5, sortBy: "createdAt", order: "desc" } },
    });
    const [records] = fetcher.mock.calls[1]! as unknown as [string];
    expect(new URL(records).search).toBe(
      "?page=1&pageSize=5&sortBy=created_at&sortOrder=asc&cursor=c1&mode=all",
    );
  });

  it("reads usage record fields in either spelling and reports latency in milliseconds", async () => {
    const fetcher = vi.fn(async () =>
      response({
        data: [
          {
            id: "u1",
            created_at: "2026-09-01T00:00:00Z",
            model: "m",
            input_tokens: 1,
            output_tokens: "2",
            total_tokens: 3,
            cost_points: 4,
            duration_sec: 1.5,
            source_type: "api",
          },
          {
            createdAt: "2026-09-02T00:00:00Z",
            inputTokens: 5,
            credits: "6",
            durationSec: "0.25",
            source: "chat",
          },
        ],
      }),
    );
    const { items } = await new BaiClient({ baiApiKey: "test-key" }, fetcher).usageList(
      {
        page: 1,
        pageSize: 2,
        sortOrder: "desc",
      },
      NO_CHECK,
    );
    expect(items).toEqual([
      {
        id: "u1",
        createdAt: "2026-09-01T00:00:00Z",
        model: "m",
        inputTokens: "1",
        outputTokens: "2",
        totalTokens: "3",
        credits: "4",
        latencyMs: 1500,
        source: "api",
      },
      {
        id: undefined,
        createdAt: "2026-09-02T00:00:00Z",
        model: undefined,
        inputTokens: "5",
        outputTokens: undefined,
        totalTokens: undefined,
        credits: "6",
        latencyMs: 250,
        source: "chat",
      },
    ]);
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
      fetcher as typeof fetch,
      "https://bai.example",
    );

    await expect(client.status(NO_CHECK)).resolves.toEqual({
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
      fetcher as typeof fetch,
      "https://bai.example",
    );

    await expect(
      client.usageList({ page: 2, pageSize: 10, sortOrder: "desc" }, NO_CHECK),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "u1", totalTokens: "42" })],
      page: 2,
      pageSize: 10,
      total: 11,
    });
    await expect(
      client.rechargeList({ page: 1, pageSize: 20, sortOrder: "desc" }, NO_CHECK),
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
    ["", 429, "provider_rate_limited"],
  ])("classifies summary response %s at HTTP %s as %s", async (body, status, code) => {
    const client = new BaiClient(
      { baiApiKey: "test-key" },
      async () => new Response(body, { status }),
    );
    await expect(client.status(NO_CHECK)).rejects.toMatchObject({ code });
  });

  it("keeps procedure and retryPayment beside the rate-limit keys", async () => {
    const client = new BaiClient(
      { baiApiKey: "test-key" },
      async () => new Response("", { status: 429, headers: { "retry-after": "6" } }),
    );
    const error = (await client.status(NO_CHECK).catch((caught: unknown) => caught)) as {
      details?: unknown;
    };
    expect(error.details).toEqual({
      procedure: "usage.summary",
      retryPayment: false,
      httpStatus: 429,
      retryAfterSeconds: 6,
    });
  });

  it("classifies missing credentials and rejected credentials without exposing the key", async () => {
    const missing = new BaiClient({}, vi.fn(), "https://bai.example");
    await expect(missing.status(NO_CHECK)).rejects.toMatchObject({
      code: "bai_credentials_missing",
    });

    const rejected = new BaiClient(
      { baiApiKey: "top-secret" },
      vi.fn(async () => response({ error: "top-secret" }, 401)) as typeof fetch,
      "https://bai.example",
    );
    await expect(rejected.status(NO_CHECK)).rejects.toMatchObject({
      code: "bai_auth_failed",
      message: expect.not.stringContaining("top-secret"),
    });
  });
});
