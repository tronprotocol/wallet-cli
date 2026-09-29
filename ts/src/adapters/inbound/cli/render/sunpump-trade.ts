/**
 * Text receipts for `sunpump buy` and `sunpump sell`.
 *
 * One renderer for both directions, because a reader checking either is checking the same four
 * things: what went out, what came back, what floor protects it, and what it cost.
 *
 * The two fees are never merged. `platformFee` is SunPump's own, taken out of the TRX on both
 * sides and reported on the line it came out of; the chain's cost is the `Fee` row. Merging them
 * is the commonest misreading of a money receipt, and here they are not even the same currency
 * of concern — one is the market's cut, the other is what the transaction burned.
 */
import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatSun, shorten } from "./scalars.js";
import { fail, ok, pending, receipt, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";

interface ApprovalRow {
  readonly spender: string;
  readonly amount: string;
}

interface TradeView {
  readonly kind: string;
  readonly mode?: string;
  readonly stage?: string;
  readonly account?: string;
  readonly tokenAddress: string;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly slippage?: string;
  readonly platformFee: string;
  readonly platformFeePercent?: string;
  /** buy */
  readonly trxIn?: string;
  readonly tokensOutExpected?: string;
  readonly tokensOut?: string;
  readonly tokensOutMinimum?: string;
  /** sell */
  readonly tokensIn?: string;
  readonly trxOutExpected?: string;
  readonly trxOut?: string;
  readonly trxOutMinimum?: string;
  readonly approvals?: readonly ApprovalRow[];
  readonly fee?: unknown;
  readonly txId?: string;
  readonly approvalTxIds?: readonly string[];
  readonly blockNumber?: number;
  readonly result?: unknown;
}

type Pair = [string, string];

const isBuy = (value: TradeView) => value.kind === "sunpump-buy";

const tokens = (value: TradeView, amount: string) =>
  `${formatAmount(amount, value.tokenDecimals)} ${value.tokenSymbol}`;

export const SunPumpTradeFormatters = {
  sunpumpTrade: (value: TradeView, ctx: TextRenderContext): string => {
    const rows: Pair[] = [
      ["Account", accountRow(value, ctx)],
      ["Token", `${value.tokenSymbol} (${value.tokenAddress})`],
      ...tradeRows(value),
      ["Slippage", value.slippage === undefined ? "" : `${percent(value.slippage)}%`],
    ];

    if (value.mode === "quote") {
      return withFooters(receipt(pending(), `Quote sunpump ${direction(value)}`, rows), value);
    }
    if (value.mode === "dry-run") {
      return withFooters(
        receipt(pending(), `Dry run sunpump ${direction(value)}`, [
          ...rows,
          ["Fee (est)", formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))],
          ...approvalRows(value),
        ]),
        value,
      );
    }
    if (value.mode === "build-only") {
      return receipt(pending(), `Built sunpump ${direction(value)}`, [
        ...rows,
        ["Fee (est)", formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))],
      ]);
    }

    const ids: Pair[] = [
      ...(value.approvalTxIds ?? []).map((id, index): Pair => [
        value.approvalTxIds!.length === 1 ? "Approval tx" : `Approval tx ${index + 1}`,
        id,
      ]),
      ...(value.txId === undefined ? [] : [["TxID", value.txId] as Pair]),
    ];
    const stage = value.stage ?? "submitted";
    if (stage === "submitted") {
      return receipt(pending(), submittedSummary(value), [
        ...rows,
        ...ids,
        ["Status", "pending — not yet on-chain"],
      ]);
    }
    const settled: Pair[] = [...rows, ...ids];
    if (value.blockNumber !== undefined) {
      settled.push(["Block", `#${Number(value.blockNumber).toLocaleString()}`]);
    }
    settled.push(
      ...FAMILY_RENDER[renderFamily(ctx)].receiptSettlementRows(value as never, renderSymbol(ctx)),
    );
    if (stage === "failed") {
      settled.push(["Status", "failed"]);
      if (value.result) settled.push(["Reason", String(value.result)]);
      return receipt(fail(), failedSummary(value), settled);
    }
    settled.push(["Status", "success"]);
    return receipt(ok(), confirmedSummary(value), settled);
  },
};

/**
 * What went out and what comes back, with the platform fee on the line it came out of.
 *
 * A buy's fee is inside the TRX spent; a sale's is taken off the TRX received. Saying so beside
 * the amount is what stops a reader adding it on top of what they already paid.
 */
function tradeRows(value: TradeView): Pair[] {
  if (isBuy(value)) {
    return [
      [
        value.mode === undefined ? "Spent" : "Spend",
        `${formatSun(value.trxIn ?? "0")} TRX (incl. ${formatSun(value.platformFee)} TRX platform fee)`,
      ],
      [
        value.stage === "confirmed" && value.tokensOut !== undefined
          ? "Received"
          : value.mode === undefined
            ? "Received (est)"
            : "Receive (est)",
        value.stage === "confirmed" && value.tokensOut !== undefined
          ? tokens(value, value.tokensOut)
          : value.tokensOutExpected === undefined
            ? ""
            : tokens(value, value.tokensOutExpected),
      ],
      [
        "Min received",
        value.tokensOutMinimum === undefined ? "" : tokens(value, value.tokensOutMinimum),
      ],
    ];
  }
  return [
    [
      value.mode === undefined ? "Sold" : "Sell",
      value.tokensIn === undefined ? "" : tokens(value, value.tokensIn),
    ],
    [
      value.stage === "confirmed" && value.trxOut !== undefined
        ? "Received"
        : value.mode === undefined
          ? "Received (est)"
          : "Receive (est)",
      value.stage === "confirmed" && value.trxOut !== undefined
        ? `${formatSun(value.trxOut)} TRX`
        : value.trxOutExpected === undefined
          ? ""
          : `${formatSun(value.trxOutExpected)} TRX (after ${formatSun(value.platformFee)} TRX platform fee)`,
    ],
    [
      "Min received",
      value.trxOutMinimum === undefined ? "" : `${formatSun(value.trxOutMinimum)} TRX`,
    ],
  ];
}

/**
 * The footers a preview carries.
 *
 * The fee rate is stated only when the 0.01 TRX floor pushed it above 1% — which is exactly when
 * a caller would not have expected it, and the reason a 0.1 TRX buy pays ten percent.
 */
function withFooters(body: string, value: TradeView): string {
  const lines = [body];
  if (value.platformFeePercent !== undefined) {
    lines.push(
      `${warn()} Platform fee is ${value.platformFeePercent}% of this ${direction(value)} (${formatSun("10000")} TRX minimum).`,
    );
  }
  return lines.join("\n\n");
}

function approvalRows(value: TradeView): Pair[] {
  if (!value.approvals?.length) return [];
  return value.approvals.flatMap((approval): Pair[] => [
    ["Spender", approval.spender],
    // Named for what it is. "unlimited" is the honest word for an allowance with no ceiling, and
    // saying the spender is upgradeable is what makes it a decision rather than a formality.
    [
      "Allowance",
      `${approval.amount}  (approval tx will be sent first; spender is an upgradeable proxy)`,
    ],
  ]);
}

const direction = (value: TradeView) => (isBuy(value) ? "buy" : "sell");

const confirmedSummary = (value: TradeView) => (isBuy(value) ? "Buy confirmed" : "Sale confirmed");

const submittedSummary = (value: TradeView) => (isBuy(value) ? "Buy submitted" : "Sale submitted");

const failedSummary = (value: TradeView) =>
  isBuy(value) ? "Buy failed on chain" : "Sale failed on chain";

/** `0.05` reads as `5` in a percent column. */
function percent(slippage: string): string {
  const scaled = (Number(slippage) * 100).toFixed(2);
  return scaled.replace(/\.?0+$/, "");
}

function accountRow(value: TradeView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}
