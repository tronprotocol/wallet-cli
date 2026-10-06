import { z, type RefinementCtx } from "zod";
import { Schemas } from "../../schemas/index.js";

/**
 * The flags a curve trade shares in both directions.
 *
 * `--quote` is not a mode of the transaction pipeline: it answers from contract reads alone, with
 * no account and no password, so it excludes every flag that implies a transaction (PM 2.11).
 */
export const curveTradeFields = {
  quote: z
    .boolean()
    .default(false)
    .describe("price only — no account, no password, no transaction"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("validate and estimate only — no password, no signature, no broadcast"),
  buildOnly: z
    .boolean()
    .default(false)
    .describe("emit the unsigned transaction(s) in execution order without signing them"),
  slippage: z
    .string()
    .optional()
    .describe("tolerance as a decimal, e.g. 0.05 for 5%; excludes --min-out [default 0.05]"),
  minOut: z
    .string()
    .optional()
    .describe("least to accept, in the smallest unit; excludes --slippage"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe(
      "maximum energy fee to burn, in SUN; the dry run's estimate is a lower bound, so a limit set from it can fail",
    ),
};

/** Flags that describe a transaction, and so cannot travel with `--quote`. */
const SENDING_FLAGS = ["dryRun", "buildOnly"] as const;

/** Flags that set a floor, which a quote never enforces; each named as its refusal reads. */
const FLOOR_FLAGS = [
  ["slippage", "a tolerance"],
  ["minOut", "a minimum"],
] as const;

/**
 * `--quote` against the flags that describe a transaction, and the two floors against each other.
 *
 * A quote that also carried `--dry-run` would be two answers to one question, and a floor given to
 * a quote would be accepted and then protect nothing: a caller would believe they had set one
 * (PM 2.11; the wording is `sunswap swap`'s). `--wait` and `--wait-timeout` are global flags the
 * schema cannot see, so the spec's `rejectsWaitWith` refuses those. The pair of floor flags are
 * two ways of saying the same thing, so a caller who gave both does not know which they are
 * getting. Nothing silently wins.
 */
export function refuseQuoteWithSendingFlags(
  value: Record<string, unknown>,
  ctx: RefinementCtx,
): void {
  if (value.quote === true) {
    for (const flag of SENDING_FLAGS) {
      if (value[flag] === true) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: "cannot be given with --quote, which sends no transaction",
          params: { errorCode: "invalid_option" },
        });
      }
    }
    for (const [flag, what] of FLOOR_FLAGS) {
      if (value[flag] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [flag],
          message: `cannot be given with --quote: a quote enforces no floor, so ${what} would have nothing to apply to`,
          params: { errorCode: "invalid_option" },
        });
      }
    }
    return;
  }
  if (value.slippage !== undefined && value.minOut !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["minOut"],
      message: "cannot be given with --slippage; they are two ways of setting the same floor",
      params: { errorCode: "invalid_option" },
    });
  }
}

/** The shared tail of both descriptions: the fee, the state gate, and what a quote costs. */
export const CURVE_TRADE_NOTES =
  "The platform fee is 1% of the TRX with a 0.01 TRX MINIMUM, taken out of the TRX on both\n" +
  "sides — so a small trade pays far more than 1%, and the dry run says what rate it worked\n" +
  "out to. It is reported separately from the chain's own fee; they are different costs.\n\n" +
  "Only a token still TRADING on the curve can be traded here. The state is read from the\n" +
  "contract, never from an API, because a stale answer sends a transaction that must revert. A\n" +
  "token that has launched is refused with a pointer to `sunswap swap`.\n\n" +
  "--quote prices the trade from contract reads alone: no account, no password, no transaction.\n" +
  "Default slippage is 5%, ten times the DEX default, because a curve's price moves with volume.";
