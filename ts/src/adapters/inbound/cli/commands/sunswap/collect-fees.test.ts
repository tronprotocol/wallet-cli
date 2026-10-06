/**
 * The flag × scenario matrix (PM 6.3.3), checked where it is decided.
 *
 * These refusals depend on nothing remote, so they belong to the schema: they fire
 * deterministically, before a wallet is opened or a node is asked anything. Exercised through the
 * spec's own fields and refine, which is exactly what the shell composes.
 */
import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";
import type { ZodObject, ZodRawShape } from "zod";
import { CliError } from "../../../../../domain/errors/index.js";
import { composeRefines, parseInputSchema } from "../../shell/index.js";
import { sunswapCollectFeesSpec } from "./collect-fees.js";

const schema = (
  sunswapCollectFeesSpec.baseFields as unknown as {
    superRefine: (refine: unknown) => { safeParse: (value: unknown) => SafeParse };
  }
).superRefine(sunswapCollectFeesSpec.baseRefine as unknown);

interface SafeParse {
  success: boolean;
  error?: { issues: (ZodIssue & { params?: { errorCode?: string } })[] };
}

const V3 = { protocol: "V3", positionId: "686" };
const V4 = { protocol: "V4", positionId: "1" };

function refusals(value: Record<string, unknown>): { path: string; code?: string }[] {
  const parsed = schema.safeParse(value);
  return (parsed.error?.issues ?? []).map((issue) => ({
    path: String(issue.path[0]),
    code: issue.params?.errorCode,
  }));
}

describe("sunswap collect-fees — which protocols have claimable fees", () => {
  it.each(["V3", "V4", "v4"])("accepts %s with just the position", (protocol) => {
    expect(schema.safeParse({ protocol, positionId: "1" }).success).toBe(true);
  });

  /**
   * V2 is `invalid_value`, not an unknown protocol.
   *
   * Its fees are real; they are simply not separable. "Unknown protocol" would send a caller
   * looking for a spelling error instead of telling them how a V2 pool works.
   */
  it("refuses V2 by explaining that its fees are not separable", () => {
    const parsed = schema.safeParse({ protocol: "V2", positionId: "1" });
    expect(refusals({ protocol: "V2", positionId: "1" })).toContainEqual({
      path: "protocol",
      code: "invalid_value",
    });
    expect(parsed.error?.issues[0]?.message).toContain("accrue into the LP token itself");
  });

  it("refuses a protocol it does not serve", () => {
    expect(refusals({ protocol: "V5", positionId: "1" })).toContainEqual({
      path: "protocol",
      code: "invalid_value",
    });
  });
});

describe("sunswap collect-fees — V4's flag matrix", () => {
  it("takes the pair and the tier as an optional cross-check", () => {
    expect(schema.safeParse({ ...V4, token0: "TRX", token1: "USDT", fee: 500 }).success).toBe(true);
  });

  it("takes a deadline, which V3's collect has no room for", () => {
    expect(schema.safeParse({ ...V4, deadline: 1790000000 }).success).toBe(true);
  });

  /**
   * `--recipient` is refused rather than ignored.
   *
   * A V4 collection settles to the signing account and nowhere else, so a flag that was accepted
   * and dropped would tell a caller their money was going somewhere it was not.
   */
  it("refuses --recipient", () => {
    expect(refusals({ ...V4, recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC" })).toContainEqual({
      path: "recipient",
      code: "invalid_option",
    });
  });

  // One side names no pair at all. The pair is optional; half of it is a mistake.
  it.each([
    ["token0", "token1"],
    ["token1", "token0"],
  ])("refuses --%s without --%s", (given, missing) => {
    expect(refusals({ ...V4, [given]: "USDT" })).toContainEqual({
      path: missing,
      code: "missing_option",
    });
  });

  it("refuses --fee on its own, which would check nothing", () => {
    expect(refusals({ ...V4, fee: 500 })).toContainEqual({
      path: "token0",
      code: "missing_option",
    });
  });
});

describe("sunswap collect-fees — V4's flags elsewhere", () => {
  it.each(["token0", "token1", "fee", "deadline"])("refuses --%s on V3", (flag) => {
    expect(refusals({ ...V3, [flag]: "500" })).toContainEqual({
      path: flag,
      code: "invalid_option",
    });
  });

  it("still accepts --recipient on V3, where the fees can go elsewhere", () => {
    expect(
      schema.safeParse({ ...V3, recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC" }).success,
    ).toBe(true);
  });
});

/**
 * A malformed `--recipient` is the caller's typo, not our crash (PM 6.0's shared codes).
 *
 * Unchecked, it travelled to the ABI encoder and came back as `internal_error` ("Invalid checksum")
 * at exit 1 — after the position had already been read. Refused here, it is `invalid_address` at
 * exit 2 before anything remote is asked. An EVM address is malformed on TRON for the same reason.
 */
describe("sunswap collect-fees — a malformed --recipient", () => {
  it.each(["TNotAnAddress", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"])(
    "refuses %s as invalid_address before any network call",
    (recipient) => {
      const error = recipientRefusal({ protocol: "V3", positionId: "686", recipient });
      expect(error).toMatchObject({ code: "invalid_address" });
      expect(error.exitCode()).toBe(2);
      expect(error.message).toMatch(/^invalid --recipient: /);
    },
  );

  it("accepts a well-formed TRON address", () => {
    expect(() =>
      parseInputSchema(recipientSchema, {
        protocol: "V3",
        positionId: "686",
        recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC",
      }),
    ).not.toThrow();
  });
});

const recipientSchema = composeRefines(
  sunswapCollectFeesSpec.baseFields as ZodObject<ZodRawShape>,
  sunswapCollectFeesSpec.baseRefine,
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
