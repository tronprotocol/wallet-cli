import type { TextFormatter } from "../contracts/index.js";
import { formatScalar, num, methodName } from "./scalars.js";
import { type Obj, asObj, kv, query, receipt, table, ok } from "./layout.js";
import { FAMILY_RENDER, renderFamily } from "./family.js";

export const MiscFormatters = {
  config: ((data) => renderConfig(asObj(data))) satisfies TextFormatter,
  networks: ((data) =>
    table(
      // "Chain id", not "Chain": the value IS the second half of the canonical id (§2.3), and the
      // shorter header read as though it might hold the chain's name.
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
  // `block` reports the node's RAW object, so the two families arrive in different shapes: TRON
  // nests its header and counts milliseconds, an EVM node is flat, hex and counts seconds.
  // Making that readable is this renderer's job — the JSON stays as the node sent it.
  block: ((data, ctx) => {
    const block = asObj(asObj(data).block);
    const header = asObj(asObj(block.block_header).raw_data);
    const raw = block.timestamp ?? header.timestamp;
    // Seconds read as milliseconds would date every EVM block to 1970.
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
    // A map-valued key (networks, aliases, one network) gets a titled block whose body may itself
    // nest; a scalar stays one line.
    return isMap(d.value)
      ? [String(d.key), configTree(d.value, "  ")].filter(Boolean).join("\n")
      : kv([[String(d.key), configValue(d.value)]], "");
  }
  return configTree(d, "");
}

/**
 * The config document as it is: scalars as `key  value`, a nested map as its bare key plus the
 * body indented one level.
 *
 * No `key:` separator, because the keys here CONTAIN colons — `tron:mainnet:` gives no way to see
 * where the network id ends. Indentation already marks the nesting, so the colon only adds
 * ambiguity to the one thing a reader needs to copy verbatim.
 *
 * The whole-config view used to summarise a map by listing its keys, which told a reader that
 * `networks.tron:nile` existed but never what it held — and the summary had to be maintained
 * separately from the values themselves. Rendering the tree means a new configurable field shows
 * up here the moment the service returns it.
 */
function configTree(value: Record<string, unknown>, indent: string): string {
  const entries = Object.entries(value);
  // Scalars align within their own level only: a deeper block has its own column.
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
    // kv() drops empty values; an unset key is absent rather than a blank line.
    if (rendered !== "") lines.push(`${indent}${key.padEnd(width)}  ${rendered}`);
  }
  return lines.join("\n");
}

/** a plain object value, i.e. one of the map-valued config keys. */
function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** config values keep their literal form (no thousands grouping, raw key names). */
function configValue(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  return v === null || v === undefined ? "" : String(v);
}

function formatResult(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => formatScalar(x)).join(", ");
  return formatScalar(v);
}
