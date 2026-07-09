import type { TextFormatter } from "../contracts/index.js"
import { formatAtWithRelative, formatSun } from "./scalars.js"
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
  return `available from ${formatAtWithRelative(at)}`
}
