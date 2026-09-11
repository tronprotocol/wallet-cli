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

const tronPayer = "TTiN7EB8cAagLXN1MfmPxEFwJUETWRV314";
const tronHash = "9360d276f33638d7c10578d0cebc01ac5716f286d00bd534736772e86b3fffeb";
const tronPayment = (payer: unknown) => ({
  settled: true,
  payer: { address: tronPayer },
  paymentResponse: { success: true, network: "tron:0x2b6653dc", transaction: tronHash, payer },
});
it.each([
  tronPayer,
  "0xc2a3a0547883e993cfd7778f59cdab74467c1b46",
  "0xC2A3A0547883E993CFD7778F59CDAB74467C1B46",
  "41c2a3a0547883e993cfd7778f59cdab74467c1b46",
  "0x41c2a3a0547883e993cfd7778f59cdab74467c1b46",
])("accepts equivalent TRON settlement payer %s and preserves the wallet address", (payer) => {
  expect(baiPaymentResult(tronPayment(payer), "tron:728126428")).toEqual({
    txHash: tronHash,
    payer: tronPayer,
  });
});
it.each([
  "TSNEPtuCagKEgF2EU4pAKWLzXLz1bekfTE",
  "0x1111111111111111111111111111111111111111",
  "42c2a3a0547883e993cfd7778f59cdab74467c1b46",
  "0xc2a3a0547883e993cfd7778f59cdab74467c1b4",
  tronPayer.slice(0, -1) + "5",
  " " + tronPayer,
  "",
  null,
  123,
])("rejects different or invalid TRON payer %j without losing recovery evidence", (payer) => {
  let error;
  try {
    baiPaymentResult(tronPayment(payer), "tron:728126428");
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({
    code: "invalid_x402_response",
    details: {
      reason: "payer_mismatch",
      candidateTxHash: tronHash,
      retryPayment: false,
      settled: false,
    },
  });
});
it("does not accept matching malformed TRON address strings", () => {
  expect(() =>
    baiPaymentResult({ ...tronPayment("bad"), payer: { address: "bad" } }, "tron:728126428"),
  ).toThrow(/unconfirmed/);
});
