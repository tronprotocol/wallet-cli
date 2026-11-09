import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { baiApiError, credentialRefusal } from "./api-error.js";
import { requestJson } from "../http/json-service.js";
import { z } from "zod";
import { parse as parseLosslessJson } from "lossless-json";
import type {
  BaiApi,
  BaiPageInput,
  BaiPageView,
  BaiStatusView,
  BaiUsageRecord,
} from "../../../application/ports/bai-api.js";
import type { BaiRawOrder } from "../../../application/ports/bai-recharge.js";
import type { Config } from "../../../domain/types/index.js";
import { TransportError, UsageError } from "../../../domain/errors/index.js";

const BatchItemSchema = z.looseObject({
  result: z.looseObject({ data: z.unknown().optional() }).optional(),
  error: z.unknown().optional(),
});

const ObjectSchema = z.record(z.string(), z.unknown());

export const DEFAULT_BAI_BASE_URL = "https://chat.bankofai.io";

export class BaiClient implements BaiApi {
  constructor(
    private readonly config: Pick<Config, "baiApiKey">,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly baseUrl = DEFAULT_BAI_BASE_URL,
  ) {}

  async status(check: DispatchCheck): Promise<BaiStatusView> {
    const value = responseObject(await this.call("usage.summary", null, check));
    return {
      pointsBalance: scalar(value.points_balance, "points_balance"),
      monthlySpent: scalar(value.monthly_spent, "monthly_spent"),
      monthlyChart: arrayOfObjects(value.monthly_chart).map((row) => ({
        month: scalar(row.month, "monthly_chart.month"),
        points: scalar(row.points, "monthly_chart.points"),
      })),
    };
  }

  async usageList(input: BaiPageInput, check: DispatchCheck): Promise<BaiPageView<BaiUsageRecord>> {
    const raw = await this.call(
      "usage.records",
      {
        page: input.page,
        pageSize: input.pageSize,
        sortBy: "created_at",
        sortOrder: input.sortOrder,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        mode: "all",
      },
      check,
    );
    const parsed = z.looseObject({ data: z.array(ObjectSchema) }).safeParse(raw);
    if (!parsed.success)
      throw new TransportError("provider_error", "B.AI returned invalid usage records");
    const result = page(parsed.data);
    return { ...result, items: result.items.map(usageRecord) };
  }

  async rechargeList(input: BaiPageInput, check: DispatchCheck): Promise<BaiPageView<BaiRawOrder>> {
    return page(
      await this.call(
        "order.listOrders",
        {
          page: input.page,
          pageSize: input.pageSize,
          sortBy: "createdAt",
          order: input.sortOrder,
        },
        check,
      ),
    ) as unknown as BaiPageView<BaiRawOrder>;
  }

  private async call(procedure: string, input: unknown, check: DispatchCheck): Promise<unknown> {
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
    const query = new URLSearchParams();
    if (procedure === "usage.records" && input && typeof input === "object") {
      for (const [name, value] of Object.entries(input)) {
        if (value !== undefined) query.set(name, String(value));
      }
    }
    const suffix =
      procedure === "usage.records"
        ? `?${query}`
        : procedure === "usage.summary"
          ? ""
          : `?batch=1&input=${encoded}`;
    const url = `${this.baseUrl}/trpc/lambda/${procedure}${suffix}`;
    const { status, body: decoded } = await requestJson(
      this.fetcher,
      url,
      { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${key}` } },
      {
        service: "B.AI",
        context: { procedure, retryPayment: false },
        check,
        // Preserve summary precision; list responses use JSON numbers.
        parse: (text) =>
          procedure === "usage.summary"
            ? parseLosslessJson(text, undefined, (value) => value)
            : JSON.parse(text),
        refuse: (response) => credentialRefusal(procedure, response.status),
        errors: {
          timeout: () => new TransportError("timeout", "B.AI API request timed out"),
          unreachable: () =>
            new TransportError(
              "provider_error",
              "B.AI API connection failed; check connectivity and the service endpoint",
              { procedure, reason: "connection_failed" },
            ),
          malformed: (status) =>
            baiApiError(undefined, procedure, status) ??
            new TransportError("provider_error", "B.AI API returned malformed JSON", {
              procedure,
              reason: "malformed_json",
            }),
        },
      },
    );
    const apiError = baiApiError(decoded, procedure, status);
    if (apiError) throw apiError;
    const first = Array.isArray(decoded) ? decoded[0] : decoded;
    if (
      first &&
      typeof first === "object" &&
      !Array.isArray(first) &&
      !("error" in first) &&
      !("result" in first)
    ) {
      if (procedure === "usage.records" && "data" in first && Array.isArray(first.data))
        return first;
      if (procedure === "usage.summary" && "points_balance" in first) return first;
    }
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

// The service has sent both snake_case and camelCase field names.
function usageRecord(row: Record<string, unknown>): BaiUsageRecord {
  return {
    id: optionalString(row.id),
    createdAt: optionalString(row.created_at ?? row.createdAt),
    model: optionalString(row.model),
    inputTokens: optionalScalar(row.input_tokens ?? row.inputTokens),
    outputTokens: optionalScalar(row.output_tokens ?? row.outputTokens),
    totalTokens: optionalScalar(row.total_tokens ?? row.totalTokens),
    credits: optionalScalar(row.cost_points ?? row.credits),
    latencyMs: secondsToMilliseconds(row.duration_sec ?? row.durationSec),
    source: optionalString(row.source_type ?? row.source),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalScalar(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function secondsToMilliseconds(value: unknown): number | undefined {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

function page(raw: unknown): BaiPageView<Record<string, unknown>> {
  const value = responseObject(raw);
  const items = arrayOfObjects(Array.isArray(value.data) ? value.data : value.orders);
  const pageNumber = finiteInteger(value.page, 1) ?? 1;
  const pageSize = finiteInteger(value.pageSize, items.length) ?? items.length;
  const total = finiteInteger(value.total, undefined);
  return {
    items,
    page: pageNumber,
    pageSize,
    ...(total === undefined ? {} : { total }),
    ...(typeof value.has_more === "boolean" ? { hasMore: value.has_more } : {}),
    ...(typeof value.next_cursor === "string" || value.next_cursor === null
      ? { nextCursor: value.next_cursor }
      : {}),
  };
}

function finiteInteger(value: unknown, fallback: number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function responseObject(value: unknown): Record<string, unknown> {
  const result = ObjectSchema.safeParse(value);
  if (!result.success)
    throw new TransportError("provider_error", "B.AI returned an invalid response object", {
      reason: "invalid_response",
    });
  return result.data;
}
