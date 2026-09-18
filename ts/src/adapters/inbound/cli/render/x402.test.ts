import { expect, it } from "vitest";
import {
  agentShowText,
  paymentText,
  providerEndpointsText,
  providerShowText,
  roundtripText,
  serveText,
} from "./x402.js";
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
it("renders a provider summary without dumping its full description", () => {
  const data = {
    fqn: "demo",
    description: "First sentence. Second sentence.",
    unknownField: "SECRET",
    chains: ["tron:3448148188"],
  };
  const rendered = providerShowText(data);
  expect(rendered).toContain("First sentence.");
  expect(rendered).toContain("nile");
  expect(rendered).not.toContain("Second");
  expect(rendered).not.toContain("SECRET");
  expect(data.description).toContain("Second");
});
it("renders exact prices, ranges, missing routes and unique network aliases", () => {
  const rendered = providerEndpointsText({
    endpoints: [
      {
        method: "GET",
        path: "/single",
        minPriceUsd: 0.000001,
        maxPriceUsd: 0.000001,
        x402Routes: [
          { network: "tron:728126428" },
          { network: "tron:728126428" },
          { network: "eip155:56" },
        ],
      },
      {
        method: "GET",
        path: "/range",
        minPriceUsd: 0.000001,
        maxPriceUsd: 0.000003,
        x402Routes: [{ network: "eip155:8453" }],
      },
      { method: "GET", path: "/unpriced", minPriceUsd: 0, maxPriceUsd: 0, x402Routes: [] },
    ],
  });
  expect(rendered).toContain("Price (USD)");
  expect(rendered).toContain("0.000001–0.000003");
  expect(rendered).toContain("tron, bsc");
  expect(rendered).toContain("——");
});
it("separates response text while output-file receipts omit body", () => {
  expect(paymentText({ status: 200, response: { message: "hello" } })).toContain(
    "--- response ---",
  );
  expect(paymentText({ status: 200, output: { path: "/tmp/a" } })).not.toContain(
    "--- response ---",
  );
});
it("wraps a wide-character summary with aligned continuation lines", () => {
  const original = Object.getOwnPropertyDescriptor(process.stdout, "columns");
  Object.defineProperty(process.stdout, "columns", { value: 32, configurable: true });
  try {
    const rendered = providerShowText({
      description: "这是一段需要正确折行的很长中文介绍内容。第二句不显示。",
    });
    expect(rendered).toContain("\n           ");
    expect(rendered).not.toContain("第二句");
  } finally {
    if (original) Object.defineProperty(process.stdout, "columns", original);
    else Reflect.deleteProperty(process.stdout, "columns");
  }
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
// The one-time Permit2 approve is a separate on-chain transaction the payer should be able to
// find from the default text, not only from JSON.
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
