/**
 * SharedTypes — output contract (result/error envelopes + progress events)
 * and the global runtime flags parsed off argv.
 */
import type { ChainFamily } from "../../../../domain/family/index.js";
import type { OutputMode } from "../../../../domain/types/primitives.js";
import type { WarningView } from "../../../../domain/types/permission.js";

export type WarningItem = string | WarningView;

export interface ChainView {
  family: ChainFamily;
  network: string;
  chainId: string;
}
/** The window a paginated read returned. ONE location for every list command, so a caller can page
 *  any of them without knowing the payload's shape. `limit: null` = unlimited (no --limit given);
 *  `total: null` = the count is genuinely unknowable, not merely missing — TRON's paginated
 *  endpoints return no count, and computing one would mean transferring every record. Both keys are
 *  always present, so `null` is the single "unknown" signal and absence never has to be handled. */
export interface Pagination {
  offset: number;
  limit: number | null;
  total: number | null;
}
export interface Meta {
  durationMs: number;
  warnings: WarningItem[];
  /** present on paginated reads only; lifted out of `data` by the json formatter. */
  pagination?: Pagination;
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

// ═══════════════ global runtime flags parsed off argv ═════════════════════
export interface Globals {
  /** absent until the config default is resolved (runner bootstrap / buildExecutionContext). */
  output?: OutputMode;
  network?: string;
  account?: string;
  timeoutMs?: number;
  verbose: boolean;
  wait?: boolean;
  waitTimeoutMs?: number;
}
