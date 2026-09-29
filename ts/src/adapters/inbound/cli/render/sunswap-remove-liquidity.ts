/**
 * Text receipts for `sunswap remove-liquidity`.
 *
 * The withdrawal's own shape, not the deposit's mirrored: what a person checks after taking
 * money out is how much arrived, and on V3 the principal and the fees arrive in the same
 * transaction. Text gives the TOTAL — that is the number they are looking for — and `-o json`
 * separates the two (PM 6.2.4).
 */
import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, pending, receipt, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";

interface Side {
  readonly symbol: string;
  readonly amount: string;
  readonly amountMinimum?: string;
  readonly feeAmount?: string;
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
  // ── V4 ──────────────────────────────────────────────────────────────────────
  /** the 32-byte pool id. A V4 pool has no address, so this is what names it. */
  readonly poolId?: string;
  readonly feeTier?: number;
  readonly tickSpacing?: number;
  /** already the word for it, never the zero address — see `describeHooks`. */
  readonly hooks?: string;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  readonly reservesAfter?: { readonly token0: string; readonly token1: string };
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

/** UTC to the second, because a deadline is a moment a transaction stops being valid. */
const deadline = (seconds: number): string =>
  `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`;

/** Principal and fees arrive together, so the total is what actually landed. */
const arrived = (side: Side): bigint =>
  side.receivedAmount === undefined
    ? BigInt(side.amount) + BigInt(side.feeAmount ?? "0")
    : BigInt(side.receivedAmount);

const received = (value: RemovalView): string =>
  `${formatAmount(arrived(value.token0).toString(), value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(arrived(value.token1).toString(), value.token1.decimals)} ${value.token1.symbol}`;

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

/** What is being given up: LP tokens on V2, a slice of a position's liquidity on V3 and V4. */
function burnedRows(value: RemovalView): Pair[] {
  if (value.protocol === "V4") return v4Rows(value);
  if (value.protocol === "V2") {
    return [
      [
        "LP burned",
        // BOTH or neither. An LP amount without its scale used to print base units as whole
        // tokens — the misread in the direction that alarms — and a fallback of zero is what made
        // that possible. Missing a scale now renders nothing rather than something wrong.
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

/**
 * What identifies a V4 withdrawal, which is not what identifies a V3 one.
 *
 * A pool id rather than a pair, because two V4 pools can hold the same tokens at the same fee tier
 * and differ in tick spacing or hooks — which is also why the spacing is shown. The position and its
 * range come after, because they are what is actually being reduced.
 *
 * `hooks` arrives already as the WORD for it. The zero address is the address native TRX uses, so
 * printing it raw would say the pool is hooked to TRX.
 */
function v4Rows(value: RemovalView): Pair[] {
  const range =
    value.tickLower === undefined || value.tickUpper === undefined
      ? ""
      : // Plain integers: a tick is an index on a grid, not a quantity.
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
  if (value.token0.amountMinimum === "0" || value.token1.amountMinimum === "0") {
    lines.push(`${warn()} No minimum set — this transaction accepts any output amount.`);
  }
  if (value.feeCovers === "approvals") {
    lines.push(
      `${warn()} The withdrawal's own fee cannot be estimated until the approval is on-chain.`,
    );
  }
  // V3 AND V4 bring the accrued fees out in the same transaction — worth saying before it happens,
  // because the amount that arrives will be larger than the principal the plan quotes. V4 was left
  // out of this once, on PM 6.2's claim that a V4 withdrawal leaves fees behind; measured on Nile it
  // does not (position 7: owed 4821 / 3132 before, 0 / 0 after), so a V4 dry run was quoting only
  // the principal and staying silent about the rest. Same behaviour, same warning.
  if (value.protocol === "V3" || value.protocol === "V4") {
    lines.push(
      `${warn()} Any fees this position has accrued are collected in the same transaction, so more may arrive than the estimate above.`,
    );
  }
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

/**
 * The LP token approval a V2 withdrawal needs.
 *
 * It is the LP token, not the pair's two sides — the pool already holds those. Saying which
 * token is being approved matters more here than on a deposit, because "LP" is not a symbol
 * anyone recognises from their wallet.
 */
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
