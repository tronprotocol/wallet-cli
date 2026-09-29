/**
 * The bonding-curve rules that need no I/O: slippage, floors, and what a token's state permits.
 *
 * A SunPump token is priced by a curve until it launches: buying pushes the price up, selling
 * pushes it down, and the contract holds both reserves. Once enough has been sold the token
 * launches into an ordinary SunSwap pool and the curve closes — so whether a trade is possible at
 * all is a question about state, asked before anything is quoted.
 */
import { UsageError } from "../errors/index.js";

/**
 * The curve contract's own four states.
 *
 * Upstream's enum has three — it omits READY_TO_LAUNCH and therefore reports a LAUNCHED token's
 * `3` as something else — which would let a launched token through to a transaction that must
 * revert. Ours matches the contract, and the adapter takes the values from the SDK rather than
 * from a transcription.
 */
export const LAUNCHPAD_STATE = {
  NOT_EXIST: 0,
  TRADING: 1,
  READY_TO_LAUNCH: 2,
  LAUNCHED: 3,
} as const;

export type LaunchpadState = (typeof LAUNCHPAD_STATE)[keyof typeof LAUNCHPAD_STATE];

/**
 * The tolerance a curve trade accepts when the caller names none (PM 10.1.3).
 *
 * Ten times `swap`'s default, deliberately: a curve's price moves with the volume of the trade
 * itself, so a meme token's own commands budget for it. `sunswap swap` reaching the SAME curve
 * keeps ITS default of 0.5% (PM 5.1.2) — same market, different command, and inheriting the wrong
 * one is the easy mistake.
 */
export const DEFAULT_CURVE_SLIPPAGE = "0.05";

/** What `sunswap swap` accepts when the caller names none (PM 5.1.3), on either market. */
export const DEFAULT_SWAP_SLIPPAGE = "0.005";

/** The bounds `--slippage` accepts, as basis points: 0.01% to 50%. */
const MIN_SLIPPAGE_BIPS = 1;
const MAX_SLIPPAGE_BIPS = 5000;

/**
 * A decimal slippage as basis points, by integer arithmetic.
 *
 * `Number(value) * 10000` is wrong here and quietly so: `0.0003 * 10000` is
 * 2.9999999999999996 in binary floating point, which floors to 2 — a caller asking for 0.03%
 * would get 0.02% and never be told. The digits are shifted as text instead, so the conversion is
 * exact for every value the flag accepts.
 *
 * Basis points are the unit because that is what the floor is applied in; anything finer than
 * 0.01% is refused rather than rounded to zero.
 */
export function slippageToBips(value: string, flag = "--slippage"): number {
  const trimmed = value.trim();
  if (!/^\d*\.?\d+$/.test(trimmed)) {
    throw new UsageError("invalid_value", `${flag} must be a decimal fraction, e.g. 0.05 for 5%`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  // Four digits of fraction is one basis point; a fifth would be a tolerance we cannot express.
  if (fraction.length > 4) {
    throw new UsageError(
      "invalid_value",
      `${flag} is finer than one basis point (0.0001), which the contract cannot express`,
    );
  }
  const bips = Number(`${whole || "0"}${fraction.padEnd(4, "0")}`);
  if (bips < MIN_SLIPPAGE_BIPS || bips > MAX_SLIPPAGE_BIPS) {
    throw new UsageError("invalid_value", `${flag} must be between 0.0001 and 0.5`);
  }
  return bips;
}

/** Basis points back to the decimal string a receipt echoes, so it reads as the caller typed it. */
export function bipsToSlippage(bips: number): string {
  const text = String(bips).padStart(5, "0");
  return `${text.slice(0, 1)}.${text.slice(1)}`.replace(/0+$/, "").replace(/\.$/, ".0");
}

/**
 * Which of the two exclusive floor flags was given.
 *
 * Both together is refused rather than one silently winning: they are two different ways of
 * saying the same thing, and a caller who gave both does not know which they are getting.
 */
export function selectFloor(
  slippage: string | undefined,
  minOut: string | undefined,
  fallback: string = DEFAULT_CURVE_SLIPPAGE,
): { kind: "slippage"; bips: number } | { kind: "min-out"; amount: string } {
  if (slippage !== undefined && minOut !== undefined) {
    throw new UsageError("invalid_option", "choose at most one of --slippage and --min-out");
  }
  if (minOut !== undefined) {
    if (!/^\d+$/.test(minOut.trim())) {
      throw new UsageError(
        "invalid_amount",
        "--min-out must be a whole number in the token's smallest unit",
      );
    }
    return { kind: "min-out", amount: minOut.trim() };
  }
  return { kind: "slippage", bips: slippageToBips(slippage ?? fallback) };
}

/**
 * Whether the platform fee exceeded one percent of the trade, and by how much.
 *
 * SunPump charges 1% with a 0.01 TRX floor, so a small trade pays a rate far above 1% — a
 * 0.1 TRX buy pays 10%. The rate is reported rather than the discrepancy, because the rate is
 * the thing a caller would otherwise not notice (PM 10.1.3).
 */
export function feeRatePercent(feeSun: string, trxSun: string): string | undefined {
  const fee = BigInt(feeSun);
  const total = BigInt(trxSun);
  if (total === 0n || fee * 100n <= total) return undefined;
  // Two decimal places, by integer arithmetic: the rate is a ratio of two exact amounts.
  const hundredths = (fee * 10000n) / total;
  const text = hundredths.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`.replace(/\.?0+$/, "");
}
