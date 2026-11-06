import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, pending, receipt, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";
import { zeroMinimumNote } from "./sunswap-minimum.js";

interface Side {
  readonly symbol: string;
  readonly amount: string;
  readonly amountMinimum?: string;
  readonly acceptsAnyAmount?: boolean;
  readonly receivedAmount?: string;
  readonly decimals: number;
}

interface ApprovalRow {
  readonly symbol: string;
  readonly spender: string;
  readonly amount: string;
  readonly decimals: number;
}

interface RemovalView {
  readonly mode?: string;
  readonly stage?: string;
  readonly amountsEstimated?: boolean;
  readonly account?: string;
  readonly protocol: string;
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: Side;
  readonly token1: Side;
  readonly lpAmount?: string;
  readonly lpDecimals?: number;
  readonly nftTokenId?: string;
  readonly liquidity?: string;
  readonly liquidityAfter?: string;
  // 32-byte pool ID; V4 pools have no individual address.
  readonly poolId?: string;
  readonly feeTier?: number;
  readonly tickSpacing?: number;
  // Preformatted hook label, including "none" for the zero address.
  readonly hooks?: string;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  readonly reservesAfter?: { readonly token0: string; readonly token1: string };
  readonly collectsFees?: boolean;
  readonly approvals?: readonly ApprovalRow[];
  readonly fee?: unknown;
  readonly feeCovers?: string;
  readonly txId?: string;
  readonly approvalTxIds?: readonly string[];
  readonly transactions?: readonly { readonly purpose: string }[];
  readonly blockNumber?: number;
  readonly result?: unknown;
}

type Pair = [string, string];

const deadline = (seconds: number): string =>
  `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`;

const arrived = (side: Side): string =>
  side.receivedAmount === undefined
    ? ""
    : `${formatAmount(side.receivedAmount, side.decimals)} ${side.symbol}`;

const received = (value: RemovalView): string =>
  `${arrived(value.token0)} / ${arrived(value.token1)}`;

export const SunSwapRemoveLiquidityFormatters = {
  sunswapRemoveLiquidity: (value: RemovalView, ctx: TextRenderContext): string => {
    const head: Pair[] = [
      ["Account", accountRow(value, ctx)],
      ["Protocol", value.protocol],
      ...burnedRows(value),
    ];

    if (value.mode === "dry-run" || value.mode === "build-only") {
      const rows: Pair[] = [
        ...head,
        ["Received (est)", received(value)],
        ["Min received", minimumRow(value)],
        ["Recipient", value.recipient],
        ["Deadline", deadline(value.deadline)],
      ];
      return value.mode === "dry-run" ? dryRun(value, rows, ctx) : buildOnly(value, rows, ctx);
    }

    const rows: Pair[] = [
      ...head,
      [
        value.stage !== "confirmed" || value.amountsEstimated ? "Received (est)" : "Received",
        received(value),
      ],
      ["Recipient", value.recipient],
      ["Pool reserves", reservesRow(value)],
      ...(value.approvalTxIds ?? []).map((id, index): Pair => [`Approval tx ${index + 1}`, id]),
      ...(value.txId === undefined ? [] : [["TxID", value.txId] as Pair]),
    ];
    const stage = value.stage ?? "submitted";
    if (stage === "submitted") {
      return receipt(pending(), "Withdrawal submitted", [
        ...rows,
        ["Status", "pending — not yet on-chain"],
      ]);
    }
    if (value.blockNumber !== undefined) rows.push(["Block", `#${formatInt(value.blockNumber)}`]);
    rows.push(
      ...FAMILY_RENDER[renderFamily(ctx)].receiptSettlementRows(value as never, renderSymbol(ctx)),
    );
    if (stage === "failed") {
      rows.push(["Status", "failed"]);
      if (value.result) rows.push(["Reason", String(value.result)]);
      return receipt(fail(), "Liquidity not removed", rows);
    }
    rows.push(["Status", "success"]);
    return receipt(ok(), "Liquidity removed", rows);
  },
};

function burnedRows(value: RemovalView): Pair[] {
  if (value.protocol === "V4") return v4Rows(value);
  if (value.protocol === "V2") {
    return [
      [
        "LP burned",
        // Require LP decimals to avoid displaying base units as whole tokens.
        value.lpAmount === undefined || value.lpDecimals === undefined
          ? ""
          : formatAmount(value.lpAmount, value.lpDecimals),
      ],
    ];
  }
  return [
    ["Position", value.nftTokenId === undefined ? "" : `#${value.nftTokenId}`],
    ["Liquidity burned", value.liquidity === undefined ? "" : formatInt(value.liquidity)],
    ["Liquidity now", value.liquidityAfter === undefined ? "" : formatInt(value.liquidityAfter)],
  ];
}

// V4 pool identity includes tick spacing and hooks, not just tokens and fee tier.
function v4Rows(value: RemovalView): Pair[] {
  const range =
    value.tickLower === undefined || value.tickUpper === undefined
      ? ""
      : // Tick indices stay ungrouped.
        `[${value.tickLower}, ${value.tickUpper}]`;
  return [
    ["Pool", value.poolId ?? ""],
    ["Fee tier", value.feeTier === undefined ? "" : `${value.feeTier / 10_000}%`],
    ["Tick spacing", value.tickSpacing === undefined ? "" : String(value.tickSpacing)],
    ["Hooks", value.hooks ?? ""],
    ["Range", range],
    ["Position", value.nftTokenId === undefined ? "" : `#${value.nftTokenId}`],
    ["Liquidity burned", value.liquidity === undefined ? "" : formatInt(value.liquidity)],
    ["Liquidity now", value.liquidityAfter === undefined ? "" : formatInt(value.liquidityAfter)],
  ];
}

function dryRun(value: RemovalView, rows: Pair[], ctx: TextRenderContext): string {
  const lines = [
    receipt(pending(), "Dry run sunswap remove-liquidity", [
      ...rows,
      feeRow(value, ctx),
      ...approvalRows(value),
    ]),
  ];
  if (value.feeCovers === "approvals") {
    lines.push(
      `${warn()} The withdrawal's own fee cannot be estimated until the approval is on-chain.`,
    );
  }
  if (value.collectsFees) {
    lines.push(
      `${warn()} Any fees this position has accrued are collected in the same transaction, so more may arrive than the estimate above.`,
    );
  }
  // Keep the zero-minimum warning last.
  const unprotected = zeroMinimumNote(value.token0, value.token1);
  if (unprotected !== undefined) lines.push(`${warn()} ${unprotected}`);
  return lines.join("\n\n");
}

function buildOnly(value: RemovalView, rows: Pair[], ctx: TextRenderContext): string {
  const order = (value.transactions ?? []).map((tx, index) => `${index + 1}. ${tx.purpose}`);
  return receipt(pending(), "Built sunswap remove-liquidity", [
    ...rows,
    ["Transactions", order.length === 0 ? "1. main" : order.join("   ")],
    feeRow(value, ctx),
  ]);
}

function feeRow(value: RemovalView, ctx: TextRenderContext): Pair {
  const label = value.feeCovers === "approvals" ? "Fee (est, approvals only)" : "Fee (est)";
  return [label, formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))];
}

function accountRow(value: RemovalView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}

function minimumRow(value: RemovalView): string {
  const min0 = value.token0.amountMinimum;
  const min1 = value.token1.amountMinimum;
  if (min0 === undefined || min1 === undefined) return "";
  return `${formatAmount(min0, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(min1, value.token1.decimals)} ${value.token1.symbol}`;
}

function reservesRow(value: RemovalView): string {
  if (!value.reservesAfter) return "";
  return `${formatAmount(value.reservesAfter.token0, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(value.reservesAfter.token1, value.token1.decimals)} ${value.token1.symbol}`;
}

// V2 withdrawals approve the LP token, not the underlying pair tokens.
function approvalRows(value: RemovalView): Pair[] {
  if (!value.approvals?.length) return [];
  return value.approvals.flatMap((approval, index): Pair[] => {
    const label = value.approvals!.length === 1 ? "" : ` ${index + 1}`;
    return [
      [`Spender${label}`, approval.spender],
      [
        `Allowance${label}`,
        `${formatAmount(approval.amount, approval.decimals)} ${approval.symbol}  (approval tx will be sent first)`,
      ],
    ];
  });
}
