import { expect, it } from "vitest";
import { agentShowText, paymentText, roundtripText, serveText } from "./x402.js";
it("renders known metadata fields without terminal controls or unknown fields", () => {
  const rendered = agentShowText({
    agentId: "1",
    metadata: {
      name: "Agent\x1b\x07\r\n",
      description: "First. Second.",
      unknownField: "DO_NOT_RENDER",
    },
  });
  expect(rendered).toContain("Agent");
  expect(rendered).not.toContain("DO_NOT_RENDER");
  expect(rendered).not.toContain("\x1b");
  expect(rendered).not.toContain("\x07");
});
it("separates response text while output-file receipts omit body", () => {
  expect(paymentText({ status: 200, response: { message: "hello" } })).toContain(
    "--- response ---",
  );
  expect(paymentText({ status: 200, output: { path: "/tmp/a" } })).not.toContain(
    "--- response ---",
  );
});
it("shows the paid asset and amount after a payment", () => {
  const rendered = paymentText({
    status: 200,
    settled: true,
    payment: {
      asset: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      token: "USDT",
      decimals: 6,
      amount: "0.01",
      rawAmount: "10000",
    },
  });
  expect(rendered).toMatch(/^Amount\s+0\.01 \(10000 base units\)$/m);
  expect(rendered).toMatch(/^Asset\s+USDT$/m);
  const unregistered = paymentText({
    status: 200,
    payment: { asset: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", rawAmount: "5" },
  });
  expect(unregistered).toMatch(/^Amount\s+5 base units$/m);
  expect(unregistered).toMatch(/^Asset\s+0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c$/m);
  expect(paymentText({ status: 200 })).not.toMatch(/Amount|Asset/);
});
const roundtripResult = {
  serve: {
    network: "tron:3448148188",
    scheme: "exact_gasfree",
    token: "USDD",
    rawAmount: "10000000000000000",
    decimals: 18,
    payTo: "receiver",
  },
  pay: {
    settled: true,
    delivered: true,
    payer: { address: "sender" },
    paymentResponse: { transaction: "a".repeat(64) },
    response: { secret: "DO_NOT_DUMP" },
  },
};
it("renders a compact, exact payment summary without nested receipt JSON", () => {
  const before = structuredClone(roundtripResult);
  const rendered = roundtripText(roundtripResult);
  expect(rendered).toContain("Payment settled");
  for (const value of ["nile", "0.01 USDD", "sender", "receiver", "a".repeat(64)])
    expect(rendered).toContain(value);
  expect(rendered).not.toMatch(/DO_NOT_DUMP|paymentResponse|rawAmount|Fee/);
  expect(roundtripResult).toEqual(before);
});
it("keeps settled-but-undelivered payments distinct from failed payments", () => {
  const result = { ...roundtripResult, pay: { ...roundtripResult.pay, delivered: false } };
  expect(roundtripText(result)).toContain("Payment settled; response not delivered");
  expect(roundtripText({ ...result, pay: { settled: false } })).toContain("Payment not settled");
});
it("retains custom asset identity and minimal units without floats", () => {
  const rendered = roundtripText({
    ...roundtripResult,
    serve: { ...roundtripResult.serve, token: undefined, asset: "contract", rawAmount: "1" },
  });
  expect(rendered).toContain("0.000000000000000001 tokens");
  expect(rendered).toContain("contract");
});
it("sanitizes payment fields and shows daemon management details", () => {
  const rendered = serveText({
    ...roundtripResult.serve,
    daemon: true,
    pid: 123,
    logFile: "/tmp/access.log",
    payUrl: "http://localhost/pay\x1b[2J\nforged",
  });
  expect(rendered).toContain("running in background");
  expect(rendered).toContain("123");
  expect(rendered).toContain("/tmp/access.log");
  expect(rendered).not.toContain("\x1b");
  expect(rendered).not.toContain("\nforged");
});
it("shows the approval transaction when a payment carried one", () => {
  const rendered = paymentText({
    status: 200,
    settled: true,
    approval: { txId: "ab".repeat(32), token: "TXYZ", spender: "TYQu", status: "confirmed" },
  });
  expect(rendered).toContain("Approval");
  expect(rendered).toContain("ab".repeat(32));
  expect(paymentText({ status: 200 })).not.toContain("Approval");
});
