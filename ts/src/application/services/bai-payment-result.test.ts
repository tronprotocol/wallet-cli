import { expect, it } from "vitest";
import { baiPaymentResult } from "./bai-payment-result.js";

const payer = "0x1111111111111111111111111111111111111111";
const transaction = "0x" + "a".repeat(64);
const payment = () => ({
  settled: true,
  payer: { address: payer },
  paymentResponse: { success: true, transaction, network: "eip155:56", payer },
});

it("extracts a confirmed x402 settlement without an MCP response body", () => {
  expect(baiPaymentResult(payment(), "eip155:56")).toEqual({ txHash: transaction, payer });
});
it.each([
  { success: false },
  { transaction: "" },
  { transaction: "garbage" },
  { network: "eip155:8453" },
  { payer: "0x2222222222222222222222222222222222222222" },
])("rejects inconsistent settlement evidence %j", (override) => {
  const value = payment();
  Object.assign(value.paymentResponse, override);
  expect(() => baiPaymentResult(value, "eip155:56")).toThrow(/unconfirmed/);
});
it("does not accept HTTP delivery or a legacy MCP hash as proof of settlement", () => {
  expect(() =>
    baiPaymentResult(
      {
        delivered: true,
        payer: { address: payer },
        response: { result: { transaction_hash: transaction, network: "eip155:56" } },
      },
      "eip155:56",
    ),
  ).toThrow();
  expect(() => baiPaymentResult({ ...payment(), settled: false }, "eip155:56")).toThrow();
});
it("accepts TRON settlement network notation", () => {
  expect(
    baiPaymentResult(
      {
        settled: true,
        payer: { address: "tron-payer" },
        paymentResponse: { success: true, network: "tron:0x2b6653dc", transaction: "a".repeat(64) },
      },
      "tron:728126428",
    ),
  ).toEqual({ txHash: "a".repeat(64), payer: "tron-payer" });
});

it.each([
  [{ payer: "0x2222222222222222222222222222222222222222" }, "payer_mismatch"],
  [{ network: "eip155:8453" }, "network_mismatch"],
  [{ success: false }, "settlement_unconfirmed"],
])("retains a candidate hash without claiming confirmation: %j", (override, reason) => {
  const value = payment();
  Object.assign(value.paymentResponse, override);
  let caught;
  try {
    baiPaymentResult(value, "eip155:56");
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    code: "invalid_x402_response",
    details: {
      candidateTxHash: transaction,
      reason,
      settled: false,
      paymentStatus: "unknown",
      retryPayment: false,
    },
  });
  expect(caught).not.toHaveProperty("details.txHash");
});

it("does not expose malformed evidence or discard a hash when payer metadata is missing", () => {
  for (const value of [
    { ...payment(), payer: undefined },
    {
      ...payment(),
      paymentResponse: {
        ...payment().paymentResponse,
        transaction: "SECRET",
        network: "SECRET",
        payer: "SECRET",
      },
    },
  ]) {
    try {
      baiPaymentResult(value, "eip155:56");
      throw new Error("unexpected success");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_x402_response" });
      expect(JSON.stringify(error)).not.toContain("SECRET");
      if (value.payer === undefined)
        expect(error).toHaveProperty("details.candidateTxHash", transaction);
      else expect(error).not.toHaveProperty("details.candidateTxHash");
    }
  }
});
