// Amounts are base-unit integers; bigint avoids rounding money through floats.
import { errorMessage, inputRef, UsageError } from "../errors/index.js";

export const DEFAULT_V2_MIN_BASIS_POINTS = 9500n;

export const DEFAULT_DEADLINE_MINUTES = 30;

const BASIS_POINTS = 10_000n;

export function applyMinimumShare(amount: string, basisPoints: bigint): string {
  return ((toBigInt(amount, "amount") * basisPoints) / BASIS_POINTS).toString();
}

// Lowers an expected amount by a slippage tolerance; rounds down.
export function lowerBySlippage(amount: string, slippageBips: number): string {
  return applyMinimumShare(amount, BASIS_POINTS - BigInt(slippageBips));
}

// Raises a deposit ceiling by a slippage tolerance; rounds down.
export function raiseBySlippage(amount: string, slippageBips: number): string {
  if (slippageBips === 0) return amount;
  return applyMinimumShare(amount, BASIS_POINTS + BigInt(slippageBips));
}

// A V2 pool's reserve paid out for burning lpAmount of totalSupply; rounds down.
export function lpRedemption(lpAmount: string, reserve: string, totalSupply: string): string {
  return (
    (toBigInt(lpAmount, "amount") * toBigInt(reserve, "reserve")) /
    toBigInt(totalSupply, "total supply")
  ).toString();
}

// Returns epoch seconds; now is in milliseconds.
export function resolveDeadline(explicitEpochSeconds: number | undefined, now: number): number {
  if (explicitEpochSeconds === undefined) {
    return Math.floor(now / 1000) + DEFAULT_DEADLINE_MINUTES * 60;
  }
  if (!Number.isInteger(explicitEpochSeconds)) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("deadline")} must be a whole number of seconds`,
    );
  }
  if (explicitEpochSeconds * 1000 <= now) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("deadline")} is already in the past`,
    );
  }
  return explicitEpochSeconds;
}

export type AmountSelection =
  | { kind: "amount0"; amount0: string }
  | { kind: "amount1"; amount1: string }
  | { kind: "both"; amount0: string; amount1: string };

export function selectAmounts(
  amount0: string | undefined,
  amount1: string | undefined,
): AmountSelection {
  if (amount0 !== undefined && amount1 !== undefined) {
    return { kind: "both", amount0, amount1 };
  }
  if (amount0 !== undefined) return { kind: "amount0", amount0 };
  if (amount1 !== undefined) return { kind: "amount1", amount1 };
  throw new UsageError(
    "missing_option",
    errorMessage`this command requires ${inputRef("amount0")} or ${inputRef("amount1")}; give one and the other is derived from the pool, or give both for exact amounts`,
  );
}

// Round the derived base-unit amount down to avoid overdrawing.
export function pairAmount(
  givenAmount: string,
  givenReserve: string,
  otherReserve: string,
): string {
  const given = toBigInt(givenAmount, "amount");
  const from = toBigInt(givenReserve, "reserve");
  const to = toBigInt(otherReserve, "reserve");
  if (from === 0n) {
    throw new UsageError(
      "invalid_value",
      "this pool holds none of that token, so the other amount cannot be derived; give both amounts",
    );
  }
  return ((given * to) / from).toString();
}

// V2 LP base units for existing liquidity; empty pools require a different mint formula.
export function expectedLpAmount(
  amount0: string,
  amount1: string,
  reserve0: string,
  reserve1: string,
  totalSupply: string,
): string | undefined {
  const supply = toBigInt(totalSupply, "total supply");
  const r0 = toBigInt(reserve0, "reserve");
  const r1 = toBigInt(reserve1, "reserve");
  if (supply === 0n || r0 === 0n || r1 === 0n) return undefined;
  const from0 = (toBigInt(amount0, "amount") * supply) / r0;
  const from1 = (toBigInt(amount1, "amount") * supply) / r1;
  return (from0 < from1 ? from0 : from1).toString();
}

function toBigInt(value: string, what: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new UsageError("invalid_value", `${what} must be a whole number of base units`);
  }
  return BigInt(value);
}
