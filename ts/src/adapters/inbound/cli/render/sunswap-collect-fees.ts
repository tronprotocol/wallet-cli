import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, pending, receipt } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";

interface Side {
  readonly symbol: string;
  // Absent means unavailable, not zero; amounts are in base units.
  readonly amount?: string;
  readonly decimals?: number;
}

interface CollectView {
  readonly mode?: string;
  readonly stage?: string;
  readonly amountsEstimated?: boolean;
  readonly account?: string;
  readonly protocol: string;
  readonly nftTokenId?: string;
  readonly recipient: string;
  readonly token0: Side;
  readonly token1: Side;
  readonly fee?: unknown;
  readonly txId?: string;
  readonly blockNumber?: number;
  readonly result?: unknown;
}

type Pair = [string, string];

const amount = (side: Side): string =>
  side.amount === undefined
    ? side.symbol
    : `${formatAmount(side.amount, side.decimals ?? 0)} ${side.symbol}`;

const priced = (value: CollectView): boolean =>
  value.token0.amount !== undefined || value.token1.amount !== undefined;

export const SunSwapCollectFeesFormatters = {
  sunswapCollectFees: (value: CollectView, ctx: TextRenderContext): string => {
    const collected = `${amount(value.token0)} / ${amount(value.token1)}`;
    const label = priced(value)
      ? value.mode === undefined && value.stage === "confirmed" && !value.amountsEstimated
        ? "Collected"
        : "Collected (est)"
      : "Collecting";
    const rows: Pair[] = [
      ["Account", accountRow(value, ctx)],
      ["Protocol", value.protocol],
      ["Position", value.nftTokenId === undefined ? "" : `#${value.nftTokenId}`],
      [
        label,
        priced(value)
          ? collected
          : `${collected} — everything owed; the amount could not be read, see 'sunswap position-list'`,
      ],
      ["Recipient", value.recipient],
    ];

    if (value.mode === "dry-run") {
      return receipt(pending(), "Dry run sunswap collect-fees", [
        ...rows,
        ["Fee (est)", formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))],
      ]);
    }
    if (value.mode === "build-only") {
      return receipt(pending(), "Built sunswap collect-fees", [
        ...rows,
        ["Transactions", "1. main"],
        ["Fee (est)", formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))],
      ]);
    }

    if (value.txId !== undefined) rows.push(["TxID", value.txId]);
    const stage = value.stage ?? "submitted";
    if (stage === "submitted") {
      return receipt(pending(), "Collection submitted", [
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
      return receipt(fail(), "Fees not collected", rows);
    }
    rows.push(["Status", "success"]);
    return receipt(ok(), "Fees collected", rows);
  },
};

function accountRow(value: CollectView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}
