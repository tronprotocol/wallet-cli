import type { TextFormatter } from "../contracts/index.js"
import { formatDecimal, formatInt, formatSun } from "./scalars.js"
import { asObj, query, table } from "./layout.js"

const KNOWN_UNITS: Record<string, "SUN" | "ms"> = {
  getEnergyFee: "SUN",
  getTransactionFee: "SUN",
  getCreateAccountFee: "SUN",
  getCreateNewAccountFeeInSystemContract: "SUN",
  getWitnessPayPerBlock: "SUN",
  getMemoFee: "SUN",
  getMaintenanceTimeInterval: "ms",
}

function parameterValue(key: string, value: unknown): string {
  const unit = KNOWN_UNITS[key]
  return unit ? `${formatInt(value)} ${unit}` : String(value ?? "")
}

function timestamp(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return "—"
  return new Date(n).toISOString().replace("T", " ").slice(0, 19)
}

export const ChainFormatters = {
  chainParams: ((data) => {
    const d = asObj(data)
    if ("key" in d) {
      const key = String(d.key ?? "")
      return query([
        ["Key", key],
        ["Value", parameterValue(key, d.value)],
      ])
    }
    const params = Array.isArray(d.params) ? d.params.map(asObj) : []
    return table(
      ["Key", "Value"],
      params.map((p) => [String(p.key ?? ""), parameterValue(String(p.key ?? ""), p.value)]),
    )
  }) satisfies TextFormatter,

  chainPrices: ((data) => {
    const d = asObj(data)
    const energy = asObj(d.energy)
    const bandwidth = asObj(d.bandwidth)
    return query([
      ["Energy price", `${formatInt(energy.currentSunPerUnit)} SUN / unit    (current)`],
      ["Bandwidth price", `${formatInt(bandwidth.currentSunPerUnit)} SUN / unit  (current)`],
      ["Memo fee", `${formatDecimal(formatSun(d.memoFeeSun))} TRX`],
    ])
  }) satisfies TextFormatter,

  chainNode: ((data) => {
    const d = asObj(data)
    const head = asObj(d.headBlock)
    const solid = asObj(d.solidBlock)
    const peers = asObj(d.peers)
    const headTimestamp = Number(head.timestamp ?? 0)
    const ageSeconds = headTimestamp > 0 ? Math.max(0, Math.round((Date.now() - headTimestamp) / 1000)) : null
    const sync = d.inSync ? "in sync" : "lagging"
    return query([
      ["Endpoint", d.endpoint === null ? "—" : String(d.endpoint ?? "—")],
      ["Version", d.version === null ? "—" : String(d.version ?? "—")],
      ["Head block", `#${formatInt(head.number)}  ${timestamp(head.timestamp)} (${ageSeconds === null ? "—" : `~${ageSeconds}s ago — ${sync}`})`],
      ["Solid block", d.solidBlock === null ? "—" : `#${formatInt(solid.number)}  (${formatInt(d.lagBlocks)} blocks behind head)`],
      ["Peers", d.peers === null ? "—" : `${formatInt(peers.connected)} connected / ${formatInt(peers.active)} active`],
    ])
  }) satisfies TextFormatter,
}
