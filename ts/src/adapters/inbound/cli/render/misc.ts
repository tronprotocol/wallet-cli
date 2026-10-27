import { structuredText } from "./structured.js";
import type { TextFormatter } from "../contracts/index.js";
import { formatScalar, num, methodName } from "./scalars.js";
import { type Obj, asObj, kv, query, receipt, table, ok } from "./layout.js";
import { FAMILY_RENDER, renderFamily } from "./family.js";

export const MiscFormatters = {
  config: ((data) => renderConfig(asObj(data))) satisfies TextFormatter,
  networks: ((data) =>
    table(
      ["Network", "Alias", "Family", "Chain id", "Fee model", "Endpoint"],
      (Array.isArray(data) ? data : [])
        .map(asObj)
        .map((n) => [
          String(n.id ?? ""),
          String(n.alias ?? ""),
          String(n.family ?? ""),
          String(n.chainId ?? ""),
          String(n.feeModel ?? ""),
          String(n.endpoint ?? ""),
        ]),
    )) satisfies TextFormatter,

  contractCall: ((data) => {
    const d = asObj(data);
    return query([
      ["Method", methodName(String(d.method ?? ""))],
      ["Result", `${formatResult(d.result)} (raw)`],
    ]);
  }) satisfies TextFormatter,
  contractInfo: ((data) => renderContractInfo(asObj(data))) satisfies TextFormatter,

  messageSign: ((data) => {
    const d = asObj(data);
    return receipt(ok(), "Signed", [
      ["Address", String(d.address ?? "")],
      ["Signature", String(d.signature ?? "")],
    ]);
  }) satisfies TextFormatter,
  typedDataSign: ((data) => {
    const d = asObj(data);
    return receipt(ok(), "Signed typed data", [
      ["Address", String(d.address ?? "")],
      ["Type", String(d.primaryType ?? "")],
      ["Digest", String(d.digest ?? "")],
      ["Signature", String(d.signature ?? "")],
    ]);
  }) satisfies TextFormatter,
  // TRON block timestamps are milliseconds; EVM timestamps are hex seconds.
  block: ((data, ctx) => {
    const block = asObj(asObj(data).block);
    const header = asObj(asObj(block.block_header).raw_data);
    const raw = block.timestamp ?? header.timestamp;
    const family = renderFamily(ctx);
    const timestampMs =
      raw === undefined || raw === null
        ? undefined
        : family === "evm"
          ? Number(BigInt(String(raw))) * 1000
          : Number(raw);
    return query(FAMILY_RENDER[family].blockRows(block, timestampMs));
  }) satisfies TextFormatter,
};

function renderContractInfo(d: Obj): string {
  let names: string[];
  let count: number;
  if (Array.isArray(d.methods)) {
    names = d.methods.map(String);
    count = num(d.functionCount, names.length);
  } else {
    const contract = asObj(d.contract);
    const info = asObj(d.info);
    const abi = contract.abi ?? info.abi ?? contract.ABI ?? info.ABI;
    const nestedEntries = asObj(abi).entrys;
    const entries: unknown[] = Array.isArray(abi)
      ? abi
      : Array.isArray(nestedEntries)
        ? nestedEntries
        : [];
    const methods = entries
      .map(asObj)
      .filter((e) => e.type === "Function" || e.type === "function");
    names = methods
      .map((e) => e.name)
      .filter(Boolean)
      .map(String);
    count = methods.length;
  }
  const name = String(d.name ?? asObj(d.contract).name ?? asObj(d.info).name ?? "");
  const preview = names.slice(0, 3).join(" / ");
  return query([
    ["Contract", String(d.address ?? "")],
    ["Name", name],
    ["Methods", `${count}${preview ? ` (${preview}${count > 3 ? " …" : ""})` : ""}`],
  ]);
}

function renderConfig(d: Obj): string {
  if ("input" in d) {
    return receipt(ok(), "Set config", [
      ["Key", String(d.key)],
      ["Value", configValue(d.value)],
    ]);
  }
  if ("key" in d) {
    if (d.value === undefined || d.value === null || d.value === "")
      return kv([[String(d.key), "Not configured"]], "");
    return isMap(d.value)
      ? [String(d.key), configTree(d.value, "  ")].filter(Boolean).join("\n")
      : kv([[String(d.key), configValue(d.value)]], "");
  }
  return configTree(d, "");
}

// Omit colon separators because network keys already contain colons.
function configTree(value: Record<string, unknown>, indent: string): string {
  const entries = Object.entries(value);
  const width = entries
    .filter(([, v]) => !isMap(v))
    .reduce((max, [key]) => Math.max(max, key.length), 0);
  const lines: string[] = [];
  for (const [key, v] of entries) {
    if (isMap(v)) {
      lines.push(`${indent}${key}`);
      const body = configTree(v, `${indent}  `);
      if (body) lines.push(body);
      continue;
    }
    const rendered = configValue(v);
    if (rendered !== "") lines.push(`${indent}${key.padEnd(width)}  ${rendered}`);
  }
  return lines.join("\n");
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Keep config values literal, without numeric grouping.
function configValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return v === null || v === undefined ? "" : String(v);
}

function formatResult(v: unknown): string {
  if (v !== null && typeof v === "object") return structuredText(v);
  return formatScalar(v);
}
