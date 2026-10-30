import type { ApprovalKind } from "../contracts/transaction-input.js";
export type { ApprovalKind } from "../contracts/transaction-input.js";
import { isUnlimitedAllowance } from "../../domain/token/allowance.js";

function normalizeSignature(signature?: string): string {
  return (signature ?? "").replace(/\s+/g, "");
}

export interface ApproveContext {
  method?: string;
  params?: Array<{ value?: unknown }>;
  // Distinguishes token allowances from NFT token IDs.
  approvalKind?: ApprovalKind;
  // Metadata failure falls back to base units.
  metadata: () => Promise<{ decimals?: number; symbol?: string }>;
  // Converts the spender to the family’s display encoding.
  displayAddress?: (value: string) => string;
  // Converts base units to whole tokens.
  fromBaseUnits: (raw: string, decimals: number) => string;
}

export async function approveRows(ctx: ApproveContext): Promise<Record<string, unknown>> {
  if (normalizeSignature(ctx.method) !== "approve(address,uint256)") return {};
  const spenderRaw = ctx.params?.[0]?.value;
  const raw = ctx.params?.[1]?.value;
  if (typeof spenderRaw !== "string" || raw === undefined) return {};
  let amount: bigint;
  try {
    amount = BigInt(String(raw));
  } catch {
    return {};
  }
  const spender = (ctx.displayAddress ?? ((v: string) => v))(spenderRaw);
  if (ctx.approvalKind === "erc721") {
    return { identity: { operator: spender, agentId: amount.toString(10) } };
  }
  if (isUnlimitedAllowance(amount)) return { spender, allowance: "unlimited" };

  const meta = await ctx.metadata().catch(() => ({}) as { decimals?: number; symbol?: string });
  return {
    spender,
    allowance:
      meta.decimals === undefined
        ? amount.toString(10)
        : ctx.fromBaseUnits(amount.toString(10), meta.decimals),
    ...(meta.decimals === undefined ? {} : { allowanceDecimals: meta.decimals }),
    ...(typeof meta.symbol === "string" && meta.symbol !== "" ? { token: meta.symbol } : {}),
  };
}
