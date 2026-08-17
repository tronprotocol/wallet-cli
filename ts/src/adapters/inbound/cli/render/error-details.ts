/**
 * Error-detail rendering — the text-mode counterpart to `error.details`.
 *
 * Text mode prints one line per error (`error [code]: message`). A few errors are a *choice*
 * rather than a dead end — the caller has to pick one of several candidates — and a bare line
 * leaves a human with no way to pick. Those errors put the candidates in `details.matches`, and
 * this renders them as the same table the corresponding list command uses.
 *
 * Deliberately data-driven, not a per-error-code registry: the contract is `details.matches` (an
 * array of flat rows sharing one key set), so any future error can opt in by carrying that key,
 * without the output layer learning command names. JSON mode is untouched — it already carries
 * `details` verbatim.
 */
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import type { Obj } from "./layout.js";
import { asObj, table } from "./layout.js";
import { formatDecimal, formatInt, formatScalar, num } from "./scalars.js";

/** key → column header; keys not listed fall back to their own name. */
const HEADERS: Record<string, string> = {
  assetId: "ID",
  issuerAddress: "Issuer",
  totalSupply: "Total supply",
  precision: "Precision",
};

/**
 * Rows report quantities raw (minimal units) so `details` stays machine-honest, but a human
 * picking between tokens needs the same whole-token figure `asset info` / `asset list` show —
 * hence the one semantic rule here: a row carrying `precision` scales its `totalSupply` by it.
 */
function cell(key: string, row: Obj): string {
  const value = row[key];
  if (key === "totalSupply" && row.precision !== undefined) {
    return value === undefined || value === null
      ? ""
      : formatDecimal(fromBaseUnits(String(value), num(row.precision, 0)));
  }
  if (key === "precision") return formatInt(value ?? 0);
  return formatScalar(value);
}

/** the candidate table for an error that carries one, or null when there is nothing to add. */
export function renderErrorDetails(details: unknown): string | null {
  const rows = asObj(details).matches;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const objects = rows.map(asObj);
  const keys = Object.keys(objects[0] ?? {});
  if (keys.length === 0) return null;
  return table(
    keys.map((k) => HEADERS[k] ?? k),
    objects.map((row) => keys.map((k) => cell(k, row))),
  );
}
