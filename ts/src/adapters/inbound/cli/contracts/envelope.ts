/**
 * SharedTypes — output contract (result/error envelopes + progress events)
 * and the global runtime flags parsed off argv.
 */
import type { ChainFamily } from "../../../../domain/family/index.js";
import type { NetworkId } from "../../../../domain/types/network.js";
import type { OutputMode } from "../../../../domain/types/primitives.js";

export interface ChainView {
  family: ChainFamily;
  networkId: NetworkId;
  network: string;
  chainId: string;
}
export interface Meta {
  durationMs: number;
  warnings: string[];
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
