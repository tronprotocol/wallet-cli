import { z, type RefinementCtx } from "zod";
import { Schemas } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapRemoveLiquidityService } from "../../../../../application/use-cases/tron/sunswap/remove-liquidity-service.js";
import { TextFormatters } from "../../render/index.js";

const PROTOCOLS = ["V2", "V3", "V4"] as const;

/**
 * Flags that belong only to V4.
 *
 * `--fee` is a cross-check on V4 rather than a selector, and `--slippage` is a tolerance on the
 * FLOOR. Neither means anything on V2 or V3, where the tier comes from the pair or the position and
 * the floor is set directly with `--min0` / `--min1`.
 */
const V4_ONLY = ["fee", "slippage"] as const;

/**
 * Flags V4 does not have.
 *
 * `--recipient` is absent by design (PM 6.2.3): a V4 withdrawal settles to the signing account and
 * nowhere else. Accepting the flag and ignoring it would send someone's money to the wrong place
 * while telling them otherwise.
 */
const NOT_ON_V4 = ["recipient"] as const;

const fields = z.object({
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate and estimate only — no password, no signature, no broadcast"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe("emit the unsigned transactions in execution order without signing them"),
  protocol: z.string().describe("protocol version: V2, V3 or V4"),
  // One flag, two meanings, and the difference is invisible in the value itself — so it is
  // spelled out here rather than left to a reader to infer from the protocol they chose.
  liquidity: z
    .string()
    .describe(
      "how much to withdraw: on V2 the LP tokens to burn, in whole tokens; on V3 and V4 the position's internal liquidity (not a token amount, see 'Liquidity' in the add-liquidity receipt)",
    ),
  token0: z
    .string()
    .optional()
    .describe(
      "one side of the pair, symbol or contract address (V2, and V4 where it is checked against the position)",
    ),
  token1: z.string().optional().describe("the other side of the pair, same rules (V2 and V4)"),
  positionId: z
    .string()
    .optional()
    .describe("the position to withdraw from; must be held by this account (V3 and V4)"),
  fee: z.coerce
    .number()
    .optional()
    .describe(
      "the pool's fee tier, checked against the one the position reports; it selects nothing (V4 only)",
    ),
  slippage: z
    .string()
    .optional()
    .describe(
      "tolerance BELOW the computed minimums, e.g. 0.005; not combinable with --min0/--min1 (V4 only)",
    ),
  min0: z
    .string()
    .optional()
    .describe("least token0 to accept back; default V2 95% of the expected amount, V3/V4 0"),
  min1: z
    .string()
    .optional()
    .describe("least token1 to accept back; default V2 95% of the expected amount, V3/V4 0"),
  recipient: z
    .string()
    .optional()
    .describe(
      "who receives the tokens; default the account. On V3 the collected fees go here too. Not accepted on V4",
    ),
  deadline: z.coerce
    .number()
    .optional()
    .describe("Unix seconds the transaction stops being valid; default 30 minutes from now"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe(
      "maximum energy fee to burn, in SUN; the dry run's estimate is a lower bound, so a limit set from it can fail",
    ),
});

/**
 * The flag × scenario matrix (PM 6.2.3).
 *
 * A V2 withdrawal names the pair; a V3 one names the position, which already knows its pair, so
 * accepting both would let a caller believe the two could disagree. V4 is the exception and
 * deliberately so: it requires BOTH, because there the pair is not a selector but a cross-check the
 * use case makes against what the position reports.
 *
 * Every refusal here depends on nothing remote, so it fires deterministically and without a wallet.
 */
function refuseFlagsOutsideScenario(value: Record<string, unknown>, ctx: RefinementCtx): void {
  const protocol = String(value.protocol).toUpperCase();
  if (!PROTOCOLS.includes(protocol as (typeof PROTOCOLS)[number])) {
    ctx.addIssue({
      code: "custom",
      path: ["protocol"],
      message: "must be V2, V3 or V4",
      params: { errorCode: "invalid_value" },
    });
    return;
  }
  // V4's own flags on a V2 or V3 withdrawal, said before anything else: a caller who passed
  // --slippage to V3 has the wrong protocol rather than a stray flag.
  if (protocol !== "V4") {
    for (const flag of V4_ONLY) {
      if (value[flag] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: `is a V4 flag and this withdrawal is ${protocol}`,
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
    if (value.positionId !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["positionId"],
        message: "is not accepted on V2; a V2 pool has no positions",
        params: { errorCode: "invalid_option" },
      });
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
  if (value.positionId === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["positionId"],
      message: "is required on V3",
      params: { errorCode: "missing_option" },
    });
  }
  for (const flag of ["token0", "token1"] as const) {
    if (value[flag] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message: "is not accepted on V3; the position already names the pair",
        params: { errorCode: "invalid_option" },
      });
    }
  }
}

/**
 * V4's own matrix (PM 6.2.3).
 *
 * Both the position id AND the pair are required, which is the one place this command asks for more
 * than V3 does. The pair does not choose the pool — the position does — so it is checked against
 * what the position reports and a disagreement is refused. That check needs the chain and therefore
 * lives in the use case; what lives here is that both were given at all.
 */
function refuseV4Flags(value: Record<string, unknown>, ctx: RefinementCtx): void {
  for (const flag of NOT_ON_V4) {
    if (value[flag] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message:
          "is not accepted on V4; the withdrawal always settles to the signing account, and a flag that was accepted and ignored would say otherwise",
        params: { errorCode: "invalid_option" },
      });
    }
  }
  if (value.positionId === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["positionId"],
      message: "is required on V4",
      params: { errorCode: "missing_option" },
    });
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

export const sunswapRemoveLiquiditySpec: ChainSpec = {
  path: ["sunswap", "remove-liquidity"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "sunswap.liquidity",
  summary: "Withdraw liquidity from a pool",
  description:
    "Take liquidity back out of a SunSwap pool.\n\n" +
    "V2 burns LP tokens and returns both sides at the pool's current ratio. The LP token itself\n" +
    "is approved to the router for exactly the amount being burned — not the pair's two tokens.\n\n" +
    "V3 withdraws from a position you hold, and does it in ONE transaction: the principal and\n" +
    "the fees the position has accrued arrive together. Nothing is approved, because the position\n" +
    "manager already holds the NFT. The receipt's Received line is the total; -o json separates\n" +
    "the principal from the fees collected alongside it.\n\n" +
    "V4 withdraws from a position too, and is ONE call rather than a multicall: decreaseLiquidity\n" +
    "settles the pair itself. It needs BOTH --position-id and the pair — the position chooses the\n" +
    "pool, and --token0/--token1 are checked against what it holds, so a withdrawal from a position\n" +
    "you did not mean is refused rather than sent. The tokens always go to the signing account, so\n" +
    "--recipient is not accepted. --min0/--min1 are floors, defaulting to 0, and --slippage lowers\n" +
    "the computed floors further — the opposite direction to --slippage on a V4 deposit, where the\n" +
    "bound is a ceiling.\n\n" +
    "--liquidity MEANS DIFFERENT THINGS: on V2 it is LP tokens in whole units; on V3 and V4 it is\n" +
    "the position's internal liquidity, which is not a token amount — it is the Liquidity figure an\n" +
    "add-liquidity receipt reports.\n\n" +
    "--dry-run validates everything — the position, the balance, the amounts — without a\n" +
    "password, and works for a watch-only account.",
  baseFields: fields,
  baseRefine: refuseFlagsOutsideScenario,
  examples: [
    {
      cmd: "wallet-cli sunswap remove-liquidity --protocol V2 --token0 USDT --token1 WTRX --liquidity 0.5 --dry-run",
    },
    {
      cmd: "wallet-cli sunswap remove-liquidity --protocol V3 --position-id 686 --liquidity 1000 --wait",
    },
    {
      cmd: "wallet-cli sunswap remove-liquidity --protocol V4 --position-id 12 --token0 TRX --token1 USDT --liquidity 1000 --dry-run",
    },
  ],
  formatText: TextFormatters.sunswapRemoveLiquidity,
};

export const sunswapRemoveLiquidityTronBinding = (
  service: SunSwapRemoveLiquidityService,
): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.removeLiquidity(ctx, net, {
      protocol: String(input.protocol).toUpperCase(),
      liquidity: input.liquidity,
      ...(input.token0 === undefined ? {} : { token0: input.token0 }),
      ...(input.token1 === undefined ? {} : { token1: input.token1 }),
      ...(input.positionId === undefined ? {} : { positionId: input.positionId }),
      ...(input.min0 === undefined ? {} : { min0: input.min0 }),
      ...(input.min1 === undefined ? {} : { min1: input.min1 }),
      ...(input.recipient === undefined ? {} : { recipient: input.recipient }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
      // V4's own. Forwarded explicitly like the rest rather than by spreading `input`, so a flag
      // that is declared but never passed on is a visible omission instead of a silent one.
      ...(input.fee === undefined ? {} : { fee: input.fee }),
      ...(input.slippage === undefined ? {} : { slippage: input.slippage }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: input.feeLimit }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
    }),
});
