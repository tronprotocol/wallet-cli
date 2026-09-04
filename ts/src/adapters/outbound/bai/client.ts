import { z } from "zod";
import type {
  BaiApi,
  BaiPageInput,
  BaiPageView,
  BaiStatusView,
  BaiUsageInput,
  BaiUsageStatsView,
} from "../../../application/ports/bai-api.js";
import type { Config } from "../../../domain/types/index.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";

const BatchItemSchema = z.looseObject({
  result: z.looseObject({ data: z.unknown().optional() }).optional(),
  error: z.unknown().optional(),
});

const ObjectSchema = z.record(z.string(), z.unknown());

export const DEFAULT_BAI_BASE_URL = "https://chat.ainft.com";

export class BaiClient implements BaiApi {
  constructor(
    private readonly config: Pick<Config, "baiApiKey">,
    private readonly timeoutMs: number,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly baseUrl = DEFAULT_BAI_BASE_URL,
  ) {}

  async status(): Promise<BaiStatusView> {
    const value = ObjectSchema.parse(await this.call("usage.summary", null));
    return {
      pointsBalance: scalar(value.points_balance, "points_balance"),
      monthlySpent: scalar(value.monthly_spent, "monthly_spent"),
      monthlyChart: arrayOfObjects(value.monthly_chart).map((row) => ({
        month: scalar(row.month, "monthly_chart.month"),
        points: scalar(row.points, "monthly_chart.points"),
      })),
    };
  }

  async usage(input: BaiUsageInput): Promise<BaiUsageStatsView> {
    const value = ObjectSchema.parse(await this.call("usage.getUsageStats", input));
    return {
      totalMessages: scalar(value.totalMessages, "totalMessages"),
      totalSessions: scalar(value.totalSessions, "totalSessions"),
      totalTokens: scalar(value.totalTokens, "totalTokens"),
      totalCost: scalar(value.totalCost, "totalCost"),
      byModel: arrayOfObjects(value.byModel).map((row) => ({
        model: scalar(row.model, "byModel.model"),
        count: scalar(row.count, "byModel.count"),
        tokens: scalar(row.tokens, "byModel.tokens"),
        cost: scalar(row.cost, "byModel.cost"),
      })),
      byDate: arrayOfObjects(value.byDate).map((row) => ({
        date: scalar(row.date, "byDate.date"),
        count: scalar(row.count, "byDate.count"),
      })),
    };
  }

  async usageList(input: BaiPageInput): Promise<BaiPageView> {
    return page(await this.call("usage.records", input));
  }

  async rechargeList(input: BaiPageInput): Promise<BaiPageView> {
    return page(
      await this.call("order.listOrders", {
        page: input.page,
        pageSize: input.pageSize,
        sortBy: input.sortBy,
        order: input.sortOrder,
      }),
    );
  }

  private async call(procedure: string, input: unknown): Promise<unknown> {
    const key = this.config.baiApiKey;
    if (!key) {
      throw new UsageError(
        "bai_credentials_missing",
        "B.AI API key is not configured; set config baiApiKey via the secure input channel",
      );
    }
    const encoded = encodeURIComponent(
      JSON.stringify(
        input === null
          ? { 0: { json: null, meta: { values: ["undefined"], v: 1 } } }
          : { 0: { json: input } },
      ),
    );
    const url = `${this.baseUrl}/trpc/lambda/${procedure}?batch=1&input=${encoded}`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new TransportError("timeout", "B.AI API request timed out");
      }
      throw new TransportError("provider_error", "B.AI API request failed");
    }
    if (response.status === 401 || response.status === 403) {
      throw new TransportError("bai_auth_failed", "B.AI API rejected the configured API key");
    }
    if (response.status === 429) {
      throw new TransportError("provider_rate_limited", "B.AI API rate limit exceeded");
    }
    if (!response.ok) {
      throw new TransportError("provider_error", `B.AI API returned HTTP ${response.status}`);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(await response.text());
    } catch {
      throw new TransportError("provider_error", "B.AI API returned malformed JSON");
    }
    const first = Array.isArray(decoded) ? decoded[0] : decoded;
    const item = BatchItemSchema.safeParse(first);
    if (!item.success || item.data.error !== undefined || item.data.result?.data === undefined) {
      throw new TransportError("provider_error", "B.AI API returned an invalid tRPC response");
    }
    const data = item.data.result.data;
    if (data && typeof data === "object" && !Array.isArray(data) && "json" in data) {
      return (data as { json: unknown }).json;
    }
    return data;
  }
}

function scalar(value: unknown, field: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  throw new TransportError("provider_error", `B.AI API response is missing ${field}`);
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = ObjectSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function page(raw: unknown): BaiPageView {
  const value = ObjectSchema.parse(raw);
  const items = arrayOfObjects(Array.isArray(value.data) ? value.data : value.orders);
  const pageNumber = finiteInteger(value.page, 1) ?? 1;
  const pageSize = finiteInteger(value.pageSize, items.length) ?? items.length;
  const total = finiteInteger(value.total, undefined);
  return {
    items,
    page: pageNumber,
    pageSize,
    ...(total === undefined ? {} : { total }),
  };
}

function finiteInteger(value: unknown, fallback: number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
