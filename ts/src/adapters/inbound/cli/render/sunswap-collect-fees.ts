/**
 * Text receipts for `sunswap collect-fees`.
 *
 * The shortest of the three: what was collected, and where it went. The recipient row is not
 * decoration — this command is the one that routinely sends money somewhere other than the
 * account that signed, so where it went is the fact a reader is checking.
 */
import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, pending, receipt } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";

interface Side {
  readonly symbol: string;
  /** absent when the read behind it did not answer; never a stand-in zero. */
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

/**
 * Whether the figure is known at all.
 *
 * V3 reads what the contract says is owed and then what its Collect event paid out; V4 reads the
 * LP fee helper. Either read can fail, and then the row names the two sides and says plainly that
 * the amount is not known — rather than printing a zero, which would say the position earned
 * nothing. A zero that DID come from a read prints as a zero, because that is a measurement.
 */
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
