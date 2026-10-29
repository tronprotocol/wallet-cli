import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import {
  formatAmount,
  formatScalar,
  formatUsd,
  formatUsdPrice,
  formatTime,
  num,
  quote,
} from "./scalars.js";
import {
  type Obj,
  type Pair,
  asObj,
  query,
  receipt,
  table,
  ok,
  fail,
  unknown,
  warn,
} from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";

function humanBalance(d: Obj): string {
  return d.decimals !== undefined
    ? formatAmount(d.balance ?? "0", num(d.decimals, 0))
    : formatScalar(d.balance);
}

// rawBalance is in base units; balance is already scaled.
function holdingBalance(h: Obj): string {
  return h.rawBalance !== undefined && h.rawBalance !== null && h.decimals !== undefined
    ? formatAmount(h.rawBalance, num(h.decimals, 0))
    : formatScalar(h.balance);
}

export const AccountFormatters = {
  accountBalance: ((data, ctx) => {
    const d = asObj(data);
    const symbol = d.symbol ? ` ${String(d.symbol)}` : "";
    return query([identity(ctx, d.address), ["Balance", `${humanBalance(d)}${symbol}`]]);
  }) satisfies TextFormatter,
  accountInfo: ((data, ctx) => renderAccountInfo(asObj(data), ctx)) satisfies TextFormatter,
  accountHistory: ((data, ctx) => {
    const d = asObj(data);
    const rows = (Array.isArray(d.records) ? d.records : []).map(asObj).map(historyRow);
    return [
      `${quote(acct(ctx, d.address))} recent transactions`,
      table(["Time", "Type", "Amount", "From / To", "Status"], rows),
    ].join("\n");
  }) satisfies TextFormatter,
  tokenBookAdd: ((data) => {
    const d = asObj(data);
    const token = asObj(d.token);
    const verb = d.action === "updated" ? "Updated token book" : "Added to token book";
    return receipt(ok(), verb, [
      ["Name", String(token.name ?? "")],
      ["Symbol", String(token.symbol ?? token.id ?? "")],
      ["Decimals", token.decimals === undefined ? "" : String(token.decimals)],
    ]);
  }) satisfies TextFormatter,
  tokenBookList: ((data) => {
    const d = asObj(data);
    const rows = (Array.isArray(d.tokens) ? d.tokens : [])
      .map(asObj)
      .map((t) => [
        String(t.symbol ?? ""),
        String(t.name ?? ""),
        String(t.source ?? ""),
        String(t.id ?? ""),
      ]);
    return table(["Symbol", "Name", "Source", "Contract / ID"], rows);
  }) satisfies TextFormatter,
  tokenBookRemove: ((data) => {
    const removed = asObj(asObj(data).removed);
    return receipt(ok(), "Removed from token book", [
      ["Name", String(removed.name ?? "")],
      ["Symbol", String(removed.symbol ?? "")],
    ]);
  }) satisfies TextFormatter,
  accountPortfolio: ((data, ctx) => {
    const d = asObj(data);
    const holdings = (Array.isArray(d.holdings) ? d.holdings : []).map(asObj);
    const rows = holdings.map((h) => [
      String(h.symbol ?? ""),
      h.balanceUnavailable ? "unavailable" : holdingBalance(h),
      h.priceUsd === null || h.priceUsd === undefined ? "-" : `$${formatUsdPrice(h.priceUsd)}`,
      h.valueUsd === null || h.valueUsd === undefined ? "-" : `$${formatUsd(h.valueUsd)}`,
    ]);
    const total =
      d.totalValueUsd === null || d.totalValueUsd === undefined
        ? "-"
        : `$${formatUsd(d.totalValueUsd)}`;
    const lines = [
      `${quote(acct(ctx, d.address ?? d.account))} Portfolio`,
      table(["Token", "Balance", "Price (USD)", "Value (USD)"], rows),
      `Total ≈ ${total}`,
    ];
    for (const h of holdings) {
      if (h.balanceUnavailable)
        lines.push(
          `${warn()} ${String(h.symbol ?? "")} balance unavailable (${String(h.reason ?? "")})`,
        );
    }
    if (d.priceUnavailable) lines.push(`${warn()} price warning (${String(d.priceReason ?? "")})`);
    return lines.join("\n");
  }) satisfies TextFormatter,

  tokenBalance: ((data, ctx) => {
    const d = asObj(data);
    return query([
      identity(ctx, d.address),
      ["Name", String(d.name ?? "")],
      ["Symbol", String(d.symbol ?? "")],
      ["Balance", humanBalance(d)],
    ]);
  }) satisfies TextFormatter,
  tokenInfo: ((data) => {
    const d = asObj(data);
    return query([
      ["Name", String(d.name ?? d.token_name ?? d.id ?? "")],
      ["Symbol", String(d.symbol ?? d.abbr ?? "")],
      ["Decimals", String(d.decimals ?? d.precision ?? "")],
    ]);
  }) satisfies TextFormatter,
};

function renderAccountInfo(d: Obj, ctx: TextRenderContext): string {
  const pairs: Pair[] = [];
  if (ctx.accountLabel) pairs.push(["Label", ctx.accountLabel]);
  pairs.push(...FAMILY_RENDER[renderFamily(ctx)].accountInfoRows(d, renderSymbol(ctx)));
  return query(pairs);
}

const HISTORY_STATUS: Record<string, () => string> = { ok, failed: fail, unknown };

function historyRow(r: Obj): string[] {
  return [
    formatTime(r.time),
    String(r.type ?? ""),
    `${formatScalar(r.amount ?? "")}${r.symbol ? ` ${String(r.symbol)}` : ""}`,
    String(r.counterparty ?? ""),
    (HISTORY_STATUS[String(r.status)] ?? unknown)(),
  ];
}

function acct(ctx: TextRenderContext, address: unknown): string {
  return ctx.accountLabel ?? String(address ?? "");
}

function identity(ctx: TextRenderContext, address: unknown): Pair {
  return ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(address ?? "")];
}
