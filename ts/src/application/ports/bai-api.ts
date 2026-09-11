export interface BaiStatusView {
  pointsBalance: string;
  monthlySpent: string;
  monthlyChart: Array<{ month: string; points: string }>;
}

export interface BaiPageInput {
  cursor?: string;
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
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface BaiApi {
  status(): Promise<BaiStatusView>;
  usageList(input: BaiPageInput): Promise<BaiPageView>;
  rechargeList(input: BaiPageInput): Promise<BaiPageView>;
}
