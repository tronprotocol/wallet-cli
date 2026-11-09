import { describe, expect, it } from "vitest";
import { sunswapSwapSpec } from "./swap.js";

const schema = sunswapSwapSpec.baseFields.superRefine(sunswapSwapSpec.baseRefine!);
const POSITIONALS = { tokenIn: "TRX", tokenOut: "USDT", amountIn: "1" };

function issues(input: Record<string, unknown>) {
  const result = schema.safeParse({ ...POSITIONALS, ...input });
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        errorCode: (issue as { params?: { errorCode?: string } }).params?.errorCode,
      }));
}

describe("sunswap swap --quote", () => {
  it("declares --wait and --wait-timeout refused under --quote", () => {
    expect(sunswapSwapSpec.rejectsWaitWith).toBe("quote");
  });

  it.each([{ slippage: "0.005" }, { minOut: "1" }])("refuses a floor: %o", (flags) => {
    expect(issues({ quote: true, ...flags })).toEqual([
      { path: Object.keys(flags)[0], errorCode: "invalid_option" },
    ]);
  });
});

describe("sunswap swap --min-out", () => {
  it("refuses --slippage alongside it", () => {
    expect(issues({ slippage: "0.005", minOut: "1" })).toEqual([
      { path: "minOut", errorCode: "invalid_option" },
    ]);
  });

  it("is accepted alone outside a quote", () => {
    expect(issues({ minOut: "1" })).toEqual([]);
  });
});
