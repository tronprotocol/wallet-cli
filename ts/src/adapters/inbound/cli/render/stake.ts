import type { TextFormatter } from "../contracts/index.js"
import { formatAtWithRelative, formatDecimal, formatInt, formatSun } from "./scalars.js"
import { type Pair, asObj, kv, query } from "./layout.js"

const trx = (sun: unknown) => `${formatDecimal(formatSun(sun))} TRX`

export const StakeFormatters = {
  stakeInfo: ((data, ctx) => {
    const d = asObj(data)
    const staked = asObj(d.staked); const vp = asObj(d.votingPower)
    const res = asObj(d.resource); const energy = asObj(res.energy); const bandwidth = asObj(res.bandwidth)
    const unfreeze = asObj(d.unfreeze)
    const unfreezing = Array.isArray(d.unfreezing) ? d.unfreezing.map(asObj) : []
    const totalStaked = BigInt(String(staked.energySun ?? "0")) + BigInt(String(staked.bandwidthSun ?? "0"))
    const lines: Pair[] = [
      ["Label", ctx.accountLabel ?? ""],
      ["Staked", `${trx(totalStaked.toString())}  (for energy ${trx(staked.energySun)} + for bandwidth ${trx(staked.bandwidthSun)})`],
      ["Voting power", `${formatInt(vp.total)} TP  (used ${formatInt(vp.used)} / available ${formatInt(vp.available)})`],
      ["Energy", `used ${formatInt(energy.used)} / ${formatInt(energy.limit)}`],
      ["Bandwidth", `used ${formatInt(bandwidth.used)} / ${formatInt(bandwidth.limit)}`],
      ["Unfreezing", `${unfreezing.length} pending  (max ${formatInt(unfreeze.max)} at a time, ${formatInt(unfreeze.remaining)} more allowed)`],
    ]
    const body = query(lines)
    // Tree-style unstake list, indented to the value column (label width + 2) and branched
    // ├─ / └─; amounts are padded so the withdrawable column lines up across rows.
    const branchPad = " ".repeat(Math.max(...lines.map(([l]) => l.length)) + 2)
    const amounts = unfreezing.map((u) => trx(u.amountSun))
    const amtWidth = Math.max(0, ...amounts.map((a) => a.length))
    const pendings = unfreezing.map((u, i) => {
      const branch = i === unfreezing.length - 1 ? "└─" : "├─"
      return `${branchPad}${branch} ${amounts[i]!.padEnd(amtWidth)}  withdrawable ${formatAtWithRelative(u.withdrawableAt)}`
    })
    const tail = kv([["Withdrawable", `${trx(d.withdrawableSun)} now`]], "")
    return [body, ...pendings, tail].join("\n")
  }) satisfies TextFormatter,

  stakeDelegated: ((data, ctx) => {
    const d = asObj(data)
    const out = d.direction === "out"
    const rows = (Array.isArray(d.delegations) ? d.delegations.map(asObj) : [])
    const head = query([
      ["Label", ctx.accountLabel ?? ""],
      ["Direction", out ? "out (delegated to others)" : "in (delegated to me)"],
    ])
    const sections: string[] = [head]
    if (out && d.canDelegateMaxSun) {
      const max = asObj(d.canDelegateMaxSun)
      sections.push("", "Max delegatable", kv([
        ["Energy", `${trx(max.energy)}`],
        ["Bandwidth", `${trx(max.bandwidth)}`],
      ], "  "))
    }
    const lockCol = out ? "Locked until" : "Guaranteed until"
    const lockText = (v: unknown) => v ? formatAtWithRelative(v) : out ? "not locked" : "none — reclaimable anytime"
    const table = rows.map((r) => [String(out ? r.receiver : r.from), String(r.resource), trx(r.amountSun), lockText(r.lockedUntil)])
    const header = [out ? "Receiver" : "From", "Resource", "Amount", lockCol]
    const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i]!.length)))
    const fmtRow = (row: string[]) => `  ${row.map((c, i) => c.padEnd(widths[i]!)).join("  ")}`.trimEnd()
    sections.push("", `Delegations (${rows.length})`, fmtRow(header), ...table.map(fmtRow))
    return sections.join("\n")
  }) satisfies TextFormatter,
}
