/**
 * Liquidity rules that need no I/O: slippage floors, deadlines, and which amounts were given.
 *
 * All amounts here are base-unit integers carried as decimal strings and computed with `bigint`.
 * A deposit is money; a float would round it, and the rounding would be in the pool's favour or
 * the user's at random.
 */
import { UsageError } from "../errors/index.js";

/**
 * The share of a computed amount a V2 deposit will accept by default.
 *
 * A V2 deposit must match the pool's current ratio, which moves between the moment the amounts
 * are computed and the moment the transaction lands. Without a floor the deposit reverts on any
 * movement at all; 95% is the documented default and can be overridden.
 */
export const DEFAULT_V2_MIN_BASIS_POINTS = 9500n;

/** Minutes a transaction stays valid when the caller does not say. */
export const DEFAULT_DEADLINE_MINUTES = 30;

/**
 * `9500` of `10000` — kept as basis points so the arithmetic stays integral.
 *
 * RESTATED, NOT MISSED. The vendor has `applyV2SlippageMin` / `applySlippageMin` and they compute the
 * same thing. This is duplicated because `domain/` may not import the vendor SDK: the rule is that the
 * load-bearing maths lives in the adapter where the vendor is allowed, and what domain restates is
 * policy. Do not "tidy this up" by importing the SDK here — that breaks the boundary the note exists
 * to protect.
 */
export function applyMinimumShare(amount: string, basisPoints: bigint): string {
  return ((toBigInt(amount, "amount") * basisPoints) / 10000n).toString();
}

/**
 * Seconds-since-epoch the transaction stops being valid.
 *
 * A deadline already in the past is refused rather than sent: the contract would reject it, and
 * the fee would be spent finding that out.
 */
export function resolveDeadline(explicitEpochSeconds: number | undefined, now: number): number {
  if (explicitEpochSeconds === undefined) {
    return Math.floor(now / 1000) + DEFAULT_DEADLINE_MINUTES * 60;
  }
  if (!Number.isInteger(explicitEpochSeconds)) {
    throw new UsageError("invalid_value", "--deadline must be a whole number of seconds");
  }
  if (explicitEpochSeconds * 1000 <= now) {
    throw new UsageError("invalid_value", "--deadline is already in the past");
  }
  return explicitEpochSeconds;
}

/**
 * Which side of the pair the caller sized.
 *
 * Exactly one side is the normal case: the other is derived from the pool's ratio. Both is
 * allowed and means "these exact amounts". Neither cannot be answered — there is nothing to
 * derive a deposit from — so it is a usage error rather than a guess.
 */
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
    "this command requires --amount0 or --amount1; give one and the other is derived from the pool, or give both for exact amounts",
  );
}

/**
 * Pair the given side against the pool's reserves: `other = given * otherReserve / givenReserve`.
 *
 * Integer division truncates, which deposits marginally less of the derived side than the exact
 * ratio would. That is the safe direction: it can only ever leave dust unspent, never overdraw.
 *
 * RESTATED, NOT MISSED. The vendor's `quoteV2LiquidityAmount` is the same formula. It is duplicated
 * because `domain/` may not import the vendor SDK — see `applyMinimumShare`.
 * Importing the SDK here to remove the duplication is the outcome this note exists to prevent.
 */
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

/**
 * The LP tokens a V2 deposit mints, by the pair contract's own arithmetic.
 *
 * `UniswapV2Pair.mint` credits `min(amount0 * supply / reserve0, amount1 * supply / reserve1)` —
 * the MINIMUM, because whichever side is proportionally smaller is the one that actually gets
 * paired; the excess of the other side is what `amountMin` guards against losing.
 *
 * Only for a pool that already holds liquidity. The first deposit into an empty pool mints
 * `sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY`, which is a different rule and a different
 * scenario — one this command refuses for want of a ratio — so it is deliberately not answered
 * here rather than answered wrongly.
 */
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
