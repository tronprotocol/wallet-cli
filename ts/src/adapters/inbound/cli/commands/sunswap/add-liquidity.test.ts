/**
 * The V4 pool refusals keep the code the domain chose.
 *
 * Exercised through the same composition and parser the shell uses, because the code a caller sees
 * is decided there: an issue's declared code survives only when it is a usage code, and an exit-1
 * code cannot ride an issue at all.
 */
import { describe, expect, it } from "vitest";
import type { ZodObject, ZodRawShape } from "zod";
import { CliError } from "../../../../../domain/errors/index.js";
import { composeRefines, parseInputSchema } from "../../shell/index.js";
import { sunswapAddLiquiditySpec } from "./add-liquidity.js";

const schema = composeRefines(
  sunswapAddLiquiditySpec.baseFields as ZodObject<ZodRawShape>,
  sunswapAddLiquiditySpec.baseRefine,
);

const USDD = "TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

function refusal(argv: Record<string, unknown>): CliError {
  try {
    parseInputSchema(schema, argv);
  } catch (error) {
    if (error instanceof CliError) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("sunswap add-liquidity — V4 pool refusals", () => {
  // PM 6.1.2: --create-pool without --sqrt-price is missing_option, "and the reverse invalid_option".
  it("refuses --sqrt-price without --create-pool as invalid_option", () => {
    const error = refusal({
      protocol: "V4",
      token0: "TRX",
      token1: USDT,
      amount0: "10",
      sqrtPrice: "79228162514264337593543950336",
    });
    expect(error).toMatchObject({ code: "invalid_option" });
    expect(error.exitCode()).toBe(2);
    expect(error.message).toMatch(/^invalid --sqrt-price: /);
  });

  it("still refuses --create-pool without --sqrt-price as missing_option", () => {
    const error = refusal({
      protocol: "V4",
      token0: "TRX",
      token1: USDT,
      amount0: "10",
      createPool: true,
      fee: 500,
      tickSpacing: 10,
    });
    expect(error).toMatchObject({ code: "missing_option" });
  });

  // Exit 1, like the same refusal on V2 and on every other command that raises `same_token`.
  it("refuses a pool whose two currencies are the same token as same_token, exit 1", () => {
    const error = refusal({
      protocol: "V4",
      token0: USDD,
      token1: USDD,
      amount0: "10",
      fee: 500,
      tickSpacing: 10,
    });
    expect(error).toMatchObject({ code: "same_token" });
    expect(error.exitCode()).toBe(1);
  });

  // An earlier refusal is still the one reported; the domain's check does not jump the queue.
  it("reports an earlier flag refusal before same_token", () => {
    const error = refusal({
      protocol: "V4",
      token0: USDD,
      token1: USDD,
      amount0: "10",
      min0: "1",
      fee: 500,
      tickSpacing: 10,
    });
    expect(error).toMatchObject({ code: "invalid_option" });
    expect(error.message).toMatch(/^invalid --min0: /);
  });
});

/**
 * A malformed `--recipient` is the caller's typo, not our crash (PM 6.0's shared codes).
 *
 * Unchecked, it travelled to the ABI encoder and came back as `internal_error` ("Invalid checksum")
 * at exit 1 — after the position had already been read. Refused here, it is `invalid_address` at
 * exit 2 before anything remote is asked. An EVM address is malformed on TRON for the same reason.
 */
describe("sunswap add-liquidity — a malformed --recipient", () => {
  it.each(["TNotAnAddress", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"])(
    "refuses %s as invalid_address before any network call",
    (recipient) => {
      const error = recipientRefusal({
        protocol: "V3",
        token0: "TRX",
        token1: USDT,
        amount0: "10",
        recipient,
      });
      expect(error).toMatchObject({ code: "invalid_address" });
      expect(error.exitCode()).toBe(2);
      expect(error.message).toMatch(/^invalid --recipient: /);
    },
  );

  it("accepts a well-formed TRON address", () => {
    expect(() =>
      parseInputSchema(recipientSchema, {
        protocol: "V3",
        token0: "TRX",
        token1: USDT,
        amount0: "10",
        recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC",
      }),
    ).not.toThrow();
  });
});

const recipientSchema = composeRefines(
  sunswapAddLiquiditySpec.baseFields as ZodObject<ZodRawShape>,
  sunswapAddLiquiditySpec.baseRefine,
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
