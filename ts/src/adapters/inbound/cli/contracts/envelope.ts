import type { ChainFamily } from "../../../../domain/family/index.js";
import type { OutputMode } from "../../../../domain/types/primitives.js";
import type { WarningView } from "../../../../domain/types/permission.js";

export type WarningItem = string | WarningView;

export interface ChainView {
  family: ChainFamily;
  network: string;
  chainId: string;
}
// Null limit means unlimited; null total means unknown.
export interface Pagination {
  offset: number;
  limit: number | null;
  total: number | null;
  hasMore?: boolean;
  nextCursor?: string | null;
}
export interface QueryEcho {
  orderBy: string;
  // May be fixed by the service rather than selected by the caller.
  sort: string;
}
export interface Meta {
  durationMs: number;
  warnings: WarningItem[];
  // Paginated reads only; the JSON formatter lifts this out of data.
  pagination?: Pagination;
  // Ordered listings only; the JSON formatter lifts this out of data.
  query?: QueryEcho;
}
export interface ResultEnvelope {
  schema: "wallet-cli.result.v1";
  success: true;
  command: string;
  chain?: ChainView;
  data: unknown;
  meta: Meta;
}
export interface ErrorEnvelope {
  schema: "wallet-cli.result.v1";
  success: false;
  command: string;
  chain?: ChainView;
  error: { code: string; message: string; details?: object };
  meta: Meta;
}

export interface Globals {
  // Absent until the config default is resolved.
  output?: OutputMode;
  network?: string;
  account?: string;
  timeoutMs?: number;
  verbose: boolean;
  wait?: boolean;
  waitTimeoutMs?: number;
}
