import type { DispatchCheck } from "../contracts/deadline.js";
import type { BaiRawOrder } from "./bai-recharge.js";

export interface BaiStatusView {
  pointsBalance: string;
  monthlySpent: string;
  monthlyChart: Array<{ month: string; points: string }>;
}

// Pages are ordered by creation time.
export interface BaiPageInput {
  cursor?: string;
  page: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
}

export interface BaiUsageRecord {
  id: string | undefined;
  createdAt: string | undefined;
  model: string | undefined;
  inputTokens: string | undefined;
  outputTokens: string | undefined;
  totalTokens: string | undefined;
  credits: string | undefined;
  latencyMs: number | undefined;
  source: string | undefined;
}

export interface BaiPageView<T> {
  items: T[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface BaiApi {
  status(check: DispatchCheck): Promise<BaiStatusView>;
  usageList(input: BaiPageInput, check: DispatchCheck): Promise<BaiPageView<BaiUsageRecord>>;
  rechargeList(input: BaiPageInput, check: DispatchCheck): Promise<BaiPageView<BaiRawOrder>>;
}
