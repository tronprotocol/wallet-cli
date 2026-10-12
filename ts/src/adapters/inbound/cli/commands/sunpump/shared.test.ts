import { describe, expect, it } from "vitest";
import { z } from "zod";
import { curveTradeFields, refuseQuoteWithSendingFlags } from "./shared.js";

const schema = z.object(curveTradeFields).superRefine(refuseQuoteWithSendingFlags);

function issues(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        errorCode: (issue as { params?: { errorCode?: string } }).params?.errorCode,
      }));
}

/**
 * `--quote` sends no transaction, so it refuses every flag that describes one — the floor flags
 * included, since a floor given to a quote would be accepted and then protect nothing.
 */
describe("--quote", () => {
  it.each([
    ["slippage", { slippage: "0.0001" }, "a tolerance"],
    ["minOut", { minOut: "1" }, "a minimum"],
  ])("refuses --%s, in sunswap swap's words", (path, flags, what) => {
    expect(issues({ quote: true, ...flags })).toEqual([
      {
        path,
        message: `cannot be given with --quote: a quote enforces no floor, so ${what} would have nothing to apply to`,
        errorCode: "invalid_option",
      },
    ]);
  });

  it.each(["dryRun", "buildOnly"])("refuses --%s", (flag) => {
    expect(issues({ quote: true, [flag]: true })).toEqual([
      {
        path: flag,
        message: "cannot be given with --quote, which sends no transaction",
        errorCode: "invalid_option",
      },
    ]);
  });

  it("accepts a bare quote", () => {
    expect(issues({ quote: true })).toEqual([]);
  });
});

describe("the two floors", () => {
  it("refuse each other outside a quote", () => {
    expect(issues({ slippage: "0.05", minOut: "1" })).toEqual([
      expect.objectContaining({ path: "minOut", errorCode: "invalid_option" }),
    ]);
  });

  it("are each accepted alone outside a quote", () => {
    expect(issues({ slippage: "0.05" })).toEqual([]);
    expect(issues({ minOut: "1" })).toEqual([]);
  });
});
