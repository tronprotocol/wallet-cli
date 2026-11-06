import type { TextFormatter } from "../contracts/index.js";
import { formatInt } from "./scalars.js";
import { type Obj, asObj, query, table } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";

function parameterValue(param: Obj): string {
  return param.unit ? `${formatInt(param.value)} ${String(param.unit)}` : String(param.value ?? "");
}

export const ChainFormatters = {
  chainParams: ((data) => {
    const d = asObj(data);
    if ("key" in d) {
      return query([
        ["Key", String(d.key ?? "")],
        ["Value", parameterValue(d)],
      ]);
    }
    const params = Array.isArray(d.params) ? d.params.map(asObj) : [];
    return table(
      ["Key", "Value"],
      params.map((p) => [String(p.key ?? ""), parameterValue(p)]),
    );
  }) satisfies TextFormatter,

  chainPrices: ((data, ctx) => {
    const d = asObj(data);
    return query(FAMILY_RENDER[renderFamily(ctx)].chainPricesRows(d, renderSymbol(ctx)));
  }) satisfies TextFormatter,

  chainNode: ((data, ctx) =>
    query(FAMILY_RENDER[renderFamily(ctx)].chainNodeRows(asObj(data)))) satisfies TextFormatter,
};
