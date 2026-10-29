import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, receipt, pending, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";
import { zeroMinimumNote } from "./sunswap-minimum.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";

interface Side {
  readonly symbol: string;
  readonly amount: string;
  readonly amountMinimum?: string;
  readonly acceptsAnyAmount?: boolean;
  readonly decimals: number;
  readonly address?: string;
}

interface ApprovalRow {
  readonly symbol: string;
  readonly spender: string;
  readonly amount: string;
  readonly isUnlimited?: boolean;
  readonly decimals: number;
}

interface LiquidityView {
  readonly mode?: string;
  readonly stage?: string;
  readonly amountsEstimated?: boolean;
  readonly account?: string;
  readonly protocol: string;
  // Maximum deposits in base units.
  readonly amount0Max?: string;
  readonly amount1Max?: string;
  // Native call value in SUN; includes the deposit ceiling.
  readonly nativeLocked?: string;
  readonly poolId?: string;
  readonly tickSpacing?: number;
  // Preformatted hook label, including "none" for the zero address.
  readonly hooks?: string;
  readonly initialSqrtPriceX96?: string;
  readonly initialPrice?: { token0: string; token1: string; token1PerToken0: string };
  readonly recipient: string;
  readonly deadline: number;
  readonly token0: Side;
  readonly token1: Side;
  readonly lpAmountExpected?: string;
  readonly lpAmount?: string;
  readonly lpDecimals?: number;
  readonly nftTokenId?: string;
  readonly newPosition?: boolean;
  readonly feeTier?: number;
  readonly tickLower?: number;
  readonly tickUpper?: number;
  // Liquidity added by the confirmed deposit.
  readonly liquidity?: string;
  readonly liquidityExpected?: string;
  readonly poolHasNoPrice?: boolean;
  readonly reservesAfter?: { readonly token0: string; readonly token1: string };
  readonly approvals?: readonly ApprovalRow[];
  readonly fee?: unknown;
  readonly feeCovers?: string;
  readonly feeUnavailableReason?: string;
  readonly feeAuto?: boolean;
  readonly tickRangeAuto?: boolean;
  readonly txId?: string;
  readonly approvalTxIds?: readonly string[];
  readonly transactions?: readonly { readonly purpose: string }[];
  readonly blockNumber?: number;
  readonly result?: unknown;
}

type Pair = [string, string];

const amount = (side: Side): string => `${formatAmount(side.amount, side.decimals)} ${side.symbol}`;

const deadline = (seconds: number): string =>
  `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`;

export const SunSwapLiquidityFormatters = {
  sunswapLiquidity: (value: LiquidityView, ctx: TextRenderContext): string => {
    if (value.mode === "dry-run" || value.mode === "build-only") {
      const rows: Pair[] = [
        ["Account", accountRow(value, ctx)],
        ["Protocol", value.protocol],
        ...positionRows(value),
        ["Deposit", `${amount(value.token0)} / ${amount(value.token1)}`],
        // V4 bounds deposits from above, not below.
        ...(isV4(value) ? ceilingRows(value) : ([["Min deposit", minimumRow(value)]] as Pair[])),
        ["LP received (est)", lpRow(value, value.lpAmountExpected)],
        [
          "Liquidity",
          value.liquidityExpected === undefined ? "" : formatInt(value.liquidityExpected),
        ],
        ["Recipient", value.recipient],
        ["Deadline", deadline(value.deadline)],
      ];
      return value.mode === "dry-run" ? dryRun(value, rows, ctx) : buildOnly(value, rows, ctx);
    }
    return executed(value, ctx);
  },
};

function executed(value: LiquidityView, ctx: TextRenderContext): string {
  const stage = value.stage ?? "submitted";
  const rows: Pair[] = [
    ["Account", accountRow(value, ctx)],
    ["Protocol", value.protocol],
    ...positionRows(value),
    [
      stage !== "confirmed" || value.amountsEstimated ? "Deposited (est)" : "Deposited",
      `${amount(value.token0)} / ${amount(value.token1)}`,
    ],
    ["LP received", lpRow(value, value.lpAmount)],
    ["Liquidity", value.liquidity === undefined ? "" : formatInt(value.liquidity)],
    ["Recipient", value.recipient],
    ["Pool reserves", reservesRow(value)],
    ...(value.approvalTxIds ?? []).map((id, index): Pair => [`Approval tx ${index + 1}`, id]),
    ...(value.txId === undefined ? [] : [["TxID", value.txId] as Pair]),
  ];

  if (stage === "submitted") {
    return receipt(pending(), "Liquidity submitted", [
      ...rows,
      ["Status", "pending — not yet on-chain"],
    ]);
  }

  if (value.blockNumber !== undefined) rows.push(["Block", `#${formatInt(value.blockNumber)}`]);
  rows.push(
    ...FAMILY_RENDER[renderFamily(ctx)].receiptSettlementRows(value as never, renderSymbol(ctx)),
  );
  // Failed deposits still incur chain fees.
  if (stage === "failed") {
    rows.push(["Status", "failed"]);
    if (value.result) rows.push(["Reason", String(value.result)]);
    return receipt(fail(), "Liquidity not added", rows);
  }
  rows.push(["Status", "success"]);
  return receipt(ok(), "Liquidity added", rows);
}

function positionRows(value: LiquidityView): Pair[] {
  if (value.protocol === "V4") return v4Rows(value);
  if (value.protocol !== "V3") return [];
  const position =
    value.nftTokenId === undefined
      ? value.newPosition === false
        ? ""
        : "new"
      : `#${value.nftTokenId}${value.newPosition ? " (new)" : ""}`;
  const tier =
    value.feeTier === undefined
      ? ""
      : `${value.feeTier / 10_000}%${value.feeAuto ? "  (default)" : ""}`;
  const range =
    value.tickLower === undefined || value.tickUpper === undefined
      ? ""
      : // Tick indices stay ungrouped.
        `[${value.tickLower}, ${value.tickUpper}]${value.tickRangeAuto ? "  (default)" : ""}`;
  return [
    ["Position", position],
    ["Fee tier", tier],
    ["Tick range", range],
  ];
}

function reservesRow(value: LiquidityView): string {
  if (!value.reservesAfter) return "";
  return `${formatAmount(value.reservesAfter.token0, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(value.reservesAfter.token1, value.token1.decimals)} ${value.token1.symbol}`;
}

function dryRun(value: LiquidityView, rows: Pair[], ctx: TextRenderContext): string {
  const lines = [
    receipt(pending(), "Dry run sunswap add-liquidity", [
      ...rows,
      feeRow(value, ctx),
      ...approvalRows(value),
    ]),
  ];
  // Native V4 call value covers the ceiling; unused TRX is refunded.
  if (value.nativeLocked !== undefined) {
    const side = isNativeSide(value.token0) ? value.token0 : value.token1;
    lines.push(
      `${warn()} This deposit locks ${formatAmount(value.nativeLocked, side.decimals)} TRX as the transaction's value — about ${amount(side)} is expected to be deposited and the rest returned. The full amount must be available.`,
    );
  }
  if (value.feeUnavailableReason || value.feeCovers === "approvals") {
    lines.push(
      `${warn()} ${value.feeUnavailableReason ?? "The deposit's own fee cannot be estimated until the approval is on-chain."}`,
    );
  }
  if (value.poolHasNoPrice) {
    lines.push(
      `${warn()} This pool has no established price — it was initialised and never traded. A deposit into it will be one-sided.`,
    );
  }
  // Keep the zero-minimum warning last.
  const unprotected = zeroMinimumNote(value.token0, value.token1);
  if (unprotected !== undefined) lines.push(`${warn()} ${unprotected}`);
  return lines.join("\n\n");
}

function buildOnly(value: LiquidityView, rows: Pair[], ctx: TextRenderContext): string {
  const order = (value.transactions ?? []).map((tx, index) => `${index + 1}. ${tx.purpose}`);
  return receipt(pending(), "Built sunswap add-liquidity", [
    ...rows,
    ["Transactions", order.join("   ")],
    feeRow(value, ctx),
  ]);
}

function feeRow(value: LiquidityView, ctx: TextRenderContext): Pair {
  const label = value.feeCovers === "approvals" ? "Fee (est, approvals only)" : "Fee (est)";
  return [label, formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))];
}

function accountRow(value: LiquidityView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}

// Require the LP token's decimals to avoid displaying base units as whole tokens.
function lpRow(value: LiquidityView, lp: string | undefined): string {
  if (lp === undefined || value.lpDecimals === undefined) return "";
  return formatAmount(lp, value.lpDecimals);
}

function minimumRow(value: LiquidityView): string {
  const min0 = value.token0.amountMinimum;
  const min1 = value.token1.amountMinimum;
  if (min0 === undefined || min1 === undefined) return "";
  return `${formatAmount(min0, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(min1, value.token1.decimals)} ${value.token1.symbol}`;
}

function approvalRows(value: LiquidityView): Pair[] {
  if (!value.approvals?.length) return [];
  return value.approvals.flatMap((approval, index): Pair[] => {
    const label = value.approvals!.length === 1 ? "" : ` ${index + 1}`;
    return [
      [`Spender${label}`, approval.spender],
      [
        `Allowance${label}`,
        // Name unlimited allowances explicitly instead of displaying a huge decimal.
        `${approval.isUnlimited ? "unlimited" : `${formatAmount(approval.amount, approval.decimals)} ${approval.symbol}`}  (approval tx will be sent first)`,
      ],
    ];
  });
}

const isV4 = (value: LiquidityView): boolean => value.protocol === "V4";

// V4 uses the zero address for native TRX.
const isNativeSide = (side: Side): boolean => side.address === NATIVE_TRX_ADDRESS;

function ceilingRows(value: LiquidityView): Pair[] {
  if (value.amount0Max === undefined || value.amount1Max === undefined) return [];
  return [
    [
      "Max deposit",
      `${formatAmount(value.amount0Max, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(value.amount1Max, value.token1.decimals)} ${value.token1.symbol}`,
    ],
  ];
}

// V4 pool identity includes tick spacing and hooks, not just tokens and fee tier.
function v4Rows(value: LiquidityView): Pair[] {
  const range =
    value.tickLower === undefined || value.tickUpper === undefined
      ? ""
      : `[${value.tickLower}, ${value.tickUpper}]${value.tickRangeAuto ? "  (default)" : ""}`;
  return [
    ...(value.nftTokenId === undefined ? [] : ([["Position", `#${value.nftTokenId}`]] as Pair[])),
    ["Pool", value.poolId ?? ""],
    ...(value.initialSqrtPriceX96 === undefined
      ? []
      : ([
          [
            "Create pool",
            `yes — initial sqrtPriceX96 ${value.initialSqrtPriceX96}` +
              (value.initialPrice
                ? ` (≈ 1 ${value.initialPrice.token0} = ${value.initialPrice.token1PerToken0} ${value.initialPrice.token1})`
                : ""),
          ],
        ] as Pair[])),
    ["Fee tier", value.feeTier === undefined ? "" : `${value.feeTier / 10_000}%`],
    ["Tick spacing", value.tickSpacing === undefined ? "" : String(value.tickSpacing)],
    ["Hooks", value.hooks ?? ""],
    ["Range", range],
  ];
}
