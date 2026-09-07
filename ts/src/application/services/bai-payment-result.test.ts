import { expect, it } from "vitest";
import { baiPaymentResult } from "./bai-payment-result.js";
const hash = "0x" + "a".repeat(64);
const envelope = {
  jsonrpc: "2.0",
  id: 1,
  result: { transaction_hash: hash, network: "eip155:56" },
};
it("extracts JSON and SSE MCP payment results", () => {
  for (const response of [
    envelope,
    JSON.stringify(envelope),
    `event: message\ndata: ${JSON.stringify(envelope)}\n\n`,
  ]) {
    expect(baiPaymentResult({ response, payer: { address: "payer" } }, "eip155:56")).toEqual({
      txHash: hash,
      payer: "payer",
    });
  }
});
it.each([
  { ...envelope, error: {} },
  { result: { transaction_hash: hash, network: "eip155:97" } },
  { result: { transaction_hash: "bad", network: "eip155:56" } },
  { result: { isError: true } },
  {},
])("rejects wrong-chain, invalid or error responses", (response) => {
  expect(() => baiPaymentResult({ response, payer: { address: "payer" } }, "eip155:56")).toThrow();
});
it("matches the recharge server's hexadecimal TRON network to the CLI decimal network", () => {
  const txHash = "b".repeat(64);
  expect(
    baiPaymentResult(
      {
        payer: { address: "T-payer" },
        response: { id: 1, result: { transaction_hash: txHash, network: "tron:0x2b6653dc" } },
      },
      "tron:728126428",
    ),
  ).toEqual({ txHash, payer: "T-payer" });
});
