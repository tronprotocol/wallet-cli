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
  // votes on a 0%-reward-ratio SR earn nothing — surface a `!` line straight from the data
  // (same style as tx.ts's `! Track it:`); the json warning is emitted separately via scope.warn.
  for (const vote of votes) {
    if (vote.rewardRatioPct === 0) {
      lines.push(`! ${formatInt(vote.count)} votes on ${String(vote.name ?? vote.witness ?? "")} earn nothing — 0% reward ratio`)
    }
  }
  return lines.join("\n")
}

function rowsOf(value: unknown): Obj[] {
  return (Array.isArray(value) ? value : []).map(asObj)
}

function pct(value: unknown): string {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  return `${String(n)}%`
}
