import { z, type RefinementCtx } from "zod";
import { addressFieldsFor, allRefines, Schemas } from "../../schemas/index.js";
import { CliError } from "../../../../../domain/errors/index.js";
import { resolveV4Pool } from "../../../../../domain/sunswap/v4-pool.js";
import {
  liquidityProtocolOf,
  parseLiquidityProtocol,
} from "../../../../../domain/sunswap/protocol.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapLiquidityService } from "../../../../../application/use-cases/tron/sunswap/liquidity-service.js";
import { TextFormatters } from "../../render/index.js";
import { LEDGER_TRON_SETTINGS_NOTE } from "../shared.js";
import { sunAmount } from "../../../../../domain/amounts/index.js";

const fields = z.object({
  // Do not use txModeFields: this command does not support sign-only.
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate and estimate only — no password, no signature, no broadcast"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe("emit the unsigned transactions in execution order without signing them"),
  protocol: z.string().describe("protocol version: V2, V3 or V4"),
  token0: z
    .string()
    .optional()
    .describe(
      "one side of the pair, symbol or contract address; on V3, TRX is wrapped to WTRX (not for --position-id)",
    ),
  token1: z
    .string()
    .optional()
    .describe("the other side of the pair, same rules (not for --position-id)"),
  positionId: z
    .string()
    .optional()
    .describe(
      "add to this existing position: the Position (#N) in 'sunswap position-list'; must be held by this account (V3 and V4)",
    ),
  fee: z.coerce
    .number()
    .optional()
    .describe(
      "fee tier, e.g. 500 or 3000; selects the pool on a V3 new position, required with no default for a V4 new position; optional and checked against the position's own on a V4 increase",
    ),
  tickLower: z.coerce
    .number()
    .optional()
    .describe(
      "lower bound of the price range; a multiple of the pool's tick spacing (V3 and V4 new position only)",
    ),
  tickUpper: z.coerce
    .number()
    .optional()
    .describe("upper bound of the price range; same constraint (V3 and V4 new position only)"),
  amount0: z
    .string()
    .optional()
    .describe("amount of token0 to deposit; omit to derive it from the pool's ratio"),
  amount1: z
    .string()
    .optional()
    .describe("amount of token1 to deposit; omit to derive it from the pool's ratio"),
  min0: z
    .string()
    .optional()
    .describe("least token0 to accept depositing; default V2 95% of amount0, V3 0"),
  min1: z
    .string()
    .optional()
    .describe("least token1 to accept depositing; default V2 95% of amount1, V3 0"),
  recipient: z
    .string()
    .optional()
    .describe("who receives the LP tokens or the position NFT; default the account"),
  deadline: z.coerce
    .number()
    .optional()
    .describe("Unix seconds the transaction stops being valid; default 30 minutes from now"),
  createPool: z
    .boolean()
    .default(false)
    .describe(
      "create the pool as part of this deposit; requires --sqrt-price on top of the pool key (V4 only)",
    ),
  sqrtPrice: z
    .string()
    .optional()
    .describe(
      "the new pool's starting price in Q64.96 fixed point, not a decimal ratio (V4 --create-pool only)",
    ),
  tickSpacing: z.coerce
    .number()
    .optional()
    .describe(
      "REQUIRED for a V4 new position: the pool's tick spacing. Part of the pool's identity and NOT implied by --fee — two V4 pools at the same fee tier can differ in spacing, so there is no default. 'sunswap pool-list --protocol V4' publishes each pool's tickSpacing",
    ),
  hooks: z
    .string()
    .optional()
    .describe(
      "the pool's hook contract; default none, which is what almost every pool has (V4 only). 'sunswap pool-list --protocol V4' publishes each pool's hooks",
    ),
  slippage: z
    .string()
    .optional()
    .describe(
      "tolerance on the deposit CEILING, e.g. 0.005; default none, so the ceiling is exactly the computed amounts (V4 only)",
    ),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe(
      "maximum energy fee to burn, in SUN; the dry run's estimate is a lower bound, so a limit set from it can fail",
    ),
});

const V3_ONLY = ["positionId", "fee", "tickLower", "tickUpper"] as const;

const V4_ONLY = ["createPool", "sqrtPrice", "tickSpacing", "hooks", "slippage"] as const;

// V4 bounds deposit costs from above; min0/min1 express floors and cannot apply.
const NOT_ON_V4 = ["min0", "min1"] as const;

const NOT_WITH_V4_POSITION_ID = [
  "tickLower",
  "tickUpper",
  "recipient",
  "createPool",
  "sqrtPrice",
  "tickSpacing",
  "hooks",
] as const;

const NOT_WITH_POSITION_ID = [
  "token0",
  "token1",
  "fee",
  "tickLower",
  "tickUpper",
  "recipient",
] as const;

function refuseV4Flags(value: Record<string, unknown>, ctx: RefinementCtx): void {
  for (const flag of NOT_ON_V4) {
    if (value[flag] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message:
          "is not accepted on V4: a V4 deposit is bounded from ABOVE, by --slippage on the ceiling, not from below by a minimum",
        params: { errorCode: "invalid_option" },
      });
    }
  }
  if (value.positionId !== undefined) {
    refuseV4IncreaseFlags(value, ctx);
    return;
  }
  // Validate the pure pool-key rules before wallet resolution.
  try {
    resolveV4Pool({
      createPool: value.createPool === true,
      ...(value.sqrtPrice === undefined ? {} : { sqrtPrice: String(value.sqrtPrice) }),
      ...(value.token0 === undefined ? {} : { token0: String(value.token0) }),
      ...(value.token1 === undefined ? {} : { token1: String(value.token1) }),
      ...(value.fee === undefined ? {} : { fee: Number(value.fee) }),
      ...(value.tickSpacing === undefined ? {} : { tickSpacing: Number(value.tickSpacing) }),
      ...(value.hooks === undefined ? {} : { hooks: String(value.hooks) }),
    });
  } catch (error) {
    // Rethrow exit-1 domain errors: schema issues preserve only usage codes.
    // Keep any earlier validation refusal first.
    if (error instanceof CliError && error.exitCode() === 1) {
      if (ctx.issues.length === 0) throw error;
      return;
    }
    const code = (error as { code?: string }).code;
    ctx.addIssue({
      code: "custom",
      path: [flagFrom(error) ?? "token0"],
      // Keep whole messages: removing a leading flag can break compound subjects.
      message: messageOf(error),
      params: { errorCode: code ?? "invalid_value" },
    });
  }
}

// The pair cross-check prevents funding a mistyped position ID.
function refuseV4IncreaseFlags(value: Record<string, unknown>, ctx: RefinementCtx): void {
  for (const flag of NOT_WITH_V4_POSITION_ID) {
    // An omitted createPool defaults to false.
    if (value[flag] !== undefined && value[flag] !== false) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message: "is not accepted with --position-id; the position already fixes it",
        params: { errorCode: "invalid_option" },
      });
    }
  }
  for (const flag of ["token0", "token1"] as const) {
    if (value[flag] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message:
          "is required on V4 alongside --position-id; the pair is checked against the pair the position holds",
        params: { errorCode: "missing_option" },
      });
    }
  }
}

function flagFrom(error: unknown): string | undefined {
  const named = /--([a-z0-9-]+)/.exec(messageOf(error))?.[1];
  if (named === undefined) return undefined;
  return named.replace(/-([a-z])/g, (_all, letter: string) => letter.toUpperCase());
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function refuseFlagsOutsideScenario(value: Record<string, unknown>, ctx: RefinementCtx): void {
  const protocol = liquidityProtocolOf(String(value.protocol));
  if (protocol === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["protocol"],
      message: "must be V2, V3 or V4",
      params: { errorCode: "invalid_value" },
    });
    return;
  }
  // Report protocol mismatches before other scenario errors.
  if (protocol !== "V4") {
    for (const flag of V4_ONLY) {
      if (value[flag] !== undefined && value[flag] !== false) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: `is a V4 flag and this deposit is ${protocol}`,
          params: { errorCode: "invalid_option" },
        });
      }
    }
  }
  if (protocol === "V4") {
    refuseV4Flags(value, ctx);
    return;
  }
  if (protocol === "V2") {
    for (const flag of V3_ONLY) {
      if (value[flag] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: "is not accepted on V2; it belongs to a concentrated-liquidity position",
          params: { errorCode: "invalid_option" },
        });
      }
    }
    for (const flag of ["token0", "token1"] as const) {
      if (value[flag] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: "is required on V2",
          params: { errorCode: "missing_option" },
        });
      }
    }
    return;
  }
  if (value.positionId === undefined) return;
  for (const flag of NOT_WITH_POSITION_ID) {
    if (value[flag] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message: "is not accepted with --position-id; the position already fixes it",
        params: { errorCode: "invalid_option" },
      });
    }
  }
}

export const sunswapAddLiquiditySpec: ChainSpec = {
  path: ["sunswap", "add-liquidity"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "sunswap.liquidity",
  summary: "Add liquidity to a pool",
  description:
    LEDGER_TRON_SETTINGS_NOTE +
    "Deposit both sides of a pair into a SunSwap pool.\n\n" +
    "V2 adds at the pool's current ratio and returns LP tokens. V3 mints a position NFT over a\n" +
    "price range, or adds to one you already hold with --position-id — which fixes the pair, the\n" +
    "fee tier and the range, so those flags are not accepted alongside it.\n\n" +
    "V4 NAMES A POOL BY ITS PARTS, and there are four of them: --token0, --token1, --fee and\n" +
    "--tick-spacing, plus --hooks when the pool has one (almost none do). The fourth is not\n" +
    "redundant — a V4 pool's tick spacing is part of its identity and is NOT implied by its fee\n" +
    "tier the way V3's is. Measured: two Nile pools both at fee 500, one with spacing 12 and one\n" +
    "with spacing 10. So --tick-spacing has no default; getting it wrong names a different pool.\n" +
    "'sunswap pool-list --protocol V4' publishes each pool's tickSpacing and hooks.\n\n" +
    "The same four flags create a pool, with --create-pool and --sqrt-price on top — one key\n" +
    "builder serves both, so the pool you create is the pool you then deposit into.\n\n" +
    "Or add to a position with --position-id, which names its own pool. A V4 increase ALSO\n" +
    "REQUIRES --token0/--token1, unlike V3's: they select nothing — the position\n" +
    "names its own pool — and are checked against the pair the position holds, so adding to a\n" +
    "position you did not mean is refused rather than sent. --fee is checked the same way.\n\n" +
    "ON V4 THE BOUND IS A CEILING, not a floor: --min0/--min1 are not accepted and --slippage\n" +
    "widens what the deposit may cost UPWARD. With no --slippage the ceiling is exactly the\n" +
    "computed amounts. On a native pair the ceiling is sent as the call's value and the remainder\n" +
    "is returned, so the account must hold the CEILING, not the deposit.\n\n" +
    "ON V3 YOUR TRX BECOMES WTRX: V3 pools are wrapped. On V2, TRX is deposited natively.\n\n" +
    "Give one amount and the other is derived — from the pool's ratio on V2, from the range and\n" +
    "the current price on V3; give both to deposit exact amounts.\n\n" +
    "On V2 and V3, each token side is approved for exactly the amount this deposit needs.\n" +
    "On V4, an insufficient token allowance to Permit2 is replaced with an unlimited approval;\n" +
    "each new Permit2 grant is limited to this deposit's ceiling and lasts one hour.\n" +
    "An approval is sent, confirmed and re-read before the deposit follows, so the two\n" +
    "can never land out of order.\n\n" +
    "A new position's NFT id exists only in the confirmed receipt, so pass --wait to learn it;\n" +
    "'sunswap position-list' is mainnet-only and cannot tell you afterwards on Nile.\n\n" +
    "--dry-run validates everything — balances, the pool, the amounts, the allowances — without a\n" +
    "password, and works for a watch-only account.",
  baseFields: fields,
  // Reject unsupported flags before validating recipient addresses.
  baseRefine: allRefines(refuseFlagsOutsideScenario, addressFieldsFor("tron", "recipient")),
  examples: [
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V2 --token0 USDT --token1 WTRX --amount0 10 --dry-run",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V2 --token0 TRX --token1 USDT --amount0 10 --wait",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V3 --token0 USDT --token1 WTRX --fee 500 --amount0 10 --wait",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V3 --position-id 1846 --amount0 5 --wait",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V4 --token0 TRX --token1 USDT --fee 500 --tick-spacing 10 --amount0 5 --dry-run",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V4 --token0 TRX --token1 USDT --fee 500 --tick-spacing 10 --create-pool --sqrt-price 79228162514264337593543950336 --amount0 5 --amount1 5 --wait",
    },
    {
      cmd: "wallet-cli sunswap add-liquidity --protocol V4 --position-id 12 --token0 TRX --token1 USDT --amount0 5 --dry-run",
    },
  ],
  formatText: TextFormatters.sunswapLiquidity,
};

export const sunswapAddLiquidityTronBinding = (
  service: SunSwapLiquidityService,
): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.addLiquidity(ctx, net, {
      protocol: parseLiquidityProtocol(input.protocol),
      ...(input.token0 === undefined ? {} : { token0: input.token0 }),
      ...(input.token1 === undefined ? {} : { token1: input.token1 }),
      ...(input.positionId === undefined ? {} : { positionId: input.positionId }),
      ...(input.fee === undefined ? {} : { fee: input.fee }),
      ...(input.tickLower === undefined ? {} : { tickLower: input.tickLower }),
      ...(input.tickUpper === undefined ? {} : { tickUpper: input.tickUpper }),
      ...(input.amount0 === undefined ? {} : { amount0: input.amount0 }),
      ...(input.amount1 === undefined ? {} : { amount1: input.amount1 }),
      ...(input.min0 === undefined ? {} : { min0: input.min0 }),
      ...(input.min1 === undefined ? {} : { min1: input.min1 }),
      ...(input.recipient === undefined ? {} : { recipient: input.recipient }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: sunAmount(input.feeLimit) }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
      ...(input.createPool === undefined ? {} : { createPool: input.createPool }),
      ...(input.sqrtPrice === undefined ? {} : { sqrtPrice: input.sqrtPrice }),
      ...(input.tickSpacing === undefined ? {} : { tickSpacing: input.tickSpacing }),
      ...(input.hooks === undefined ? {} : { hooks: input.hooks }),
      ...(input.slippage === undefined ? {} : { slippage: input.slippage }),
    }),
});
