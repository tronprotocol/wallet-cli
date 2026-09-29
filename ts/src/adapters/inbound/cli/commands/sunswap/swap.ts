import { z, type RefinementCtx } from "zod";
import { allRefines, Schemas, slippageField } from "../../schemas/index.js";
import type { ChainSpec, FamilyBinding } from "../../contracts/command.js";
import type { SunSwapSwapService } from "../../../../../application/use-cases/tron/sunswap/swap-service.js";
import { UsageError } from "../../../../../domain/errors/index.js";
import { TextFormatters } from "../../render/index.js";

const fields = z.object({
  tokenIn: z.string().describe("token to spend, symbol or contract address"),
  tokenOut: z.string().describe("token to receive, symbol or contract address"),
  amountIn: z.string().describe("amount of tokenIn to spend, in whole tokens"),
  quote: z
    .boolean()
    .default(false)
    .describe("price only — no account, no password, no transaction"),
  all: z
    .boolean()
    .default(false)
    .describe("list every candidate route instead of the best one; only with --quote"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate and estimate only — no password, no signature, no broadcast"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe("emit the unsigned transaction(s) without signing them"),
  slippage: z
    .string()
    .optional()
    .describe("tolerance as a decimal, e.g. 0.005 for 0.5% [default 0.005]"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe(
      "maximum energy fee to burn, in SUN; the dry run's estimate is a lower bound, so a limit set from it can fail",
    ),
});

/**
 * `--quote` sends no transaction, so it excludes everything that describes one — including
 * `--slippage`, since a tolerance only means something when a floor will be enforced. `--all`
 * lists candidate routes, which only a quote has.
 */
function refuseFlagsOutsideMode(value: Record<string, unknown>, ctx: RefinementCtx): void {
  const sending = ["dryRun", "buildOnly"] as const;
  if (value.quote === true) {
    for (const flag of sending) {
      if (value[flag] === true) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: "cannot be given with --quote, which sends no transaction",
          params: { errorCode: "invalid_option" },
        });
      }
    }
    if (value.slippage !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["slippage"],
        message:
          "cannot be given with --quote: a quote enforces no floor, so a tolerance would have nothing to apply to",
        params: { errorCode: "invalid_option" },
      });
    }
    return;
  }
  if (value.all === true) {
    ctx.addIssue({
      code: "custom",
      path: ["all"],
      message: "is only accepted with --quote; an execution takes one route, not a list",
      params: { errorCode: "invalid_option" },
    });
  }
}

export const sunswapSwapSpec: ChainSpec = {
  path: ["sunswap", "swap"],
  network: "optional",
  // `none` because `--quote` must work with no account at all (PM 2.11); the use case resolves
  // the account itself on the paths that sign. An account is needed for every other mode.
  wallet: "none",
  auth: "conditional",
  broadcasts: true,
  // Its own key, not sunpump's: this command needs a launchpad address OR a route service, and
  // `swap` must not be switched on merely because SunPump is configured — nor hidden on a network
  // that has a router but no curve.
  capability: "sunswap.swap",
  summary: "Swap tokens through SunSwap or a SunPump curve",
  description:
    "Exchange one token for another.\n\n" +
    "THE MARKET IS CHOSEN FIRST, from on-chain state, and identically in every mode. If exactly\n" +
    "one side is TRX and the other is a SunPump token that has not launched yet, the trade goes\n" +
    "through that token's bonding curve; everything else goes through the SunSwap router. The\n" +
    "receipt says which market answered, because it changes what the numbers mean — on a curve\n" +
    "the trading fee is SunPump's platform fee, there is one hop, and there is no price impact.\n\n" +
    "If the curve's state cannot be read, the command STOPS rather than routing to the other\n" +
    "market: a quote from one market and a fill on the other is the way this command loses money.\n\n" +
    "A ROUTER SWAP THAT SPENDS A TOKEN MAKES TWO GRANTS, and neither is unlimited: a TRC20\n" +
    "approval to Permit2 for exactly this trade, and a Permit2 grant to the router for exactly\n" +
    "this trade, expiring in one hour. The grant is signed as typed data, which costs nothing,\n" +
    "and it is checked against the swap before it is signed and its signer checked after. So a\n" +
    "token swap is two transactions and one signature; a swap spending TRX is one transaction and\n" +
    "no grant at all, because the TRX travels as the call's own value.\n\n" +
    "--build-only is refused for a token swap: the transaction embeds that signature and cannot\n" +
    "be built before it exists. --dry-run prices the approval and shows the grant it would ask\n" +
    "for.\n\n" +
    "Default slippage is 0.5% — note that `sunpump buy` and `sell` reach the same curve with a 5%\n" +
    "default, because a command named after a meme-token market budgets for its volatility.\n\n" +
    "An account is needed for every mode except --quote, which reads only.",
  baseFields: fields,
  baseRefine: allRefines(refuseFlagsOutsideMode, slippageField()),
  positionals: [{ field: "tokenIn" }, { field: "tokenOut" }, { field: "amountIn" }],
  examples: [
    { cmd: "wallet-cli sunswap swap TRX <token-address> 1 --quote --network tron" },
    { cmd: "wallet-cli sunswap swap TRX <token-address> 1 --dry-run --network tron" },
    {
      cmd: "wallet-cli sunswap swap <token-address> TRX 1000 --wait --network tron",
      note: "sells a real asset",
    },
  ],
  formatText: TextFormatters.sunswapSwap,
};

export const sunswapSwapTronBinding = (service: SunSwapSwapService): FamilyBinding => ({
  run: async (ctx, net, input) => {
    // `--wait` is global, so the schema's --quote refusals cannot see it. A quote submits nothing.
    if (input.quote === true && ctx.wait) {
      throw new UsageError(
        "invalid_option",
        "--wait cannot be used with --quote, which sends no transaction",
      );
    }
    return service.swap(ctx, net, {
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      ...(input.slippage === undefined ? {} : { slippage: input.slippage }),
      ...(input.quote === undefined ? {} : { quote: input.quote }),
      ...(input.all === undefined ? {} : { all: input.all }),
      ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
      ...(input.buildOnly === undefined ? {} : { buildOnly: input.buildOnly }),
      ...(input.feeLimit === undefined ? {} : { feeLimit: input.feeLimit }),
    });
  },
});
