import { describe, expect, it } from "vitest";
import { decodeTronTransaction } from "./transaction-decoder.js";

const OWNER = `41${"11".repeat(20)}`;
const RECIPIENT = `41${"22".repeat(20)}`;
const TOKEN = `41${"33".repeat(20)}`;

function transaction(type: string, value: Record<string, unknown>) {
  return { raw_data: { contract: [{ type, parameter: { value } }] } };
}

describe("decodeTronTransaction", () => {
  it("decodes a native transfer without network IO", () => {
    const decoded = decodeTronTransaction(transaction("TransferContract", {
      owner_address: OWNER,
      to_address: RECIPIENT,
      amount: 1_000_000,
    }));
    expect(decoded).toMatchObject({ kind: "trx", rawAmount: "1000000" });
    expect(decoded.from).toMatch(/^T/);
    expect(decoded.to).toMatch(/^T/);
  });

  it("decodes TRC20 transfer calldata", () => {
    const addressWord = `${"0".repeat(24)}${"22".repeat(20)}`;
    const amountWord = 25n.toString(16).padStart(64, "0");
    const decoded = decodeTronTransaction(transaction("TriggerSmartContract", {
      owner_address: OWNER,
      contract_address: TOKEN,
      data: `a9059cbb${addressWord}${amountWord}`,
    }));
    expect(decoded).toMatchObject({ kind: "trc20", rawAmount: "25" });
    expect(decoded.tokenContract).toMatch(/^T/);
    expect(decoded.to).toMatch(/^T/);
  });

  it("classifies non-transfer smart contract calls without decoding arguments", () => {
    expect(decodeTronTransaction(transaction("TriggerSmartContract", {
      owner_address: OWNER,
      contract_address: TOKEN,
      data: "70a08231",
    }))).toMatchObject({ kind: "contract" });
  });
});
