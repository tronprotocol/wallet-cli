/**
 * TRON command helpers shared across more than one group (rule of three; plan §3 L4).
 * Group-local helpers (mapResources, parseParams, the stake factory) stay in their own file.
 */
import type { z } from "zod";
import type { NetworkDescriptor } from "../../core/types/index.js";
import { TronRpcClient } from "../../infra/rpc/index.js";

export const rpcOf = (net: NetworkDescriptor): TronRpcClient => net.rpc as TronRpcClient;

/** --contract (TRC20) XOR --asset-id (TRC10); exactly one required. */
export function tokenSelector(v: { contract?: string; assetId?: string }, ctx: z.RefinementCtx): void {
  const n = [v.contract !== undefined, v.assetId !== undefined].filter(Boolean).length;
  if (n !== 1) {
    ctx.addIssue({ code: "custom", path: ["contract"], message: "exactly one of --contract (TRC20) or --asset-id (TRC10) is required" });
  }
}
