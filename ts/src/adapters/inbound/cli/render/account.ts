import type { TextFormatter, TextRenderContext } from "../contracts/index.js"
import { RESOURCES, resourceOfRpcCode, type Resource } from "../../../../domain/resources/index.js"
import { fromBaseUnits } from "../../../../domain/amounts/index.js"
import { formatScalar, formatInt, formatUsd, formatSun, formatTime, num, quote } from "./scalars.js"
import { type Obj, type Pair, asObj, query, receipt, table, ok, fail, warn } from "./layout.js"

/** humanize a raw base-unit balance: scale by `decimals` when known, else show the raw integer. */
function humanBalance(d: Obj): string {
  return d.decimals !== undefined ? fromBaseUnits(String(d.balance ?? "0"), num(d.decimals, 0)) : formatScalar(d.balance)
}

export const AccountFormatters = {
  accountBalance: ((data, ctx) => {
    const d = asObj(data)
    const symbol = d.symbol ? ` ${String(d.symbol)}` : ""
    return query([identity(ctx, d.address), ["Balance", `${humanBalance(d)}${symbol}`]])
  }) satisfies TextFormatter,
  accountInfo: ((data, ctx) => renderAccountInfo(asObj(data), ctx)) satisfies TextFormatter,
  accountHistory: ((data, ctx) => {
    const d = asObj(data)
    const rows = (Array.isArray(d.records) ? d.records : []).map(asObj).map(historyRow)
    return [`${quote(acct(ctx, d.address))} recent transactions`, table(["Time", "Type", "Amount", "From / To", "Status"], rows)].join("\n")
  }) satisfies TextFormatter,
  tokenBookAdd: ((data) => {
    const d = asObj(data)
    const token = asObj(d.token)
    const verb = d.action === "updated" ? "Updated token book" : "Added to token book"
    return receipt(ok(), verb, [
      ["Name", String(token.name ?? "")],
      ["Symbol", String(token.symbol ?? token.id ?? "")],
      ["Decimals", token.decimals === undefined ? "" : String(token.decimals)],
    ])
  }) satisfies TextFormatter,
  tokenBookList: ((data) => {
    const d = asObj(data)
    const rows = (Array.isArray(d.tokens) ? d.tokens : []).map(asObj).map((t) => [String(t.symbol ?? ""), String(t.name ?? ""), String(t.source ?? ""), String(t.id ?? "")])
    return table(["Symbol", "Name", "Source", "Contract / ID"], rows)
  }) satisfies TextFormatter,
  tokenBookRemove: ((data) => {
    const removed = asObj(asObj(data).removed)
    return receipt(ok(), "Removed from token book", [
      ["Name", String(removed.name ?? "")],
      ["Symbol", String(removed.symbol ?? "")],
    ])
  }) satisfies TextFormatter,
  accountPortfolio: ((data, ctx) => {
    const d = asObj(data)
    const holdings = (Array.isArray(d.holdings) ? d.holdings : []).map(asObj)
    const rows = holdings.map((h) => [
      String(h.symbol ?? ""),
      h.balanceUnavailable ? "unavailable" : formatScalar(h.balance),
      h.priceUsd === null || h.priceUsd === undefined ? "-" : `$${formatUsd(h.priceUsd)}`,
      h.valueUsd === null || h.valueUsd === undefined ? "-" : `$${formatUsd(h.valueUsd)}`,
    ])
    const total = d.totalValueUsd === null || d.totalValueUsd === undefined ? "-" : `$${formatUsd(d.totalValueUsd)}`
    const lines = [`${quote(acct(ctx, d.address ?? d.account))} Portfolio`, table(["Token", "Balance", "Price (USD)", "Value (USD)"], rows), `Total ≈ ${total}`]
    for (const h of holdings) {
      if (h.balanceUnavailable) lines.push(`${warn()} ${String(h.symbol ?? "")} balance unavailable (${String(h.reason ?? "")})`)
    }
    if (d.priceUnavailable) lines.push(`${warn()} price warning (${String(d.priceReason ?? "")})`)
    return lines.join("\n")
  }) satisfies TextFormatter,

  tokenBalance: ((data, ctx) => {
    const d = asObj(data)
    return query([identity(ctx, d.address), ["Name", String(d.name ?? "")], ["Symbol", String(d.symbol ?? "")], ["Balance", humanBalance(d)]])
  }) satisfies TextFormatter,
  tokenInfo: ((data) => {
    const d = asObj(data)
    return query([
      ["Name", String(d.name ?? d.token_name ?? d.id ?? "")],
      ["Symbol", String(d.symbol ?? d.abbr ?? "")],
      ["Decimals", String(d.decimals ?? d.precision ?? "")],
    ])
  }) satisfies TextFormatter,
}

function renderAccountInfo(d: Obj, ctx: TextRenderContext): string {
  const account = asObj(d.account)
  const owner = asObj(account.owner_permission)
  const active = Array.isArray(account.active_permission) ? account.active_permission.length : 0
  const created = account.create_time ? new Date(Number(account.create_time)).toISOString().slice(0, 10) : ""
  const ownerKeys = Array.isArray(owner.keys) ? owner.keys.length : "?"
  const resources = asObj(d.resources)
  const bandwidth = asObj(resources.bandwidth)
  const energy = asObj(resources.energy)
  const pairs: Pair[] = []
  if (ctx.accountLabel) pairs.push(["Label", ctx.accountLabel])
  pairs.push(["Address", String(d.address ?? "")])
  pairs.push(["Balance", `${formatSun(account.balance)} TRX`])
  const staked = stakedSummary(account)
  if (staked) pairs.push(["Staked", staked])
  if (resources.energy) pairs.push(["Energy", `used ${formatInt(energy.used)} / ${formatInt(energy.limit)}`])
  if (resources.bandwidth) pairs.push(["Bandwidth", `used ${formatInt(bandwidth.used)} / ${formatInt(bandwidth.limit)}`])
  pairs.push(["Created", created])
  pairs.push(["Permissions", `owner ${String(owner.threshold ?? "?")}-of-${ownerKeys}, ${active} active group${active === 1 ? "" : "s"}`])
  return query(pairs)
}

/** Sum FreezeBalanceV2 stakes into a "<total> TRX (energy <e> + bandwidth <b>)" summary. */
function stakedSummary(account: Obj): string {
  const frozen = Array.isArray(account.frozenV2) ? account.frozenV2.map(asObj) : []
  // frozenV2's bandwidth entries carry no `type`, so an unrecognized code folds into bandwidth.
  const sums = new Map<Resource, bigint>(RESOURCES.map((r) => [r, 0n]))
  for (const f of frozen) {
    const r = resourceOfRpcCode(String(f.type ?? "")) ?? "bandwidth"
    const amount = safeUnsignedBigInt(f.amount ?? 0)
    // An unsafe JS number has already lost precision. Omit the summary instead of presenting a
    // plausible but incorrect total; the raw account payload remains available in JSON mode.
    if (amount === null) return ""
    sums.set(r, (sums.get(r) ?? 0n) + amount)
  }
  const total = RESOURCES.reduce((t, r) => t + (sums.get(r) ?? 0n), 0n)
  if (total === 0n) return ""
  const parts = RESOURCES.map((r) => `${r} ${formatSun(sums.get(r) ?? 0n)}`).join(" + ")
  return `${formatSun(total)} TRX (${parts})`
}

function safeUnsignedBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value)
  return null
}

function historyRow(r: Obj): string[] {
  const ts = r.time ?? r.block_timestamp ?? r.timestamp
  const type = r.type ?? r.transfer_type ?? r.direction ?? ""
  const amount = r.amount ?? r.value ?? r.quant ?? ""
  const symbol = r.symbol ?? (r.token_info && typeof r.token_info === "object" ? asObj(r.token_info).symbol : undefined)
  const counterparty = r.counterparty ?? r.to ?? r.from ?? ""
  const status = r.status === "failed" || r.confirmed === false ? "failed" : "ok"
  return [formatTime(ts), String(type), `${formatScalar(amount)}${symbol ? ` ${String(symbol)}` : ""}`, String(counterparty), status === "ok" ? ok() : fail()]
}

/** account display id for receipts: the centrally-injected --account label when present,
 *  else the full on-chain address. Callers add their own quoting where wanted. */
function acct(ctx: TextRenderContext, address: unknown): string {
  return ctx.accountLabel ?? String(address ?? "")
}

/** identity field pair: prefer the account label, else show the full address — the field
 *  name tracks the value's real meaning (§0.4). */
function identity(ctx: TextRenderContext, address: unknown): Pair {
  return ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(address ?? "")]
}
