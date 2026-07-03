import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface TronHistoryQuery {
  limit: number;
  only?: "native" | "token";
}

export interface TronHistoryResult {
  address: string;
  only: "all" | "native" | "token";
  count: number;
  records: Array<Record<string, unknown>>;
}

export interface TronHistoryReader {
  get(
    network: NetworkDescriptor,
    address: string,
    query: TronHistoryQuery,
  ): Promise<TronHistoryResult>;
}

