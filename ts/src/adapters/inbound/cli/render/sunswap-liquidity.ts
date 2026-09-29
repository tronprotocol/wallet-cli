/**
 * Text receipts for the SunSwap liquidity commands.
 *
 * Three shapes share one renderer: the plan a `--dry-run` reports, the unsigned transactions
 * `--build-only` emits, and the receipt an execution leaves behind. They carry the same fields
 * for a reason — what a dry run promises is what the receipt should show, and a reader comparing
 * the two should not have to translate between them.
 *
 * Contract addresses stay out of text and live in the JSON only (PM 6.0): the router is not a
 * decision the reader makes, and putting it in the table crowds out what is.
 */
import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, receipt, pending, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";

interface Side {
  readonly symbol: string;
  readonly amount: string;
  readonly amountMinimum?: string;
  readonly decimals: number;
  /** needed to tell a native side from a token one, which V4 does not wrap. */
  readonly address?: string;
}

interface ApprovalRow {
  readonly symbol: string;
  readonly spender: string;
  readonly amount: string;
  readonly decimals: number;
}

interface LiquidityView {
  readonly mode?: string;
  readonly stage?: string;
  readonly amountsEstimated?: boolean;
  readonly account?: string;
  readonly protocol: string;
  // ── V4 ──────────────────────────────────────────────────────────────────────
  /** the CEILING on each side; absent when no tolerance moved it off the deposit. */
  readonly amount0Max?: string;
  readonly amount1Max?: string;
  /** TRX the transaction locks on a native pair, which is the ceiling rather than the deposit. */
  readonly nativeLocked?: string;
  readonly poolId?: string;
  readonly tickSpacing?: number;
  /** already the word for it, never the zero address — see `describeHooks`. */
  readonly hooks?: string;
  readonly poolCreated?: boolean;
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
  readonly liquidity?: string;
  readonly poolHasNoPrice?: boolean;
  readonly reservesAfter?: { readonly token0: string; readonly token1: string };
  readonly approvals?: readonly ApprovalRow[];
  readonly fee?: unknown;
  readonly feeCovers?: string;
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

/** UTC to the second, because a deadline is a moment a transaction stops being valid. */
const deadline = (seconds: number): string =>
  `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`;

export const SunSwapLiquidityFormatters = {
  sunswapLiquidity: (value: LiquidityView, ctx: TextRenderContext): string => {
    // PM 2.10's order: who pays, what goes out, what comes back, the floor, the rest of the
    // inputs. The same rows lead the execution receipt, so the two read as one document.
    if (value.mode === "dry-run" || value.mode === "build-only") {
      const rows: Pair[] = [
        ["Account", accountRow(value, ctx)],
        ["Protocol", value.protocol],
        ...positionRows(value),
        ["Deposit", `${amount(value.token0)} / ${amount(value.token1)}`],
        // V4 has NO minimum — it is bounded from ABOVE — so the row is a ceiling there, or nothing
        // when no tolerance moved it. Printing "Min deposit 0" on V4 said the opposite of the truth.
        ...(isV4(value) ? ceilingRows(value) : ([["Min deposit", minimumRow(value)]] as Pair[])),
        ["LP received (est)", lpRow(value, value.lpAmountExpected)],
        ["Liquidity", value.liquidity === undefined ? "" : formatInt(value.liquidity)],
        ["Recipient", value.recipient],
        ["Deadline", deadline(value.deadline)],
      ];
      return value.mode === "dry-run" ? dryRun(value, rows, ctx) : buildOnly(value, rows, ctx);
    }
    return executed(value, ctx);
  },
};

/** Sent deposits retain an estimate label until their actual amounts are read. */
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
    // Approvals are listed above the main transaction id, in the order they were sent, so the
    // sequence a reader sees matches the sequence the chain saw.
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
  // A reverted deposit is still a transaction that happened and was paid for, so it reports like
  // one rather than like an error (PM 2.8).
  if (stage === "failed") {
    rows.push(["Status", "failed"]);
    if (value.result) rows.push(["Reason", String(value.result)]);
    return receipt(fail(), "Liquidity not added", rows);
  }
  rows.push(["Status", "success"]);
  return receipt(ok(), "Liquidity added", rows);
}

/**
 * The V3 position rows: which position, and the range it occupies.
 *
 * A range is the position's whole economic shape — outside it the position earns nothing — so
 * the receipt states it even when the CLI chose it, and marks that it did (PM 6.1.3).
 */
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
      : // Plain integers: a tick is an index on a grid, not a quantity, and "-8,030" reads as a
        // number of something.
        `[${value.tickLower}, ${value.tickUpper}]${value.tickRangeAuto ? "  (default)" : ""}`;
  return [
    ["Position", position],
    ["Fee tier", tier],
    ["Tick range", range],
  ];
}

/** What the pool holds now, in the caller's token order — read back after confirmation. */
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
  // A floor of zero accepts any output at all, which is a real choice and an unusual one, so it
  // is said out loud before anything is signed — and only then (PM 6.0).
  // NOT on V4: there is no minimum there by design, because the bound sits on the other side. Saying
  // "accepts any output amount" would tell a caller they are unprotected when the protection is a
  // ceiling — a warning that contradicts the command it is attached to.
  if (!isV4(value) && acceptsAnything(value)) {
    lines.push(`${warn()} No minimum set — this transaction accepts any output amount.`);
  }
  // What a native V4 deposit LOCKS, said only when it differs from what it deposits. The distinction
  // is the point: the ceiling is sent as the call's value and the remainder comes back, so a reader
  // needs to know what must be available rather than only what will be spent.
  if (value.nativeLocked !== undefined) {
    const side = isNativeSide(value.token0) ? value.token0 : value.token1;
    lines.push(
      `${warn()} This deposit locks ${formatAmount(value.nativeLocked, side.decimals)} TRX as the transaction's value — about ${amount(side)} is expected to be deposited and the rest returned. The full amount must be available.`,
    );
  }
  // The deposit's own price is unknowable until its approval is on-chain, so a reader is told
  // that the number above is not the whole cost rather than left to infer it.
  if (value.feeCovers === "approvals") {
    lines.push(
      `${warn()} The deposit's own fee cannot be estimated until the approval is on-chain.`,
    );
  }
  // A pool pinned at the edge of the tick range was initialised and never traded. A deposit into
  // it looks like success and lands entirely on one side, earning nothing — so it is said before
  // anything is signed, which is the whole point of a dry run.
  if (value.poolHasNoPrice) {
    lines.push(
      `${warn()} This pool has no established price — it was initialised and never traded. A deposit into it will be one-sided.`,
    );
  }
  return lines.join("\n\n");
}

/**
 * `--build-only` prints what was built, never the hex.
 *
 * The transactions themselves belong to `-o json`: they are for a caller to sign and broadcast,
 * and a screenful of hex is not something a person reads. What text owes the reader is how many
 * transactions there are and in what order they must go.
 */
function buildOnly(value: LiquidityView, rows: Pair[], ctx: TextRenderContext): string {
  const order = (value.transactions ?? []).map((tx, index) => `${index + 1}. ${tx.purpose}`);
  return receipt(pending(), "Built sunswap add-liquidity", [
    ...rows,
    ["Transactions", order.join("   ")],
    feeRow(value, ctx),
  ]);
}

/**
 * The fee row, labelled by what it actually covers.
 *
 * `Fee (est, approvals only)` rather than `Fee (est)` when the deposit could not be priced: one
 * label over two meanings is how a reader budgets for one transaction and pays for three.
 */
function feeRow(value: LiquidityView, ctx: TextRenderContext): Pair {
  const label = value.feeCovers === "approvals" ? "Fee (est, approvals only)" : "Fee (est)";
  return [label, formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))];
}

function accountRow(value: LiquidityView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}

/** The LP token's own decimals, read from the pair — never assumed, because the assumption
 *  would move the decimal point on what the reader is told they receive. */
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

function acceptsAnything(value: LiquidityView): boolean {
  return value.token0.amountMinimum === "0" || value.token1.amountMinimum === "0";
}

/**
 * The approvals a plan will send, with what the router may move today.
 *
 * Omitted entirely when nothing needs approving, so an empty section never leaves a reader
 * wondering whether an approval is still coming (PM 13.3).
 */
function approvalRows(value: LiquidityView): Pair[] {
  if (!value.approvals?.length) return [];
  return value.approvals.flatMap((approval, index): Pair[] => {
    const label = value.approvals!.length === 1 ? "" : ` ${index + 1}`;
    return [
      [`Spender${label}`, approval.spender],
      // The HUMAN amount, matching the Deposit row above it. Printing base units beside a symbol
      // reads as a vastly larger approval than it is — "1000000 USDT" for a 1 USDT deposit — and
      // an approval a reader misreads upward is the one they would refuse.
      [
        `Allowance${label}`,
        // MAX_UINT256 scaled by a token's decimals prints as a 78-digit decimal, which reads as noise
        // rather than as the unbounded grant it is. Named for what it means instead.
        `${isUnlimited(approval.amount) ? "unlimited" : `${formatAmount(approval.amount, approval.decimals)} ${approval.symbol}`}  (approval tx will be sent first)`,
      ],
    ];
  });
}

const MAX_UINT256 = (2n ** 256n - 1n).toString();

/** An unbounded allowance, named rather than printed as a 78-digit decimal. */
function isUnlimited(amount: string): boolean {
  return amount === MAX_UINT256 || amount === "unlimited";
}

const isV4 = (value: LiquidityView): boolean => value.protocol === "V4";

/** Native TRX, which V4 does not wrap. The zero address doubles as "no hook" — see `describeHooks`. */
const isNativeSide = (side: Side): boolean => side.address === "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

/**
 * V4's ceiling, and only when a tolerance moved it.
 *
 * Unset `--slippage` makes the ceiling exactly the deposit, and a row repeating the figure above it
 * teaches a reader to skip the section. So nothing is printed then — the same rule the approvals
 * follow.
 */
function ceilingRows(value: LiquidityView): Pair[] {
  if (value.amount0Max === undefined || value.amount1Max === undefined) return [];
  return [
    [
      "Max deposit",
      `${formatAmount(value.amount0Max, value.token0.decimals)} ${value.token0.symbol} / ${formatAmount(value.amount1Max, value.token1.decimals)} ${value.token1.symbol}`,
    ],
  ];
}

/**
 * What identifies a V4 deposit, which is not what identifies a V3 one.
 *
 * A pool id rather than a position and a tier, because two V4 pools can share a pair and a fee and
 * differ in tick spacing or hooks. The spacing is shown for the same reason: it is part of the pool's
 * identity, not a consequence of the tier.
 *
 * `hooks` arrives already as the WORD for it — "none" for a pool with no hook — because the zero
 * address is also the address native TRX uses, and printing it would say the pool is hooked to TRX.
 */
function v4Rows(value: LiquidityView): Pair[] {
  const range =
    value.tickLower === undefined || value.tickUpper === undefined
      ? ""
      : `[${value.tickLower}, ${value.tickUpper}]${value.tickRangeAuto ? "  (default)" : ""}`;
  return [
    // Absent on a mint, where the id is assigned during execution and nothing before the receipt
    // can know it — so the row is omitted rather than printed empty or as "new".
    ...(value.nftTokenId === undefined ? [] : ([["Position", `#${value.nftTokenId}`]] as Pair[])),
    [
      "Pool",
      value.poolId === undefined
        ? ""
        : `${value.poolId}${value.poolCreated ? "  (created by this deposit)" : ""}`,
    ],
    ["Fee tier", value.feeTier === undefined ? "" : `${value.feeTier / 10_000}%`],
    ["Tick spacing", value.tickSpacing === undefined ? "" : String(value.tickSpacing)],
    ["Hooks", value.hooks ?? ""],
    ["Range", range],
  ];
}
