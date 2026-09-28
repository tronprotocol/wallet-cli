/**
 * The flag × scenario matrix, checked where it is decided.
 *
 * These refusals depend on nothing remote, so they belong to the schema: they fire deterministically,
 * before a wallet is opened or a node is asked anything. Exercised through the spec's own fields and
 * refine, which is exactly what the shell composes.
 */
import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";
import { sunswapRemoveLiquiditySpec } from "./remove-liquidity.js";

const schema = (
  sunswapRemoveLiquiditySpec.baseFields as unknown as {
    superRefine: (refine: unknown) => { safeParse: (value: unknown) => SafeParse };
  }
).superRefine(sunswapRemoveLiquiditySpec.baseRefine as unknown);

interface SafeParse {
  success: boolean;
  error?: { issues: (ZodIssue & { params?: { errorCode?: string } })[] };
}

const V4 = {
  protocol: "V4",
  positionId: "12",
  token0: "USDT",
  token1: "WTRX",
  liquidity: "1000",
};

function refusals(value: Record<string, unknown>): { path: string; code?: string }[] {
  const parsed = schema.safeParse(value);
  return (parsed.error?.issues ?? []).map((issue) => ({
    path: String(issue.path[0]),
    code: issue.params?.errorCode,
  }));
}

describe("sunswap remove-liquidity — V4's flag matrix", () => {
  it("accepts the required set: the position AND the pair", () => {
    expect(schema.safeParse(V4).success).toBe(true);
  });

  // V4 is the one scenario that needs both, because the pair is a cross-check rather than a
  // selector. A missing side is a missing option, not something to infer from the position.
  it.each(["token0", "token1", "positionId"])("requires --%s", (flag) => {
    const rest = Object.fromEntries(Object.entries(V4).filter(([key]) => key !== flag));
    expect(refusals(rest)).toContainEqual({ path: flag, code: "missing_option" });
  });

  /**
   * `--recipient` is refused rather than ignored.
   *
   * A V4 withdrawal settles to the signing account and nowhere else, so a flag that was accepted and
   * dropped would tell a caller their money was going somewhere it was not.
   */
  it("refuses --recipient", () => {
    expect(refusals({ ...V4, recipient: "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB" })).toContainEqual({
      path: "recipient",
      code: "invalid_option",
    });
  });

  it("accepts the optional flags the matrix allows", () => {
    expect(schema.safeParse({ ...V4, fee: 500, min0: "1", min1: "2", deadline: 1 }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...V4, slippage: "0.005" }).success).toBe(true);
  });

  /**
   * They COMBINE, and PM says so: 6.2.3 defines --slippage as a tolerance that lowers
   * --min0/--min1 further. Refusing the pair would contradict the spec, and it would also refuse
   * the one shape a careful caller wants — a floor they chose, with a little room under it.
   */
  it("accepts --slippage together with an explicit minimum", () => {
    expect(refusals({ ...V4, slippage: "0.005", min0: "1" })).toEqual([]);
  });
});

describe("sunswap remove-liquidity — V4's flags elsewhere", () => {
  it.each(["fee", "slippage"])("refuses --%s on V3", (flag) => {
    const value = { protocol: "V3", positionId: "686", liquidity: "1000", [flag]: "500" };
    expect(refusals(value)).toContainEqual({ path: flag, code: "invalid_option" });
  });

  it("still requires the pair on V2 and still refuses it on V3", () => {
    expect(refusals({ protocol: "V2", liquidity: "1" })).toContainEqual({
      path: "token0",
      code: "missing_option",
    });
    expect(
      refusals({ protocol: "V3", positionId: "1", liquidity: "1", token0: "USDT" }),
    ).toContainEqual({ path: "token0", code: "invalid_option" });
  });

  it("names V4 as a protocol it serves", () => {
    expect(refusals({ protocol: "V5", liquidity: "1" })).toContainEqual({
      path: "protocol",
      code: "invalid_value",
    });
    // Lower case too: the binding upper-cases it before the service ever sees it.
    expect(schema.safeParse({ ...V4, protocol: "v4" }).success).toBe(true);
  });
});
