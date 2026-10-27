import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { singleLineErrorValue } from "../../../../domain/errors/index.js";
import type { Obj } from "./layout.js";
import { asObj, table } from "./layout.js";
import { formatDecimal, formatInt, formatScalar, num } from "./scalars.js";

const HEADERS: Record<string, string> = {
  assetId: "ID",
  issuerAddress: "Issuer",
  totalSupply: "Total supply",
  precision: "Precision",
  accountId: "Account",
  type: "Type",
  index: "Index",
};

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

// Render details.matches using the first row's keys as columns; return null for no columns.
export function renderErrorDetails(details: unknown): string | null {
  const rows = asObj(details).matches;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const objects = rows.map(asObj);
  const keys = Object.keys(objects[0] ?? {});
  if (keys.length === 0) return null;
  return table(
    keys.map((k) => singleLineErrorValue(HEADERS[k] ?? k)),
    objects.map((row) => keys.map((k) => singleLineErrorValue(cell(k, row)))),
  );
}
