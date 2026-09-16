import { expect, it } from "vitest";
import { agentShowText, paymentText, providerEndpointsText, providerShowText } from "./x402.js";
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
