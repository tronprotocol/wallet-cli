import type { TextRenderContext } from "../contracts/command.js";
import { formatAmount, formatInt, shorten } from "./scalars.js";
import { fail, ok, pending, receipt, table, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";
import { formatFee } from "./tx.js";
import { fromTokenBook, TOKEN_BOOK_MARK } from "./token-book.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";

interface Side {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
}

interface ApprovalRow {
  readonly spender: string;
  readonly amount: string;
}

interface PermitView {
  readonly permit2: string;
  readonly spender: string;
  readonly amount: string;
  readonly expiration: string;
}

// Route amounts are base units, scaled by each side's decimals.
interface QuotedRoute {
  readonly amountIn: string;
  readonly amountOut: string;
  readonly path: readonly Side[];
  readonly protocols?: readonly string[];
  readonly tradingFee: string;
  readonly priceImpactPercent?: string;
  readonly containsUnverifiedHook?: boolean;
}

interface SwapView {
  readonly mode?: string;
  readonly stage?: string;
  readonly account?: string;
  readonly market: string;
  readonly amountIn?: string;
  readonly tokenIn?: Side;
  readonly tokenOut?: Side;
  readonly routes?: readonly QuotedRoute[];
  readonly routesAvailable?: number;
  readonly amountOutExpected?: string;
  readonly priceImpactPercent?: string;
  readonly amountOut?: string;
  readonly amountOutMinimum?: string;
  readonly slippage?: string;
  readonly tradingFee: string;
  readonly route?: {
    readonly path: readonly { readonly symbol: string }[];
    readonly containsUnverifiedHook?: boolean;
  };
  readonly approvals?: readonly ApprovalRow[];
  readonly permit?: PermitView;
  readonly feeCovers?: string;
  readonly feeUnavailableReason?: string;
  readonly fee?: unknown;
  readonly txId?: string;
  readonly approvalTxIds?: readonly string[];
  readonly blockNumber?: number;
  readonly result?: unknown;
}

type Pair = [string, string];

const marketLabel = (market: string) =>
  market === "sunpump" ? "SunPump bonding curve" : "SunSwap";

const amount = (value: string, side: Side) =>
  `${formatAmount(value, side.decimals)} ${side.symbol}`;

export const SunSwapSwapFormatters = {
  sunswapSwap: (value: SwapView, ctx: TextRenderContext): string => {
    if (value.mode === "quote") return quote(value);

    const tokenIn = value.tokenIn ?? UNKNOWN_SIDE;
    const tokenOut = value.tokenOut ?? UNKNOWN_SIDE;
    const out = value.amountOut ?? value.amountOutExpected;
    const spent =
      value.market === "sunpump" && tokenIn.address === NATIVE_TRX_ADDRESS
        ? `${amount(value.amountIn ?? "0", tokenIn)} (incl. ${formatAmount(value.tradingFee, 6)} TRX platform fee)`
        : amount(value.amountIn ?? "0", tokenIn);
    const received =
      value.market === "sunpump" &&
      tokenOut.address === NATIVE_TRX_ADDRESS &&
      out !== undefined &&
      value.amountOut === undefined
        ? `${amount(out, tokenOut)} (after ${formatAmount(value.tradingFee, 6)} TRX platform fee)`
        : out === undefined
          ? ""
          : amount(out, tokenOut);

    const rows: Pair[] = [
      ["Account", accountRow(value, ctx)],
      ["Market", marketLabel(value.market)],
      ["Token in", tokenAddress(value, tokenIn.address)],
      ["Token out", tokenAddress(value, tokenOut.address)],
      [value.mode === undefined ? "Spent" : "Spend", spent],
      [
        value.mode === undefined
          ? value.stage === "confirmed" && value.amountOut !== undefined
            ? "Received"
            : "Received (est)"
          : "Receive (est)",
        received,
      ],
      [
        "Min received",
        value.amountOutMinimum === undefined ? "" : amount(value.amountOutMinimum, tokenOut),
      ],
      ["Slippage", value.slippage === undefined ? "" : `${percent(value.slippage)}%`],
      ...(value.priceImpactPercent === undefined
        ? []
        : ([["Price impact (quote)", `${value.priceImpactPercent}%`]] as Pair[])),
    ];

    if (value.mode === "dry-run") {
      const label = value.feeCovers === "approvals" ? "Fee (est, approval only)" : "Fee (est)";
      return withNotes(
        receipt(pending(), "Dry run sunswap swap", [
          ...rows,
          [label, formatFee(value.fee, renderFamily(ctx), renderSymbol(ctx))],
          ...approvalRows(value),
          ...permitRows(value),
        ]),
        value,
      );
    }
    if (value.mode === "build-only") {
      return receipt(pending(), "Built sunswap swap", [
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
      return withNotes(
        receipt(pending(), "Swap submitted", [
          ...rows,
          ...permitRows(value),
          ...ids,
          ["Status", "pending — not yet on-chain"],
        ]),
        value,
      );
    }
    // Permits can outlive a swap; retain the grant and expiry on its receipt.
    const settled: Pair[] = [...rows, ...permitRows(value), ...ids];
    if (value.blockNumber !== undefined) {
      settled.push(["Block", `#${formatInt(value.blockNumber)}`]);
    }
    settled.push(
      ...FAMILY_RENDER[renderFamily(ctx)].receiptSettlementRows(value as never, renderSymbol(ctx)),
    );
    if (stage === "failed") {
      settled.push(["Status", "failed"]);
      if (value.result) settled.push(["Reason", String(value.result)]);
      return withNotes(receipt(fail(), "Swap failed on chain", settled), value);
    }
    settled.push(["Status", "success"]);
    return withNotes(receipt(ok(), summary(value, tokenIn, tokenOut, out), settled), value);
  },
};

// Quotes have no enforceable minimum; fee meaning depends on the market.
function quote(value: SwapView): string {
  const routes = value.routes ?? [];
  const feeHeader = value.market === "sunpump" ? "Platform fee" : "Trading fee";
  const impact = routes.some((route) => route.priceImpactPercent !== undefined);
  const headers = ["Route", "Amount in", "Amount out", feeHeader];
  if (impact) headers.push("Price impact");
  const rows = routes.map((route) => {
    const first = route.path[0] ?? UNKNOWN_SIDE;
    const last = route.path[route.path.length - 1] ?? UNKNOWN_SIDE;
    const cells = [
      route.path.map((hop) => hop.symbol).join(" → "),
      amount(route.amountIn, first),
      amount(route.amountOut, last),
      value.market === "sunpump"
        ? `${formatAmount(route.tradingFee, 6)} TRX`
        : amount(route.tradingFee, first),
    ];
    if (impact)
      cells.push(route.priceImpactPercent === undefined ? "—" : `${route.priceImpactPercent}%`);
    return cells;
  });
  // Every route joins the same input and output tokens.
  const ends = routes[0]?.path ?? [];
  const lines = [
    `Market  ${marketLabel(value.market)}`,
    `Token in  ${tokenAddress(value, ends[0]?.address)}`,
    `Token out  ${tokenAddress(value, ends[ends.length - 1]?.address)}`,
    "",
    table(headers, rows),
  ];
  if (value.routesAvailable !== undefined && value.routesAvailable > routes.length) {
    lines.push("", `${routes.length} of ${value.routesAvailable} routes shown — --all lists them.`);
  }
  if (routes.some((route) => route.containsUnverifiedHook)) {
    lines.push("", `${warn()} A route passes through an unverified hook contract.`);
  }
  return lines.join("\n");
}

// Curve sales grant unlimited allowance; router swaps approve the trade amount.
function approvalRows(value: SwapView): Pair[] {
  if (!value.approvals?.length) return [];
  const curve = value.market === "sunpump";
  return value.approvals.flatMap((approval): Pair[] => [
    ["Spender", approval.spender],
    [
      "Allowance",
      curve
        ? `${approval.amount}  (approval tx will be sent first; spender is an upgradeable proxy)`
        : `${approval.amount}  (approval tx will be sent first; exactly this trade)`,
    ],
  ]);
}

function permitRows(value: SwapView): Pair[] {
  const permit = value.permit;
  if (permit === undefined) return [];
  return [
    ["Permit2", permit.permit2],
    ["Permit grants", `${permit.amount} to ${shorten(permit.spender)}`],
    ["Permit expires", `${formatTimestamp(permit.expiration)} (1 hour)`],
  ];
}

function withNotes(body: string, value: SwapView): string {
  const notes: string[] = [];
  if (value.approvals?.length && value.market === "sunpump") {
    notes.push(
      `${warn()} Selling into the curve approves the SunPump proxy without limit, as \`sunpump sell\` does.`,
    );
  }
  if (value.feeUnavailableReason || value.feeCovers === "approvals") {
    notes.push(
      value.market === "sunswap" && value.permit === undefined
        ? `${warn()} The swap's own fee cannot be estimated until the approval is on-chain.`
        : `${warn()} The swap's own fee cannot be estimated until the Permit2 authorization is signed, which a dry run does not do.`,
    );
  }
  if (value.route?.containsUnverifiedHook) {
    notes.push(`${warn()} This route passes through an unverified hook contract.`);
  }
  // TRC20 approvals have no expiry; signed Permit2 grants do.
  if (value.stage === "failed" && value.permit !== undefined) {
    notes.push(
      `${warn()} The TRC20 approval is still in place and does not expire automatically. The Permit2 grant is limited to this trade and expires at ${formatTimestamp(value.permit.expiration)}.`,
    );
  }
  return notes.length === 0 ? body : `${body}\n\n${notes.join("\n\n")}`;
}

// Input is Unix seconds; output uses UTC.
function formatTimestamp(seconds: string): string {
  const at = new Date(Number(seconds) * 1000);
  return Number.isFinite(at.getTime())
    ? `${at.toISOString().slice(0, 19).replace("T", " ")} UTC`
    : seconds;
}

function summary(value: SwapView, tokenIn: Side, tokenOut: Side, out: string | undefined): string {
  if (value.amountOut === undefined) return "Swap confirmed";
  const got = out === undefined ? "" : amount(out, tokenOut);
  return `Swapped ${amount(value.amountIn ?? "0", tokenIn)} for ${got}`;
}

function tokenAddress(value: SwapView, address: string | undefined): string {
  if (!address) return "";
  return fromTokenBook(value, address) ? `${address} ${TOKEN_BOOK_MARK}` : address;
}

const UNKNOWN_SIDE: Side = { address: "", symbol: "", decimals: 0 };

function percent(slippage: string): string {
  return (Number(slippage) * 100).toFixed(2).replace(/\.?0+$/, "");
}

function accountRow(value: SwapView, ctx: TextRenderContext): string {
  if (value.account === undefined) return "";
  const short = shorten(value.account);
  return ctx.accountLabel ? `${short} (${ctx.accountLabel})` : short;
}
