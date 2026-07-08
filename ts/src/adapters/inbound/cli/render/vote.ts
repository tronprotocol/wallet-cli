import type { TextFormatter, TextRenderContext } from "../contracts/index.js"
import { formatInt, formatSun } from "./scalars.js"
import { type Obj, asObj, query, table } from "./layout.js"

export const VoteFormatters = {
  voteList: ((data) => {
    const witnesses = rowsOf(asObj(data).witnesses)
    return table(["Rank", "Name", "Votes", "APR", "Reward ratio", "Address"], witnesses.map((w) => [
      formatInt(w.rank),
      String(w.name ?? ""),
      formatInt(w.voteCount),
      pct(w.aprPct),
      pct(w.rewardRatioPct),
      String(w.address ?? ""),
    ]))
  }) satisfies TextFormatter,
  voteStatus: ((data, ctx) => renderVoteStatus(asObj(data), ctx)) satisfies TextFormatter,
}

function renderVoteStatus(data: Obj, ctx: TextRenderContext): string {
  const votingPower = asObj(data.votingPower)
  const votes = rowsOf(data.votes)
  const lines = [
    query([
      ctx.accountLabel ? ["Label", ctx.accountLabel] : ["Address", String(data.address ?? "")],
      ["Voting power", `${formatInt(votingPower.total)} TP  (used ${formatInt(votingPower.used)} / available ${formatInt(votingPower.available)})`],
      ["Claimable", `${formatSun(data.claimableRewardSun)} TRX`],
    ]),
    "",
    `Current votes (${votes.length})`,
    table(["Name", "Votes", "APR", "Reward ratio", "Address"], votes.map((vote) => [
      String(vote.name ?? ""),
      formatInt(vote.count),
      pct(vote.aprPct),
      pct(vote.rewardRatioPct),
      String(vote.witness ?? ""),
    ])),
  ]
  for (const warning of ctx.warnings ?? []) {
    if (warning.startsWith("zero_reward_ratio:")) {
      lines.push(`! ${warning.replace(/^zero_reward_ratio:\s*/, "")}`)
    }
  }
  return lines.join("\n")
}

function rowsOf(value: unknown): Obj[] {
  return (Array.isArray(value) ? value : []).map(asObj)
}

function pct(value: unknown): string {
  if (value === null || value === undefined) return "-"
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  return `${Number.isInteger(n) ? String(n) : String(n)}%`
}
