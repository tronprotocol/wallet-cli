import { errorMessage, inputRef, UsageError, type InputRef } from "../errors/index.js";

export const LAUNCHPAD_STATE = {
  NOT_EXIST: 0,
  TRADING: 1,
  READY_TO_LAUNCH: 2,
  LAUNCHED: 3,
} as const;

export type LaunchpadState = (typeof LAUNCHPAD_STATE)[keyof typeof LAUNCHPAD_STATE];

// Decimal fraction for SunPump curve commands (5%).
export const DEFAULT_CURVE_SLIPPAGE = "0.05";

// Decimal fraction for sunswap swap on either market (0.5%).
export const DEFAULT_SWAP_SLIPPAGE = "0.005";

const MIN_SLIPPAGE_BIPS = 1;
const MAX_SLIPPAGE_BIPS = 5000;

// Converts a decimal fraction to basis points without floating-point rounding.
export function slippageToBips(value: string, input: InputRef = inputRef("slippage")): number {
  const trimmed = value.trim();
  if (!/^\d*\.?\d+$/.test(trimmed)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${input} must be a decimal fraction, e.g. 0.05 for 5%`,
    );
  }
  const [whole, fraction = ""] = trimmed.split(".");
  // Slippage input uses whole basis points; reject finer precision instead of rounding.
  if (fraction.length > 4) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${input} is finer than one basis point (0.0001), which the contract cannot express`,
    );
  }
  const bips = Number(`${whole || "0"}${fraction.padEnd(4, "0")}`);
  if (bips < MIN_SLIPPAGE_BIPS || bips > MAX_SLIPPAGE_BIPS) {
    throw new UsageError("invalid_value", errorMessage`${input} must be between 0.0001 and 0.5`);
  }
  return bips;
}

// Returns slippage as a decimal fraction.
export function bipsToSlippage(bips: number): string {
  const text = String(bips).padStart(5, "0");
  return `${text.slice(0, 1)}.${text.slice(1)}`.replace(/0+$/, "").replace(/\.$/, ".0");
}

export function selectFloor(
  slippage: string | undefined,
  minOut: string | undefined,
  fallback: string = DEFAULT_CURVE_SLIPPAGE,
): { kind: "slippage"; bips: number } | { kind: "min-out"; amount: string } {
  if (slippage !== undefined && minOut !== undefined) {
    throw new UsageError(
      "invalid_option",
      errorMessage`choose at most one of ${inputRef("slippage")} and ${inputRef("minOut")}`,
    );
  }
  if (minOut !== undefined) {
    if (!/^\d+$/.test(minOut.trim())) {
      throw new UsageError(
        "invalid_amount",
        errorMessage`${inputRef("minOut")} must be a whole number in the token's smallest unit`,
      );
    }
    return { kind: "min-out", amount: minOut.trim() };
  }
  return { kind: "slippage", bips: slippageToBips(slippage ?? fallback) };
}

// SunPump's platform fee floor in SUN (0.01 TRX); the fee is otherwise 1% of the TRX.
export const MIN_PLATFORM_FEE_SUN = "10000";

// Returns the fee percentage only when it exceeds 1%.
export function feeRatePercent(feeSun: string, trxSun: string): string | undefined {
  const fee = BigInt(feeSun);
  const total = BigInt(trxSun);
  if (total === 0n || fee * 100n <= total) return undefined;
  // Truncate to hundredths of a percent using exact amounts.
  const hundredths = (fee * 10000n) / total;
  const text = hundredths.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`.replace(/\.?0+$/, "");
}
