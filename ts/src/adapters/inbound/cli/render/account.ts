import type { TextFormatter, TextRenderContext } from "../contracts/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { formatScalar, formatUsd, formatUsdPrice, formatTime, num, quote } from "./scalars.js";
import { type Obj, type Pair, asObj, query, receipt, table, ok, fail, warn } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";

/** humanize a raw base-unit balance: scale by `decimals` when known, else show the raw integer. */
function humanBalance(d: Obj): string {
  return d.decimals !== undefined
    ? fromBaseUnits(String(d.balance ?? "0"), num(d.decimals, 0))
    : formatScalar(d.balance);
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
      h.balanceUnavailable ? "unavailable" : formatScalar(h.balance),
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

/**
 * `account info` — family-shaped.
 *
 * TRON returns the node's account object (permissions, resources, stakes); EVM has no equivalent
 * RPC and returns a flat `{balance, nonce, type, codeSize?}`. These are not the same field set with
 * different values, so the rows come from the family table rather than from one formatter reading
 * whichever keys happen to be present — the TRON reader applied to an EVM payload found nothing
 * and printed "Balance 0 TRX" for an account holding ETH.
 */
function renderAccountInfo(d: Obj, ctx: TextRenderContext): string {
  const pairs: Pair[] = [];
  if (ctx.accountLabel) pairs.push(["Label", ctx.accountLabel]);
  pairs.push(...FAMILY_RENDER[renderFamily(ctx)].accountInfoRows(d, renderSymbol(ctx)));
  return query(pairs);
}

function historyRow(r: Obj): string[] {
  const ts = r.time ?? r.block_timestamp ?? r.timestamp;
  const type = r.type ?? r.transfer_type ?? r.direction ?? "";
  const amount = r.amount ?? r.value ?? r.quant ?? "";
  const symbol =
    r.symbol ??
    (r.token_info && typeof r.token_info === "object" ? asObj(r.token_info).symbol : undefined);
  const counterparty = r.counterparty ?? r.to ?? r.from ?? "";
  const status = r.status === "failed" || r.confirmed === false ? "failed" : "ok";
  return [
    formatTime(ts),
    String(type),
    `${formatScalar(amount)}${symbol ? ` ${String(symbol)}` : ""}`,
    String(counterparty),
    status === "ok" ? ok() : fail(),
  ];
}

/** account display id for receipts: the centrally-injected --account label when present,
 *  else the full on-chain address. Callers add their own quoting where wanted. */
function acct(ctx: TextRenderContext, address: unknown): string {
  return ctx.accountLabel ?? String(address ?? "");
}

/** identity field pair: prefer the account label, else show the full address — the field
 *  name tracks the value's real meaning (§0.4). */
function identity(ctx: TextRenderContext, address: unknown): Pair {
  return ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(address ?? "")];
}
