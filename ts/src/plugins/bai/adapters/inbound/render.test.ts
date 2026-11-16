import { expect, it } from "vitest";
import { baiRechargeText, baiRecordsText, baiUsageText } from "./render.js";

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
