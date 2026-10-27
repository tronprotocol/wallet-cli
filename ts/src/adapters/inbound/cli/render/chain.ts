import type { TextFormatter } from "../contracts/index.js";
import { formatInt } from "./scalars.js";
import { asObj, query, table } from "./layout.js";
import { FAMILY_RENDER, renderFamily, renderSymbol } from "./family.js";

const KNOWN_UNITS: Record<string, "SUN" | "ms"> = {
  getEnergyFee: "SUN",
  getTransactionFee: "SUN",
  getCreateAccountFee: "SUN",
  getCreateNewAccountFeeInSystemContract: "SUN",
  getWitnessPayPerBlock: "SUN",
  getMemoFee: "SUN",
  getMaintenanceTimeInterval: "ms",
};

function parameterValue(key: string, value: unknown): string {
  const unit = KNOWN_UNITS[key];
  return unit ? `${formatInt(value)} ${unit}` : String(value ?? "");
}

export const ChainFormatters = {
  chainParams: ((data) => {
    const d = asObj(data);
    if ("key" in d) {
      const key = String(d.key ?? "");
      return query([
        ["Key", key],
        ["Value", parameterValue(key, d.value)],
      ]);
    }
    const params = Array.isArray(d.params) ? d.params.map(asObj) : [];
    return table(
      ["Key", "Value"],
      params.map((p) => [String(p.key ?? ""), parameterValue(String(p.key ?? ""), p.value)]),
    );
  }) satisfies TextFormatter,

  chainPrices: ((data, ctx) => {
    const d = asObj(data);
    return query(FAMILY_RENDER[renderFamily(ctx)].chainPricesRows(d, renderSymbol(ctx)));
  }) satisfies TextFormatter,

  chainNode: ((data, ctx) =>
    query(FAMILY_RENDER[renderFamily(ctx)].chainNodeRows(asObj(data)))) satisfies TextFormatter,
};
