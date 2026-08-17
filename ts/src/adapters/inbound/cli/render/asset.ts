import type { TextFormatter } from "../contracts/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { formatDecimal, formatInt, formatUtc, num } from "./scalars.js";
import { type Obj, type Pair, asObj, kv, table, titled } from "./layout.js";

/** whole tokens from minimal units — TRC10 quantities are always stored scaled by precision. */
function whole(raw: unknown, precision: unknown): string {
  return raw === undefined || raw === null
    ? ""
    : formatDecimal(fromBaseUnits(String(raw), num(precision, 0)));
}

function price(d: Obj): string {
  const [trx, tokens] = String(d.price ?? "").split(":");
  if (!trx || !tokens) return "";
  return `${formatInt(trx)} TRX = ${formatInt(tokens)} ${String(d.name ?? "tokens")}`;
}

export const AssetFormatters = {
  assetInfo: ((data) => {
    const d = asObj(data);
    const precision = d.precision;
    const rows: Pair[] = [
      ["Issuer", String(d.issuerAddress ?? "")],
      ["Total supply", whole(d.totalSupply, precision)],
      ["Precision", formatInt(precision ?? 0)],
      ["Price", price(d)],
      ["ICO start time", formatUtc(d.startTime)],
      ["ICO end time", formatUtc(d.endTime)],
      ["Url", String(d.url ?? "")],
      ["Description", String(d.description ?? "")],
      ["Free net/account", formatInt(d.freeAssetNetLimit ?? 0)],
      ["Public free net", formatInt(d.publicFreeAssetNetLimit ?? 0)],
    ];
    const body = titled(`Asset ${d.name ?? ""} (id ${d.assetId ?? ""})`, rows);
    // An empty collection is omitted entirely rather than printed as "Frozen (0)".
    const tranches = Array.isArray(d.frozenSupply) ? (d.frozenSupply as Obj[]) : [];
    if (tranches.length === 0) return body;
    const frozen = kv(
      tranches.map((t): Pair => [whole(t.amount, precision), `until ${formatUtc(t.expireTime)}`]),
      "    ",
    );
    return `${body}\n  Frozen (${tranches.length})\n${frozen}`;
  }) satisfies TextFormatter,

  // Reserves/supply are whole tokens here at no cost: an asset record carries its own precision.
  assetList: ((data) => {
    const d = asObj(data);
    const assets = Array.isArray(d.assets) ? (d.assets as Obj[]) : [];
    const page = asObj(d.pagination);
    const header = `Assets (limit ${formatInt(page.limit ?? 0)}, offset ${formatInt(page.offset ?? 0)})`;
    if (assets.length === 0) return `${header}\n  (none)`;
    return `${header}\n${table(
      ["ID", "Name", "Total supply", "Precision", "Issuer"],
      assets.map((a) => [
        String(a.assetId ?? ""),
        String(a.name ?? ""),
        whole(a.totalSupply, a.precision),
        formatInt(a.precision ?? 0),
        String(a.issuerAddress ?? ""),
      ]),
    )}`;
  }) satisfies TextFormatter,
};
