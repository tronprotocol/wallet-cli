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
