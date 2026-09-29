import { z, type RefinementCtx } from "zod";
import { Schemas } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapCollectFeesService } from "../../../../../application/use-cases/tron/sunswap/collect-fees-service.js";
import { TextFormatters } from "../../render/index.js";

/** Flags V4 adds, and which mean nothing on V3 (PM 6.3.3's matrix). */
const V4_ONLY = ["token0", "token1", "fee", "deadline"] as const;

/** Flags V4 does not have. A V4 collection settles to the signing account and nowhere else. */
const NOT_ON_V4 = ["recipient"] as const;

const fields = z.object({
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate and estimate only — no password, no signature, no broadcast"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe("emit the unsigned transaction without signing it"),
  protocol: z.string().describe("protocol version: V3 or V4"),
  positionId: z.string().describe("the position to collect from; must be held by this account"),
  recipient: z.string().optional().describe("who receives the fees; default the account (V3 only)"),
  token0: z
    .string()
    .optional()
    .describe(
      "the position's first token, checked against the pair the position holds; omit both to read them from it (V4 only)",
    ),
  token1: z
    .string()
    .optional()
    .describe("the position's second token; give it together with --token0 (V4 only)"),
  fee: z.coerce
    .number()
    .optional()
    .describe(
      "the pool's fee tier, checked against the one the position reports; it selects nothing, so giving it only asserts what the position already knows (V4 only)",
    ),
  deadline: z.coerce
    .number()
    .optional()
    .describe(
      "Unix seconds the transaction stops being valid; default 30 minutes from now (V4 only)",
    ),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe(
      "maximum energy fee to burn, in SUN; the dry run's estimate is a lower bound, so a limit set from it can fail",
    ),
});

/**
 * The flag × scenario matrix (PM 6.3.3), and why V2 is absent.
 *
 * V2 is `invalid_value`, not an unknown protocol: a V2 pool's fees are real; they are simply not
 * separable — they accrue into the LP token's own value and come out when the liquidity does.
 * Telling a caller "unknown protocol" would suggest they mistyped, when what they need to know is
 * that there is nothing to claim.
 *
 * Every refusal here depends on nothing remote, so it fires deterministically and without a
 * wallet. The checks that need the chain — the pair and the tier against what the position
 * reports — belong to the use case.
 */
function refuseFlagsOutsideScenario(value: Record<string, unknown>, ctx: RefinementCtx): void {
  const protocol = String(value.protocol).toUpperCase();
  if (protocol !== "V3" && protocol !== "V4") {
    ctx.addIssue({
      code: "custom",
      path: ["protocol"],
      message:
        protocol === "V2"
          ? "must be V3 or V4; a V2 pool's fees accrue into the LP token itself and are taken out with the liquidity, so there is nothing separate to claim"
          : "must be V3 or V4",
      params: { errorCode: "invalid_value" },
    });
    return;
  }
  if (protocol === "V3") {
    for (const flag of V4_ONLY) {
      if (value[flag] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message:
            "is a V4 flag; on V3 the position already names the pair and collect has no deadline",
          params: { errorCode: "invalid_option" },
        });
      }
    }
    return;
  }
  refuseV4Flags(value, ctx);
}

/**
 * V4's own matrix.
 *
 * The pair is OPTIONAL here, unlike on `remove-liquidity` — PM 6.3.3 makes it a cross-check a
 * caller may skip, because a collection cannot be sized wrong the way a withdrawal can. What it
 * cannot be is half-given: one side names no pair at all, and `--fee` on its own checks nothing.
 */
function refuseV4Flags(value: Record<string, unknown>, ctx: RefinementCtx): void {
  for (const flag of NOT_ON_V4) {
    if (value[flag] !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [flag],
        message:
          "is not accepted on V4; the fees always go to the signing account, and a flag that was accepted and ignored would say otherwise",
        params: { errorCode: "invalid_option" },
      });
    }
  }
  const pair = ["token0", "token1"] as const;
  const named = pair.filter((flag) => value[flag] !== undefined);
  if (named.length === 1) {
    const missing = pair.find((flag) => value[flag] === undefined)!;
    ctx.addIssue({
      code: "custom",
      path: [missing],
      message:
        "must be given together with the other side, or both left out and read from the position",
      params: { errorCode: "missing_option" },
    });
  }
  if (value.fee !== undefined && named.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["token0"],
      message:
        "is required when --fee is given; the tier is checked against the position alongside the pair, and on its own it checks nothing",
      params: { errorCode: "missing_option" },
    });
  }
}

export const sunswapCollectFeesSpec: ChainSpec = {
  path: ["sunswap", "collect-fees"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "sunswap.liquidity",
  summary: "Collect a position's earned fees",
  description:
    "Take the fees a V3 or V4 position has earned, leaving its principal where it is.\n\n" +
    "It collects EVERYTHING owed — there is no partial option, because the contract does not\n" +
    "offer one. Nothing is approved and no Permit2 is involved: the position manager already\n" +
    "holds the position on both protocols.\n\n" +
    "V3 and V4 only. A V2 pool's fees are not separable: they accrue into the LP token's own\n" +
    "value and come out when the liquidity does, so there is nothing to claim on its own.\n\n" +
    "V4 takes the pool key from the position's own pool and settles to the signing account, so\n" +
    "--recipient is not accepted. --token0/--token1 and --fee are optional cross-checks against\n" +
    "what the position reports; they select nothing, and a disagreement is refused.\n\n" +
    "The amounts on the receipt are read from the chain before the call. When that read cannot be\n" +
    "made the receipt reports NO amount and warns, rather than a zero — 'sunswap position-list'\n" +
    "reports the unclaimed value in that case (mainnet only).\n\n" +
    "On V3, 'sunswap remove-liquidity' already collects the fees alongside the principal, so this\n" +
    "command is for the case where the principal should stay in the pool.",
  baseFields: fields,
  baseRefine: refuseFlagsOutsideScenario,
  examples: [
    { cmd: "wallet-cli sunswap collect-fees --protocol V3 --position-id 686 --dry-run" },
    {
      cmd: "wallet-cli sunswap collect-fees --protocol V3 --position-id 686 --recipient TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC --wait",
    },
    { cmd: "wallet-cli sunswap collect-fees --protocol V4 --position-id 1 --wait" },
  ],
  formatText: TextFormatters.sunswapCollectFees,
};

export const sunswapCollectFeesTronBinding = (
  service: SunSwapCollectFeesService,
): FamilyBinding => ({
  run: async (ctx, net, input) =>
    service.collectFees(ctx, net, {
      protocol: String(input.protocol).toUpperCase(),
      positionId: input.positionId,
      ...(input.recipient === undefined ? {} : { recipient: input.recipient }),
      // V4's own. Forwarded explicitly like the rest rather than by spreading `input`, so a flag
      // that is declared but never passed on is a visible omission instead of a silent one.
      ...(input.token0 === undefined ? {} : { token0: input.token0 }),
      ...(input.token1 === undefined ? {} : { token1: input.token1 }),
      ...(input.fee === undefined ? {} : { fee: input.fee }),
      ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: input.feeLimit }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
    }),
});
