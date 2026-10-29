import { describe, it, expect } from "vitest";
import { parseTronTxInfo, parseTronTx } from "./tron-responses.js";

const TRC20_INFO = {
  id: "abc123",
  blockNumber: 66_000_000,
  fee: 1_344_000,
  receipt: { energy_usage_total: 32_000, result: "SUCCESS", net_usage: 345 },
  contractResult: ["0000"],
};

const NATIVE_TX = {
  txID: "abc123",
  ret: [{ contractRet: "SUCCESS" }],
  raw_data: {
    contract: [
      {
        type: "TransferContract",
        parameter: {
          value: {
            owner_address: `41${"11".repeat(20)}`,
            to_address: `41${"22".repeat(20)}`,
            amount: 1_000_000,
          },
        },
      },
    ],
    timestamp: 1_700_000_000_000,
  },
};

describe("parseTronTxInfo", () => {
  it("extracts the rendered fields (block, fee, receipt result + energy)", () => {
    const info = parseTronTxInfo(TRC20_INFO);
    expect(info).toMatchObject({
      blockNumber: 66_000_000,
      feeSun: 1_344_000,
      receiptResult: "SUCCESS",
      execution: "success",
      energyUsed: 32_000,
      netUsed: 345,
      contractResult: ["0000"],
    });
  });

  it("reads numeric fields that arrive as decimal strings (TronGrid is inconsistent)", () => {
    const info = parseTronTxInfo({ blockNumber: "66000000", fee: "1344000" });
    expect(info.blockNumber).toBe(66_000_000);
    expect(info.feeSun).toBe(1_344_000);
  });

  it("keeps the node's JSON verbatim as the raw display value", () => {
    expect(parseTronTxInfo(TRC20_INFO).raw).toBe(TRC20_INFO);
  });

  it("never throws on missing / garbage input (reads must stay lenient)", () => {
    expect(parseTronTxInfo(undefined)).toMatchObject({ execution: "unknown", raw: {} });
    expect(parseTronTxInfo("boom").blockNumber).toBeUndefined();
    expect(parseTronTxInfo({ fee: "abc", blockNumber: -1 })).toMatchObject({
      feeSun: undefined,
      blockNumber: undefined,
    });
  });

  it("rejects an integer beyond 2^53 instead of rounding it", () => {
    for (const raw of [
      { blockNumber: "9007199254740993" },
      { fee: "9007199254740993" },
      { receipt: { energy_fee: "9007199254740993" } },
      { exchange_id: 9_007_199_254_740_992 },
    ]) {
      expect(() => parseTronTxInfo(raw)).toThrow(
        expect.objectContaining({ code: "provider_error" }),
      );
    }
  });

  it("keeps a numeric receipt.result as a string", () => {
    const info = parseTronTxInfo({ blockNumber: 1, receipt: { result: 17 } });
    expect(info).toMatchObject({ receiptResult: "17", execution: "failed", failureReason: "17" });
  });
});

describe("parseTronTxInfo execution", () => {
  it.each([
    [{ receipt: { result: "SUCCESS" } }, "success", undefined],
    [{ receipt: { result: "REVERT" } }, "failed", "REVERT"],
    [{ receipt: { result: "OUT_OF_ENERGY" }, result: "FAILED" }, "failed", "OUT_OF_ENERGY"],
    [{ result: "FAILED", receipt: {} }, "failed", "FAILED"],
    [{ result: "FAILED", receipt: { result: "DEFAULT" } }, "failed", "FAILED"],
    [{ receipt: { result: "DEFAULT" } }, "unknown", undefined],
    [{ receipt: {} }, "unknown", undefined],
  ])("%j → %s", (raw, execution, failureReason) => {
    const info = parseTronTxInfo({ blockNumber: 7, ...raw });
    expect(info.execution).toBe(execution);
    expect(info.failureReason).toBe(failureReason);
  });
});

describe("parseTronTxInfo evidence lists", () => {
  const log = { address: "aa", topics: ["01", "02"], data: "ff" };
  const call = { caller_address: "aa", rejected: false, callValueInfo: [{ callValue: 5 }] };

  it("keeps well-formed logs and internal transactions, with exact call values", () => {
    const info = parseTronTxInfo({ log: [log], internal_transactions: [call] });
    expect(info.log).toEqual([log]);
    expect(info.internal_transactions).toEqual([
      { caller_address: "aa", rejected: false, callValueInfo: [{ callValue: "5" }] },
    ]);
  });

  it("voids a list with a malformed element so decoders never act on partial evidence", () => {
    const info = parseTronTxInfo({
      log: [log, { ...log, data: 12 }],
      internal_transactions: [call, { callValueInfo: [{ callValue: "-1" }] }],
      contractResult: ["00", 1],
    });
    expect(info.log).toBeUndefined();
    expect(info.internal_transactions).toBeUndefined();
    expect(info.contractResult).toBeUndefined();
  });
});

describe("parseTronTx", () => {
  it("exposes the id and ret[0].contractRet for the native-transfer status fallback", () => {
    const tx = parseTronTx(NATIVE_TX);
    expect(tx.txId).toBe("abc123");
    expect(tx.contractResult).toBe("SUCCESS");
    expect(tx.raw).toBe(NATIVE_TX);
  });

  it("decodes the first contract's parties", () => {
    expect(parseTronTx(NATIVE_TX).parties).toMatchObject({ kind: "trx", rawAmount: "1000000" });
  });

  it("never throws on missing / garbage input", () => {
    expect(parseTronTx(undefined)).toMatchObject({ parties: { kind: "unknown" }, raw: {} });
    expect(parseTronTx("boom").contractResult).toBeUndefined();
  });
});
