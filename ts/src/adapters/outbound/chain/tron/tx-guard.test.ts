import { describe, it, expect } from "vitest";
import { assertBuiltTx } from "./tx-guard.js";

const wrap = (type: string) => ({ raw_data: { contract: [{ type, parameter: { value: {} } }] } });

const expectReject = (fn: () => unknown) =>
  expect(fn).toThrowError(expect.objectContaining({ code: "tx_integrity" }));

describe("assertBuiltTx — locally-built transaction tripwire", () => {
  it("passes a single contract of the expected type", () => {
    const tx = wrap("TransferContract");
    expect(assertBuiltTx(tx, "TransferContract")).toBe(tx);
  });

  it("rejects an unexpected operation type (a build path silently re-routed)", () => {
    expectReject(() => assertBuiltTx(wrap("TriggerSmartContract"), "TransferContract"));
  });

  it("rejects a transaction that carries more than one contract", () => {
    const tx = { raw_data: { contract: [{ type: "TransferContract" }, { type: "TransferContract" }] } };
    expectReject(() => assertBuiltTx(tx, "TransferContract"));
  });

  it("rejects a malformed transaction with no contract array", () => {
    expectReject(() => assertBuiltTx({ raw_data: {} }, "TransferContract"));
    expectReject(() => assertBuiltTx({}, "TransferContract"));
  });

  it("accepts the contract types produced by each build path", () => {
    for (const type of [
      "TransferAssetContract",
      "TriggerSmartContract",
      "CreateSmartContract",
      "FreezeBalanceV2Contract",
      "UnfreezeBalanceV2Contract",
      "WithdrawExpireUnfreezeContract",
      "CancelAllUnfreezeV2Contract",
      "DelegateResourceContract",
      "UnDelegateResourceContract",
    ]) {
      expect(() => assertBuiltTx(wrap(type), type)).not.toThrow();
    }
  });
});
