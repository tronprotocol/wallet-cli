/**
 * How a V4 pool is named, and the two things about it that read as something else.
 *
 * V4 is the third protocol in this group and it answers the same questions differently from the two
 * before it. Both differences below are measured against the live mainnet TRX/USDT V4 pool, taken
 * from a router quote's own `poolKey`:
 *
 *   { currency0: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
 *     currency1: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
 *     hooks:     "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
 *     fee: 500, parameters: "0x…0a0000" }   // tickSpacing 10, no hook registrations
 *
 * 1. **TRX STAYS NATIVE.** `currency0` is the native marker, not WTRX. V2 and V3 both wrap, so the
 *    natural guess from V3 is wrong, and getting it wrong produces a pool key for a pool that
 *    exists — the WTRX one — and deposits into the wrong side of the market.
 *
 * 2. **"NO HOOKS" IS SPELLED WITH THAT SAME ADDRESS.** It is the base58 of the zero address, which
 *    on TRON happens to be the address the market API uses for TRX. So a pool key whose `hooks`
 *    reads `T9yD14…` has NO hook; it is not a pool hooked to TRX. Anything that shows a hook to a
 *    person has to say "none" rather than print that address, or it teaches the reader a falsehood.
 *
 * A pool is also identified differently: V2 by its pair contract, V3 by a position id, V4 by a
 * **32-byte pool id** derived from the whole key. Two pools can share a token pair and a fee tier
 * and differ only in tick spacing or hooks, so the pair is not an identity here.
 */
import { ChainError, UsageError } from "../errors/index.js";
import { tronAddressBytes } from "../address/index.js";
import { NATIVE_TRX_ADDRESS } from "./tokens.js";
import { isPoolId, normalisePoolId } from "./protocol.js";

/**
 * The zero address, in the base58 form everything on TRON uses.
 *
 * Deliberately a separate constant from `NATIVE_TRX_ADDRESS` even though the two are the same
 * string. They mean unrelated things — one is "the chain's own coin", the other is "nothing here" —
 * and a reader following either name should arrive at the right explanation rather than at the
 * other concept.
 *
 * RESTATED, NOT MISSED. The vendor exports the same constant as `TRON_ZERO_ADDRESS`. It is duplicated
 * because `domain/` may not import the vendor SDK (decision log D13), and importing it here to remove
 * the duplication is the outcome this note exists to prevent.
 */
export const V4_NO_HOOKS = NATIVE_TRX_ADDRESS;

/** Whether a pool's `hooks` names a real contract, as opposed to the zero address. */
export function hasHooks(hooks: string): boolean {
  return hooks.trim() !== V4_NO_HOOKS;
}

/** A pool's hook as a receipt should say it: an address, or the word for its absence. */
export function describeHooks(hooks: string): string {
  return hasHooks(hooks) ? hooks.trim() : "none";
}

/**
 * A pool key's pair, confirmed to be in the order V4 requires.
 *
 * `currency0` must be the numerically smaller of the two 20-byte addresses. Getting it wrong has two
 * consequences and the second is the dangerous one:
 *
 * 1. The key hashes to a different pool id. Either a second pool nobody routes to, or — if the
 *    sorted pool already exists — a revert, which at least is loud.
 * 2. **`--sqrt-price` is the price of the second currency measured in the first.** Reversed, the
 *    caller's starting price is INVERTED. The pool still initialises, still reports a price, and the
 *    first deposit lands entirely on one side. A wrong answer that looks right, with the caller's
 *    money in it.
 *
 * So an unsorted pair is REFUSED rather than sorted. Sorting silently would leave the caller's
 * starting price attached to a pair they did not write, which is the inversion above with the
 * evidence removed; refusing puts the decision back where the price was decided.
 *
 * The comparison is on the decoded 20-byte VALUE, which is what the pool key requires. Base58 string
 * order does in fact agree with it — every TRON address is 0x41 plus twenty bytes, so every base58
 * form is exactly 34 characters, and base58's alphabet is in ASCII order, which makes an equal-length
 * string comparison a comparison of the underlying integer. Measured over twenty thousand random
 * pairs: no disagreement. That is a reason a sort-by-string test would pass, not a licence to sort by
 * string — the equivalence rests on a length invariant and an alphabet ordering that nothing here
 * enforces, and a reader should not have to reconstruct the argument to believe the code.
 */
export function assertSortedPair(token0: string, token1: string): void {
  const first = addressValue(token0);
  const second = addressValue(token1);

  // TRX is the zero address, so it sorts before everything. "--token1 is TRX" is not a pair written
  // backwards — it is a pair that cannot exist, and it gets its own message rather than being told
  // to swap two tokens when one of them can only ever be first.
  if (second === 0n) {
    throw new UsageError(
      "invalid_value",
      "--token1 cannot be native TRX: TRX is the zero address, so it sorts before every token and is always currency0. Pass it as --token0",
    );
  }
  if (first === second) {
    // A ChainError, because `same_token` is registered at exit 1 and is already thrown that way by
    // `sunswap swap` and the exchange commands. Raising it as a usage error here would give one code
    // two exit classes depending on which command produced it.
    throw new ChainError("same_token", "a pool's two currencies are the same token");
  }
  if (first > second) {
    throw new UsageError(
      "invalid_value",
      `--token0 and --token1 are the wrong way round: a V4 pool key requires the numerically smaller address first, so pass --token0 ${token1.trim()} --token1 ${token0.trim()}. This is not cosmetic — --sqrt-price is the price of the second currency measured in the first, so a reversed pair would create the pool at the reciprocal of the price you meant`,
    );
  }
}

/** An address as the number the pool key orders by: its twenty bytes, without the 0x41 prefix. */
function addressValue(address: string): bigint {
  const bytes = tronAddressBytes(address.trim());
  return BigInt(
    `0x${Array.from(bytes.slice(1))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`,
  );
}

/**
 * How the caller named the pool they want.
 *
 * Exactly one of the two, and they are not interchangeable: an id addresses a pool that exists, and
 * a creation describes one that does not yet. Accepting both together would leave it unclear which
 * one decides the tick spacing the ticks are then aligned to.
 */
export type V4PoolTarget =
  | { readonly kind: "existing"; readonly poolId: string }
  | {
      readonly kind: "create";
      readonly token0: string;
      readonly token1: string;
      readonly fee: number;
      readonly tickSpacing: number;
      readonly sqrtPriceX96: string;
      readonly hooks: string;
    };

export interface V4PoolTargetInput {
  readonly pool?: string;
  readonly createPool?: boolean;
  readonly sqrtPrice?: string;
  readonly token0?: string;
  readonly token1?: string;
  readonly fee?: number;
  readonly tickSpacing?: number;
  readonly hooks?: string;
}

/**
 * The pool a V4 command is about, or a refusal naming what is missing.
 *
 * `--create-pool` and `--sqrt-price` travel together because neither is usable alone: a creation
 * with no starting price has no price, and a starting price with nothing to create is a number that
 * would be silently discarded. A caller who gave one and not the other has a specific mistake, and
 * the message names it rather than listing the whole flag set.
 */
export function resolveV4Pool(input: V4PoolTargetInput): V4PoolTarget {
  const creating = input.createPool === true;

  if (creating && input.pool !== undefined) {
    throw new UsageError(
      "invalid_option",
      "--pool names a pool that already exists and --create-pool makes a new one; pass one of them",
    );
  }

  if (!creating) {
    if (input.sqrtPrice !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--sqrt-price is the starting price of a NEW pool and is only accepted with --create-pool; an existing pool already has a price",
      );
    }
    const pool = input.pool;
    if (pool === undefined) {
      throw new UsageError(
        "missing_option",
        "--pool is required on V4: a pool is identified by its 32-byte pool id, because two pools can share a token pair and a fee tier and differ in tick spacing or hooks",
      );
    }
    if (!isPoolId(pool)) {
      // Said explicitly, because the natural thing to pass is a pair address — which is what V2
      // takes — and a base58 address here is a category error rather than a typo.
      throw new UsageError(
        "invalid_value",
        `--pool must be a 32-byte pool id, 64 hex characters with or without 0x; ${pool} looks like an address, and a V4 pool has none`,
      );
    }
    return { kind: "existing", poolId: normalisePoolId(pool) };
  }

  if (input.sqrtPrice === undefined) {
    throw new UsageError(
      "missing_option",
      "--sqrt-price is required with --create-pool: a new pool has no price until one is set, and the first deposit's range is meaningless without it",
    );
  }
  if (!/^\d+$/.test(input.sqrtPrice.trim()) || BigInt(input.sqrtPrice.trim()) === 0n) {
    throw new UsageError(
      "invalid_value",
      "--sqrt-price must be a positive whole number: it is the price in Q64.96 fixed point, not a decimal ratio",
    );
  }
  for (const [flag, value] of [
    ["--token0", input.token0],
    ["--token1", input.token1],
  ] as const) {
    if (value === undefined) {
      throw new UsageError(
        "missing_option",
        `${flag} is required with --create-pool: there is no pool id to read the pair from yet`,
      );
    }
  }
  if (input.fee === undefined || input.tickSpacing === undefined) {
    throw new UsageError(
      "missing_option",
      "--fee and --tick-spacing are required with --create-pool: they are part of the pool's identity on V4, not settings applied to it afterwards",
    );
  }
  // Last, and deliberately: a caller missing a flag should hear about the flag, not about an
  // ordering they have not finished describing yet.
  assertSortedPair(input.token0!, input.token1!);
  return {
    kind: "create",
    token0: input.token0!,
    token1: input.token1!,
    fee: input.fee,
    tickSpacing: input.tickSpacing,
    sqrtPriceX96: input.sqrtPrice.trim(),
    hooks: input.hooks ?? V4_NO_HOOKS,
  };
}
