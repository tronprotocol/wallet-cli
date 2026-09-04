import type { BaiApi, BaiPageInput } from "../ports/bai-api.js";
import { UsageError } from "../../domain/errors/index.js";
import type { X402PaymentPort } from "../ports/x402-payment.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

export interface BaiUsageCommandInput {
  from?: string;
  to?: string;
}

export interface BaiListCommandInput {
  limit: number;
  offset: number;
  sort: "asc" | "desc";
}

export class BaiService {
  constructor(
    private readonly api: BaiApi,
    private readonly now: () => Date = () => new Date(),
    private readonly payments?: X402PaymentPort,
  ) {}

  async recharge(
    scope: TransactionScope,
    network: NetworkDescriptor,
    input: { amount: string; token: string; apiKey?: string },
  ) {
    if (!input.apiKey) {
      throw new UsageError(
        "bai_credentials_missing",
        "configure baiApiKey before using B.AI recharge",
      );
    }
    if (!this.payments) {
      throw new UsageError("invalid_option", "B.AI recharge is not available in this runtime");
    }
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "recharge", arguments: { amount: input.amount, token: input.token } },
    });
    const result = await this.payments.pay(scope, network, {
      url: "https://recharge.bankofai.io/mcp",
      method: "POST",
      headers: [
        "Content-Type: application/json",
        "Accept: application/json, text/event-stream",
        `Authorization: Bearer ${input.apiKey}`,
      ],
      body,
      token: input.token,
      maxAmount: input.amount,
    });
    return { network: network.id, token: input.token, amount: input.amount, ...result };
  }

  async status() {
    const summary = await this.api.status();
    const current = summary.monthlyChart.at(-1);
    return {
      credits: summary.pointsBalance,
      thisMonth: {
        month: current?.month ?? utcMonth(this.now()),
        credits: summary.monthlySpent,
      },
      trend: summary.monthlyChart.map((item) => ({ month: item.month, credits: item.points })),
    };
  }

  async usage(input: BaiUsageCommandInput) {
    const to = input.to ?? utcDate(this.now());
    const from = input.from ?? utcDate(addUtcDays(parseDate(to, "to"), -29));
    const fromDate = parseDate(from, "from");
    const toDate = parseDate(to, "to");
    if (fromDate.getTime() > toDate.getTime()) {
      throw new UsageError("invalid_value", "--from must not be later than --to");
    }
    const result = await this.api.usage({ startDate: from, endDate: to, range: [from, to] });
    return {
      from,
      to,
      messages: result.totalMessages,
      sessions: result.totalSessions,
      tokens: result.totalTokens,
      credits: result.totalCost,
      byModel: result.byModel.map((row) => ({
        model: row.model,
        messages: row.count,
        tokens: row.tokens,
        credits: row.cost,
      })),
      byDate: result.byDate.map((row) => ({ date: row.date, messages: row.count })),
    };
  }

  async usageList(input: BaiListCommandInput) {
    const result = await this.api.usageList(pageInput(input));
    return {
      records: result.items.map((row) => ({
        id: optionalString(row.id),
        createdAt: optionalString(row.created_at ?? row.createdAt),
        model: optionalString(row.model),
        inputTokens: optionalScalar(row.input_tokens ?? row.inputTokens),
        outputTokens: optionalScalar(row.output_tokens ?? row.outputTokens),
        totalTokens: optionalScalar(row.total_tokens ?? row.totalTokens),
        credits: optionalScalar(row.cost_points ?? row.credits),
        latencyMs: secondsToMilliseconds(row.duration_sec ?? row.durationSec),
        source: optionalString(row.source_type ?? row.source),
      })),
      pagination: { offset: input.offset, limit: input.limit, total: result.total },
    };
  }

  async rechargeList(input: BaiListCommandInput) {
    const result = await this.api.rechargeList(pageInput(input));
    return {
      orders: result.items,
      pagination: { offset: input.offset, limit: input.limit, total: result.total },
    };
  }
}

function pageInput(input: BaiListCommandInput): BaiPageInput {
  if (input.offset % input.limit !== 0) {
    throw new UsageError(
      "invalid_value",
      `--offset must be a multiple of --limit for the B.AI page API`,
    );
  }
  return {
    page: input.offset / input.limit + 1,
    pageSize: input.limit,
    sortBy: "created_at",
    sortOrder: input.sort,
  };
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UsageError("invalid_value", `--${field} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || utcDate(date) !== value) {
    throw new UsageError("invalid_value", `--${field} must be a real UTC calendar date`);
  }
  return date;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
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
