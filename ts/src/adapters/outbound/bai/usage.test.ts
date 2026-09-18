import { describe, expect, it, vi } from "vitest";
import { BaiClient } from "./client.js";
const response = (data: unknown) => new Response(JSON.stringify(data));

describe("documented BAI usage API", () => {
  it("preserves cursor metadata from the documented direct response", async () => {
    const fetcher = vi.fn(async () =>
      response({ data: [], has_more: true, next_cursor: "next", page: 1, pageSize: 20 }),
    );
    await expect(
      new BaiClient({ baiApiKey: "test" }, 1000, fetcher).usageList({
        page: 1,
        pageSize: 20,
        sortBy: "created_at",
        sortOrder: "desc",
      }),
    ).resolves.toMatchObject({ hasMore: true, nextCursor: "next" });
  });
  it("accepts the documented direct summary", async () => {
    const fetcher = vi.fn(async () =>
      response({ points_balance: 10, monthly_spent: 2, monthly_chart: [] }),
    );
    await expect(
      new BaiClient({ baiApiKey: "test" }, 1000, fetcher).status(),
    ).resolves.toMatchObject({ pointsBalance: "10", monthlySpent: "2" });
  });
});
