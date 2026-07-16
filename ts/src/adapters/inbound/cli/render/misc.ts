import type { TextFormatter } from "../contracts/index.js"
import { formatScalar, formatInt, formatUtc, num, methodName } from "./scalars.js"
import { type Obj, type Pair, asObj, kv, query, receipt, table, ok } from "./layout.js"

export const MiscFormatters = {
  config: ((data) => renderConfig(asObj(data))) satisfies TextFormatter,
  networks: ((data) =>
    table(
      ["Network", "Family", "Chain", "Fee model"],
      (Array.isArray(data) ? data : []).map(asObj).map((n) => [String(n.id ?? ""), String(n.family ?? ""), String(n.chainId ?? ""), String(n.feeModel ?? "")]),
    )) satisfies TextFormatter,

  contractCall: ((data) => {
    const d = asObj(data)
    return query([
      ["Method", methodName(String(d.method ?? ""))],
      ["Result", `${formatResult(d.result)} (raw)`],
    ])
  }) satisfies TextFormatter,
  contractInfo: ((data) => renderContractInfo(asObj(data))) satisfies TextFormatter,

  messageSign: ((data) => {
    const d = asObj(data)
    return receipt(ok(), "Signed", [
      ["Address", String(d.address ?? "")],
      ["Signature", String(d.signature ?? "")],
    ])
  }) satisfies TextFormatter,
  block: ((data) => {
    const block = asObj(asObj(data).block)
    const header = asObj(asObj(block.block_header).raw_data)
    const n = block.number ?? header.number
    const ts = block.timestamp ?? header.timestamp
    const txs = Array.isArray(block.transactions) ? block.transactions.length : 0
    return query([
      ["Number", n === undefined ? "" : `#${formatInt(n)}`],
      ["Time", ts ? formatUtc(ts) : "unknown"],
      ["Transactions", String(txs)],
    ])
  }) satisfies TextFormatter,
}

function renderContractInfo(d: Obj): string {
  let names: string[]
  let count: number
  if (Array.isArray(d.methods)) {
    names = d.methods.map(String)
    count = num(d.functionCount, names.length)
  } else {
    const contract = asObj(d.contract)
    const info = asObj(d.info)
    const abi = contract.abi ?? info.abi ?? contract.ABI ?? info.ABI
    const nestedEntries = asObj(abi).entrys
    const entries: unknown[] = Array.isArray(abi) ? abi : Array.isArray(nestedEntries) ? nestedEntries : []
    const methods = entries.map(asObj).filter((e) => e.type === "Function" || e.type === "function")
    names = methods
      .map((e) => e.name)
      .filter(Boolean)
      .map(String)
    count = methods.length
  }
  const name = String(d.name ?? asObj(d.contract).name ?? asObj(d.info).name ?? "")
  const preview = names.slice(0, 3).join(" / ")
  return query([
    ["Contract", String(d.address ?? "")],
    ["Name", name],
    ["Methods", `${count}${preview ? ` (${preview}${count > 3 ? " …" : ""})` : ""}`],
  ])
}

function renderConfig(d: Obj): string {
  if ("input" in d) {
    return receipt(ok(), "Set config", [
      ["Key", String(d.key)],
      ["Value", configValue(d.value)],
    ])
  }
  if ("key" in d) return kv([[String(d.key), configValue(d.value)]], "")
  return kv(
    Object.entries(d).map(([k, v]) => [k, configValue(v)] as Pair),
    "",
  )
}

/** config values keep their literal form (no thousands grouping, raw key names). */
function configValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ")
  return v === null || v === undefined ? "" : String(v)
}

function formatResult(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => formatScalar(x)).join(", ")
  return formatScalar(v)
}
