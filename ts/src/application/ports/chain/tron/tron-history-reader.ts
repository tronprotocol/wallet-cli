import type { DispatchCheck } from "../../../contracts/deadline.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

export interface TronHistoryQuery {
  limit: number;
  only?: "native" | "token";
}

// amount is a decimal display amount in symbol units; time is epoch milliseconds.
// status is "unknown" when the source does not report the execution result.
export interface TronHistoryRecord {
  txId?: string;
  time?: number;
  type: string;
  // Empty for a TRC10 transfer whose asset precision is unknown.
  amount: string;
  // TRC10 transfers: the amount in the asset's base units.
  rawAmount?: string;
  // TRC10 transfers: the asset id.
  assetId?: string;
  symbol?: string;
  from?: string;
  to?: string;
  counterparty?: string;
  status: "ok" | "failed" | "unknown";
}

export interface TronHistoryResult {
  address: string;
  only: "all" | "native" | "token";
  count: number;
  records: TronHistoryRecord[];
}

export interface TronHistoryReader {
  get(
    network: NetworkDescriptor,
    address: string,
    query: TronHistoryQuery,
    check: DispatchCheck,
  ): Promise<TronHistoryResult>;
}
