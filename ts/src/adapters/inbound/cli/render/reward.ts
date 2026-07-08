import type { TextFormatter } from "../contracts/index.js"
import { formatSun } from "./scalars.js"
import { type Obj, asObj, query } from "./layout.js"

export const RewardFormatters = {
  rewardBalance: ((data, ctx) => {
    const d = asObj(data)
    return query([
      ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(d.address ?? "")],
      ["Claimable", `${formatSun(d.rewardSun)} TRX`],
      ["Withdraw status", withdrawStatus(d)],
    ])
  }) satisfies TextFormatter,
}

function withdrawStatus(d: Obj): string {
  if (d.withdrawableNow === true || d.withdrawableAt === null || d.withdrawableAt === undefined) {
    return "available now"
  }
  const at = Number(d.withdrawableAt)
  if (!Number.isFinite(at) || at <= 0) return "available now"
  return `available from ${formatLocalMinute(at)} (${relativeFromNow(at)})`
}

function formatLocalMinute(epochMs: number): string {
  const d = new Date(epochMs)
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function relativeFromNow(epochMs: number): string {
  const ms = Math.max(0, epochMs - Date.now())
  const hours = Math.ceil(ms / (60 * 60 * 1000))
  if (hours < 48) return `~${hours}h`
  return `~${Math.ceil(hours / 24)}d`
}
