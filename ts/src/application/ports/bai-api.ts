export interface BaiStatusView {
  pointsBalance: string;
  monthlySpent: string;
  monthlyChart: Array<{ month: string; points: string }>;
}

export interface BaiUsageInput {
  range?: [string, string];
  startDate?: string;
  endDate?: string;
}

export interface BaiUsageStatsView {
  totalMessages: string;
  totalSessions: string;
  totalTokens: string;
  totalCost: string;
  byModel: Array<{ model: string; count: string; tokens: string; cost: string }>;
  byDate: Array<{ date: string; count: string }>;
}

export interface BaiPageInput {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface BaiPageView {
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total?: number;
}

export interface BaiApi {
  status(): Promise<BaiStatusView>;
  usage(input: BaiUsageInput): Promise<BaiUsageStatsView>;
  usageList(input: BaiPageInput): Promise<BaiPageView>;
  rechargeList(input: BaiPageInput): Promise<BaiPageView>;
}
