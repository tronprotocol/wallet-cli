import { describe, it, expect } from "vitest";
import { parseTronTxInfo, parseTronTx } from "./tron-responses.js";

// Realistic TronGrid getTransactionInfo payload (TRC20 transfer), trimmed to the fields we read.
const TRC20_INFO = {
  id: "abc123",
  blockNumber: 66_000_000,
  fee: 1_344_000,
  receipt: { energy_usage_total: 32_000, result: "SUCCESS", net_usage: 345 },
  contractResult: ["0000"],
};

// Realistic getTransaction payload for a native TRX transfer.
const NATIVE_TX = {
  txID: "abc123",
  ret: [{ contractRet: "SUCCESS" }],
  raw_data: {
    contract: [
      {
        type: "TransferContract",
        parameter: { value: { owner_address: "41a0...", to_address: "41b0...", amount: 1_000_000 } },
      },
    ],
    timestamp: 1_700_000_000_000,
  },
};

describe("parseTronTxInfo", () => {
  it("extracts the rendered fields (block, fee, receipt result + energy)", () => {
    const info = parseTronTxInfo(TRC20_INFO);
    expect(info.blockNumber).toBe(66_000_000);
    expect(info.fee).toBe(1_344_000);
    expect(info.receipt?.result).toBe("SUCCESS");
    expect(info.receipt?.energy_usage_total).toBe(32_000);
  });

  it("coerces numeric fields that arrive as strings (TronGrid is inconsistent)", () => {
    const info = parseTronTxInfo({ blockNumber: "66000000", fee: "1344000" });
    expect(info.blockNumber).toBe(66_000_000);
    expect(info.fee).toBe(1_344_000);
  });

  it("preserves unknown keys so the raw response still serializes for JSON output", () => {
    const info = parseTronTxInfo(TRC20_INFO);
    expect((info as Record<string, unknown>).contractResult).toEqual(["0000"]);
  });

  it("never throws on missing / garbage input (reads must stay lenient)", () => {
    expect(parseTronTxInfo(undefined)).toEqual({});
    expect(parseTronTxInfo("boom")).toEqual({});
    expect(parseTronTxInfo({}).fee).toBeUndefined();
  });
});

describe("parseTronTx", () => {
  it("exposes ret[0].contractRet for the native-transfer status fallback", () => {
    const tx = parseTronTx(NATIVE_TX);
    expect(tx.ret?.[0]?.contractRet).toBe("SUCCESS");
  });

  it("exposes the first contract's type + value for party decoding", () => {
    const tx = parseTronTx(NATIVE_TX);
    const c = tx.raw_data?.contract?.[0];
    expect(c?.type).toBe("TransferContract");
    expect(c?.parameter?.value?.to_address).toBe("41b0...");
  });

  it("never throws on missing / garbage input", () => {
    expect(parseTronTx(undefined)).toEqual({});
    expect(parseTronTx("boom").ret).toBeUndefined();
  });
});
