import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { ZodObject, ZodRawShape } from "zod";
import { CliError } from "../../../../../domain/errors/index.js";
import { composeRefines, parseInputSchema } from "../../shell/index.js";
import { sunswapRemoveLiquiditySpec } from "./remove-liquidity.js";
import { exitCodeOf } from "../../output/errors.js";

const schema = (
  sunswapRemoveLiquiditySpec.baseFields as unknown as {
    superRefine: (refine: unknown) => { safeParse: (value: unknown) => SafeParse };
  }
).superRefine(sunswapRemoveLiquiditySpec.baseRefine as unknown);

interface SafeParse {
  success: boolean;
  error?: { issues: (z.core.$ZodIssue & { params?: { errorCode?: string } })[] };
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

  it.each(["token0", "token1", "positionId"])("requires --%s", (flag) => {
    const rest = Object.fromEntries(Object.entries(V4).filter(([key]) => key !== flag));
    expect(refusals(rest)).toContainEqual({ path: flag, code: "missing_option" });
  });

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
    expect(schema.safeParse({ ...V4, protocol: "v4" }).success).toBe(true);
  });
});

describe("sunswap remove-liquidity — a malformed --recipient", () => {
  it.each(["TNotAnAddress", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"])(
    "refuses %s as invalid_address before any network call",
    (recipient) => {
      const error = recipientRefusal({
        protocol: "V3",
        positionId: "696",
        liquidity: "1",
        recipient,
      });
      expect(error).toMatchObject({ code: "invalid_address" });
      expect(exitCodeOf(error)).toBe(2);
      expect(error.message).toMatch(/^invalid --recipient: /);
    },
  );

  it("accepts a well-formed TRON address", () => {
    expect(() =>
      parseInputSchema(recipientSchema, {
        protocol: "V3",
        positionId: "696",
        liquidity: "1",
        recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC",
      }),
    ).not.toThrow();
  });
});

const recipientSchema = composeRefines(
  sunswapRemoveLiquiditySpec.baseFields as ZodObject<ZodRawShape>,
  sunswapRemoveLiquiditySpec.baseRefine,
);

function recipientRefusal(argv: Record<string, unknown>): CliError {
  try {
    parseInputSchema(recipientSchema, argv);
  } catch (error) {
    if (error instanceof CliError) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}
