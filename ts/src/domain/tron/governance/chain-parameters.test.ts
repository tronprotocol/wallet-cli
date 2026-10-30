import { describe, expect, it } from "vitest";
import { parseChainParameterAssignments, proposalParameters } from "./chain-parameters.js";

const current = [
  { key: "getCreateAccountFee", value: 100_000 },
  { key: "getTransactionFee", value: 10 },
  { key: "getAllowMultiSign", value: 1 },
];

describe("chain parameter proposal mapping", () => {
  it("accepts names and ids, applies last duplicate, and sorts by protocol id", () => {
    expect(
      parseChainParameterAssignments(
        ["getTransactionFee=12", "2=200000", "GETTRANSACTIONFEE=15"],
        current,
      ),
    ).toEqual([
      {
        id: 2,
        name: "getCreateAccountFee",
        currentValue: 100_000,
        proposedValue: 200_000,
        unit: "sun",
      },
      { id: 3, name: "getTransactionFee", currentValue: 10, proposedValue: 15, unit: "sun/byte" },
    ]);
  });

  it("rejects unknown parameters and invalid boolean values before building", () => {
    expect(() => parseChainParameterAssignments(["getMissing=1"], current)).toThrowError(
      expect.objectContaining({ code: "unknown_parameter" }),
    );
    expect(() => parseChainParameterAssignments(["getAllowMultiSign=2"], current)).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );
  });

  it("keeps lossless proposal values as strings when they exceed JS safe integers", () => {
    expect(proposalParameters({ "999": "9223372036854775807" })).toEqual([
      { id: 999, name: "parameter-999", value: "9223372036854775807", unit: "" },
    ]);
  });

  it("never carries a current value — a proposal records only what it would set", () => {
    expect(proposalParameters({ "3": "15" })).toEqual([
      { id: 3, name: "getTransactionFee", value: 15, unit: "sun/byte" },
    ]);
  });

  it("accepts the full positive Java long range without precision loss", () => {
    expect(
      parseChainParameterAssignments(["getTotalEnergyLimit=9223372036854775807"], current),
    ).toMatchObject([{ id: 17, proposedValue: "9223372036854775807" }]);
  });
});
