import type { TxInfoView, TxReceiptKind, TxReceiptView, TxStatusView } from "../../../../domain/types/index.js"
import type { TextFormatter, TextRenderContext } from "../contracts/index.js"
import { ChainFamily } from "../../../../domain/family/index.js"
import { fromBaseUnits } from "../../../../domain/amounts/index.js"
import { formatScalar, formatInt, formatSun, num, shorten, methodName } from "./scalars.js"
import { type Pair, asObj, query, receipt, ok, fail, pending, unknown } from "./layout.js"
import { FAMILY_RENDER, renderFamily } from "./family.js"

export const TxFormatters = {
  txReceipt: ((r, ctx?: TextRenderContext) => renderTxReceipt(r, ctx)) satisfies TextFormatter<TxReceiptView>,
  txStatus: ((r) => {
    // `state` is computed by the command (tron: getTransactionById + receipt result) — no family branch.
    const status = {
      confirmed: `confirmed ${ok()}`,
      failed: `failed ${fail()}`,
      pending: `pending ${pending()}`,
      not_found: `not found ${unknown()}`,
    }[r.state]
    return query([
      ["TxID", r.txid],
      ["Status", status],
      ["Block", r.blockNumber === undefined ? "" : `#${formatInt(r.blockNumber)}`],
    ])
  }) satisfies TextFormatter<TxStatusView>,
  txInfo: ((r, ctx) => {
    return query(FAMILY_RENDER[renderFamily(ctx)].txInfoRows(r))
  }) satisfies TextFormatter<TxInfoView>,
}

/** Default-mode broadcast/dry-run/sign-only receipt for tx/stake/contract signing commands.
 *  Narrows on the typed `kind`; the active family comes from `ctx.net` (see renderFamily) — no
 *  `family` in the payload, no stringly command-id matching, no alias probing. */
function renderTxReceipt(r: TxReceiptView, ctx?: TextRenderContext): string {
  const family = renderFamily(ctx)
  if (r.mode === "dry-run") {
    return receipt(pending(), `Dry run ${actionLabel(r.kind)}`, [
      ["Fee", formatFee(r.fee, family)],
      ["Tx", summarizeTx(r.tx)],
    ])
  }
  if (r.mode === "build-only") {
    return r.hex ?? receipt(pending(), `Built ${actionLabel(r.kind)}`, [
      ["Fee", formatFee(r.fee, family)],
      ["Tx", summarizeTx(r.tx)],
    ])
  }
  if (r.mode === "sign-only") {
    // kv() drops empty rows, so a fee-less signature (tx sign estimates nothing) omits the Fee line.
    return receipt(ok(), `Signed ${actionLabel(r.kind)}`, [
      ["Address", r.address ?? ""],
      ["TxID", String(r.txId ?? "")],
      ["Fee", r.fee ? formatFee(r.fee, family) : ""],
      ...signatureRows(r.signed),
    ])
  }
  const txid = String(r.txId ?? r.hash ?? "")
  const stage = r.stage ?? "submitted"
  const summary = receiptSummary(r, family)
  const pairs: Pair[] = [...receiptRows(r)]
  if (txid) pairs.push(["TxID", txid])

  // submitted (default, non-blocking): txid only, no fee/energy yet — those need confirmation.
  if (stage === "submitted") {
    pairs.push(["Status", submittedStatus(r.kind)])
    const body = receipt(pending(), summary, pairs)
    const networkFlag = ctx?.net ? ` --network ${ctx.net.id}` : ""
    return txid ? `${body}\n! Track it: wallet-cli tx info${networkFlag} --txid ${txid}` : body
  }

  // confirmed / failed (after --wait): real on-chain block / fee / energy / result.
  if (r.blockNumber !== undefined && r.blockNumber !== null) pairs.push(["Block", `#${formatInt(r.blockNumber)}`])
  if (r.energyUsed !== undefined && r.energyUsed !== null) pairs.push(["Energy", formatInt(r.energyUsed)])
  if (r.feeSun !== undefined && r.feeSun !== null) pairs.push(["Fee", `${formatSun(r.feeSun)} TRX`])
  if (r.kind === "stake-unfreeze") pairs.push(["Withdrawable", "after the unlock period — then run `stake withdraw`"])
  if (stage === "failed") {
    pairs.push(["Status", "failed"])
    if (r.result) pairs.push(["Reason", String(r.result)])
    return receipt(fail(), summary, pairs)
  }
  pairs.push(["Status", successStatus(r.kind)])
  return receipt(ok(), summary, pairs)
}

function submittedStatus(kind: TxReceiptKind): string {
  switch (kind) {
    case "vote-cast":
      return "pending — tallied at next maintenance cycle (~6h)"
    case "reward-withdraw":
      return "pending — next withdrawal available in ~24h"
    default:
      return "pending — not yet on-chain"
  }
}

function successStatus(kind: TxReceiptKind): string {
  switch (kind) {
    case "vote-cast":
      return "success — tallied at next maintenance cycle (~6h)"
    case "reward-withdraw":
      return "success — next withdrawal available in ~24h"
    default:
      return "success"
  }
}

/** the verb-phrase summary for a broadcast receipt, by action kind. */
function receiptSummary(r: TxReceiptView, family: ChainFamily): string {
  const stakeAmt = r.amountSun !== undefined ? `${formatSun(r.amountSun)} TRX` : "TRX"
  const resource = r.resource ? String(r.resource) : ""
  switch (r.kind) {
    case "stake-freeze":
      return `Staked ${stakeAmt}${resource ? ` for ${resource}` : ""}`
    case "stake-unfreeze":
      return `Unstaked ${stakeAmt}`
    case "stake-delegate":
      return `Delegated ${stakeAmt}${resource ? ` of ${resource}` : ""}`
    case "stake-undelegate":
      return `Reclaimed ${stakeAmt}${resource ? ` of ${resource}` : ""}`
    case "stake-withdraw":
      return r.withdrawnSun ? `Withdrew ${formatSun(r.withdrawnSun)} TRX to balance` : "Withdrew expired TRX to balance"
    case "stake-cancel":
      return "Cancelled pending unstakes"
    case "contract-send":
      return `Called ${methodName(String(r.method ?? ""))}`
    case "contract-deploy":
      return "Contract deployed"
    case "vote-cast": {
      const count = Array.isArray(r.votes) ? r.votes.length : 0
      const across = `across ${formatInt(count)} witness${count === 1 ? "" : "es"}`
      return r.totalVotes === undefined ? `Voted ${across}` : `Voted ${formatInt(r.totalVotes)} TP ${across}`
    }
    case "reward-withdraw":
      return "Withdrew voting/block rewards"
    case "send": {
      const amount = receiptAmount(r, family)
      return amount ? `Sent ${amount}` : "Sent"
    }
    case "broadcast":
      return "Broadcast"
    // `tx sign` never broadcasts, so it never reaches a broadcast summary; the case keeps the
    // switch total over TxReceiptKind.
    case "sign":
      return "Signed"
    case "permission-update":
      return "Permissions updated"
  }
}

/** action-specific extra rows (To/From/Address/Contract), by kind. */
function receiptRows(r: TxReceiptView): Pair[] {
  const rows: Pair[] = []
  if (r.kind === "stake-delegate") rows.push(["To", String(r.receiver ?? "")])
  else if (r.kind === "stake-undelegate") rows.push(["From", String(r.receiver ?? "")])
  else if (r.kind === "contract-deploy") rows.push(["Address", String(r.contractAddress ?? "")])
  else if (r.kind === "vote-cast" && Array.isArray(r.votes)) rows.push(["Votes", r.votes.map((vote) => `${vote.witness}=${formatInt(vote.count)}`).join(", ")])
  else if (r.kind === "reward-withdraw") rows.push(["Amount", `${formatSun(r.rewardSun ?? r.withdrawnSun ?? 0)} TRX`])
  else if (r.to ?? r.receiver) rows.push(["To", String(r.to ?? r.receiver)])
  if (r.kind === "contract-send") rows.push(["Contract", String(r.contract ?? "")])
  return rows
}

/** broadcast-receipt amount: token-aware (symbol/decimals when known, else the contract/asset-id
 *  identifier for raw-amount sends), native smallest-unit → coin only when no token is involved. */
function receiptAmount(r: TxReceiptView, family: ChainFamily): string {
  if (r.rawAmount !== undefined && r.rawAmount !== null && r.rawAmount !== "") {
    const raw = String(r.rawAmount)
    const isToken = r.token !== undefined || r.contract !== undefined || r.assetId !== undefined
    if (isToken) {
      const human = r.decimals !== undefined && r.decimals !== null ? fromBaseUnits(raw, num(r.decimals, 0)) : formatScalar(raw)
      const label = r.token ?? r.contract ?? (r.assetId !== undefined ? `asset ${String(r.assetId)}` : "")
      return label ? `${human} ${String(label)}` : human
    }
    return FAMILY_RENDER[family].nativeAmount(raw)
  }
  if (r.amountSun) return `${formatSun(r.amountSun)} TRX`
  return ""
}

/** human label for an action kind, e.g. "send" → "tx send" (for dry-run/sign-only headers). */
function actionLabel(kind: TxReceiptKind): string {
  switch (kind) {
    case "send":
      return "tx send"
    case "broadcast":
      return "tx broadcast"
    // reads as "Signed transaction"; "tx sign" would render as "Signed tx sign".
    case "sign":
      return "transaction"
    case "stake-freeze":
      return "stake freeze"
    case "stake-unfreeze":
      return "stake unfreeze"
    case "stake-delegate":
      return "stake delegate"
    case "stake-undelegate":
      return "stake undelegate"
    case "stake-withdraw":
      return "stake withdraw"
    case "stake-cancel":
      return "stake cancel-unfreeze"
    case "contract-send":
      return "contract send"
    case "contract-deploy":
      return "contract deploy"
    case "vote-cast":
      return "vote cast"
    case "reward-withdraw":
      return "reward withdraw"
    case "permission-update":
      return "permission update"
  }
}

function formatFee(fee: unknown, family: ChainFamily): string {
  if (!fee) return "unknown"
  if (typeof fee === "object") {
    const f = asObj(fee)
    if (f.feeSun) return `${formatSun(f.feeSun)} TRX`
    if (f.bandwidthBurnSunIfNoFreeze) return `${formatSun(f.bandwidthBurnSunIfNoFreeze)} TRX`
    // energy estimate (TRC20/contract via estimateResources): no sun figure — staked energy may
    // cover it. Report the estimated energy + whether the account's available energy covers it.
    if (f.energy !== undefined) {
      const energy = Number(f.energy)
      const avail = f.availableEnergy === undefined ? undefined : Number(f.availableEnergy)
      const covered = avail !== undefined && avail >= energy ? " (covered by staked energy)" : ""
      return `~${energy.toLocaleString()} energy${covered}`
    }
    if (f.note) return String(f.note)
  }
  return FAMILY_RENDER[family].feeFallback(fee)
}

/** Signatures are the whole point of a sign-only receipt and the user has to copy them somewhere,
 *  so they are never shortened — unlike the dry-run `Tx` row, which only identifies a blob the
 *  command did not produce. TRON carries `signature[]` (several when co-signing a multi-sig
 *  transaction); a family whose signed form is one opaque string shows that string instead. */
function signatureRows(signed: unknown): Pair[] {
  if (typeof signed === "string") return [["Signed", signed]]
  const sigs = (signed as { signature?: unknown } | null)?.signature
  if (Array.isArray(sigs) && sigs.length > 0) {
    return sigs.map((s, i): Pair => [sigs.length === 1 ? "Signature" : `Signature ${i + 1}`, String(s)])
  }
  return [["Signed", summarizeTx(signed)]]
}

function summarizeTx(tx: unknown): string {
  if (!tx || typeof tx !== "object") return formatScalar(tx)
  const o = asObj(tx)
  return shorten(String(o.txid ?? o.txID ?? o.hash ?? JSON.stringify(o)))
}
