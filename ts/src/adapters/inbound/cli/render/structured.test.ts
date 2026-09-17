import { describe, expect, it } from "vitest";
import { structuredText } from "./structured.js";
import { baiRechargeText, baiUsageText, baiRecordsText } from "./bai.js";
import { paymentText, roundtripText } from "./x402.js";

describe("human-readable nested results", () => {
  it("expands nested objects and empty lists without losing decimal precision", () => {
    const value = {
      records: [{ amount: "0.000000000000000001", enabled: false }],
      empty: [],
      missing: null,
    };
    const output = structuredText(value);
    expect(output).toContain("amount: 0.000000000000000001");
    expect(output).toContain("enabled: No");
    expect(output).toContain("empty:\n  None");
    expect(output).toContain("missing: Not available");
    expect(output).not.toMatch(/[{}[\]]/);
    expect(value.records[0]?.enabled).toBe(false);
  });

  it("sanitizes untrusted nested labels and strings", () => {
    const output = structuredText({ "a\nlabel": { value: "\u001b[31munsafe\u202e" } });
    expect(output).toContain("a label:");
    expect(output).not.toContain("\u001b");
    expect(output).toContain("<U+202E>");
  });

  it("distinguishes recharge credit confirmation from an unconfirmed report", () => {
    expect(baiRechargeText({ creditStatus: "credited" })).toContain("✅ B.AI recharge credited");
    const unconfirmed = baiRechargeText({
      creditStatus: "unconfirmed",
      txHash: "original-hash",
      retryPayment: false,
    });
    expect(unconfirmed).toContain("⚠️ B.AI credit not confirmed");
    expect(unconfirmed).toContain("original-hash");
    expect(unconfirmed).toContain("reconcile before paying again");
    expect(baiRechargeText({ dryRun: true })).toContain("no order or payment created");
  });

  it("labels B.AI spending and displays pagination and empty results", () => {
    expect(
      baiUsageText({ credits: "10.01", thisMonth: { month: "2026-09", credits: "2" }, trend: [] }),
    ).toContain("Credits spent this month: 2");
    const output = baiRecordsText({ records: [], pagination: { total: 0, hasMore: false } });
    expect(output).toContain("records:\n    None");
    expect(output).toContain("has More: No");
  });

  it("shows payment receipt and provider response without a JSON dump", () => {
    const output = paymentText({
      settled: true,
      delivered: true,
      paymentResponse: { transaction: "full-hash" },
      response: { answer: { content: "hello" } },
    });
    expect(output).toContain("full-hash");
    expect(output).toContain("content: hello");
    expect(output).not.toContain('{"');
    expect(roundtripText({ serve: {}, pay: { dryRun: true } })).toContain("Payment preview");
    expect(paymentText({ dryRun: true, selected: { amount: "1000000" } })).toContain(
      "no payment sent",
    );
  });
});
