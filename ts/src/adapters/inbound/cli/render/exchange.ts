import type { TextFormatter } from "../contracts/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { formatDecimal, formatInt, formatUtc, num } from "./scalars.js";
import { type Obj, type Pair, asObj, kv, table, titled } from "./layout.js";

function whole(raw: unknown, decimals: unknown): string {
  return raw === undefined || raw === null
    ? ""
    : formatDecimal(fromBaseUnits(String(raw), num(decimals, 0)));
}

/** `MyToken (id 1000123)`, or plain `TRX` for the native side. */
function sideLabel(tokenId: unknown, label: unknown): string {
  const id = String(tokenId ?? "");
  if (id === "_") return "TRX";
  return label ? `${String(label)} (id ${id})` : `id ${id}`;
}

export const ExchangeFormatters = {
  exchangeShow: ((data) => {
    const d = asObj(data);
    const head = titled(`Exchange id ${formatInt(d.exchangeId ?? 0)}`, [
      ["Creator", String(d.creatorAddress ?? "")],
      ["Created time", formatUtc(d.createTime)],
    ]);
    const reserves = kv(
      [
        [
          sideLabel(d.firstTokenId, d.firstTokenLabel),
          whole(d.firstTokenBalance, d.firstTokenDecimals),
        ],
        [
          sideLabel(d.secondTokenId, d.secondTokenLabel),
          whole(d.secondTokenBalance, d.secondTokenDecimals),
        ],
      ] as Pair[],
      "    ",
    );
    // No price is derived: the reserve ratio is a quoted rate, not what a trade returns. Price a
    // specific amount with `exchange trade --dry-run`.
    return `${head}\n  Reserves\n${reserves}`;
  }) satisfies TextFormatter,

  /**
   * One RPC, so no token names or precisions are available (docs/adr/0005) — ids and minimal units,
   * with the column labelled so the numbers cannot be mistaken for whole tokens.
   */
  exchangeList: ((data) => {
    const d = asObj(data);
    const rows = Array.isArray(d.exchanges) ? (d.exchanges as Obj[]) : [];
    const page = asObj(d.pagination);
    const header = `Exchanges (limit ${formatInt(page.limit ?? 0)}, offset ${formatInt(page.offset ?? 0)})`;
    if (rows.length === 0) return `${header}\n  (none)`;
    return `${header}\n${table(
      ["ID", "Pair", "Reserves (minimal units)", "Creator"],
      rows.map((e) => [
        formatInt(e.exchangeId ?? 0),
        String(e.pair ?? ""),
        `${formatDecimal(e.firstTokenBalance)} / ${formatDecimal(e.secondTokenBalance)}`,
        String(e.creatorAddress ?? ""),
      ]),
    )}`;
  }) satisfies TextFormatter,
};
