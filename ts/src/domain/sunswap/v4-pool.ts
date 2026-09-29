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
import { TronAddress, tronAddressBytes } from "../address/index.js";
import { NATIVE_TRX_ADDRESS } from "./tokens.js";

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
 * The five parts a V4 pool is made of.
 *
 * Not four, and the fifth is the one this command used to be missing. A V4 pool key is
 * `(currency0, currency1, fee, tickSpacing, hooks)` and the pool id is its hash, so every part
 * selects the market the money lands in.
 *
 * **THE TICK SPACING IS NOT IMPLIED BY THE FEE TIER.** V3 has a fixed table — 100/1, 500/10,
 * 3000/60, 10000/200 — and carrying it over to V4 is wrong. Measured on Nile on 2026-09-29: the
 * USDC/USDT pool at fee 500 has spacing 12 while the TRX/USDT pool at the same fee 500 has spacing
 * 10, and a third pool sits at fee 1000, a tier V3 does not have. Defaulting a spacing from a tier
 * would compute a different pool key — and when that other pool exists, the deposit lands in a
 * market the caller never named, silently. So the spacing is asked for.
 */
export interface V4PoolKey {
  readonly token0: string;
  readonly token1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: string;
}

/**
 * How the caller named the pool they want.
 *
 * Both kinds carry THE SAME key, built by the same function: a deposit into a pool that exists and a
 * deposit that creates one differ only in whether a starting price comes with it. They used to be
 * named two different ways — an opaque 32-byte id for one, the parts for the other — which meant a
 * caller could not name an existing V4 pool without first finding its id somewhere this CLI did not
 * publish.
 */
export type V4PoolTarget =
  | ({ readonly kind: "existing" } & V4PoolKey)
  | ({ readonly kind: "create"; readonly sqrtPriceX96: string } & V4PoolKey);

export interface V4PoolTargetInput {
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
  if (input.createPool !== true) {
    if (input.sqrtPrice !== undefined) {
      throw new UsageError(
        "invalid_option",
        "--sqrt-price is the starting price of a NEW pool and is only accepted with --create-pool; an existing pool already has a price",
      );
    }
    return { kind: "existing", ...requireV4PoolKey(input) };
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
  return { kind: "create", ...requireV4PoolKey(input), sqrtPriceX96: input.sqrtPrice.trim() };
}

/**
 * The pool key, from the flags that describe it — ONE builder for both scenarios.
 *
 * Deliberately not two functions that agree: an existing pool and a new one are named by exactly the
 * same five parts, and the only way to guarantee that "the pool I created" and "the pool I deposit
 * into" hash to the same id is for one piece of code to assemble both.
 */
export function requireV4PoolKey(input: V4PoolTargetInput): V4PoolKey {
  for (const [flag, value] of [
    ["--token0", input.token0],
    ["--token1", input.token1],
  ] as const) {
    if (value === undefined) {
      throw new UsageError(
        "missing_option",
        `${flag} is required on V4: a pool is named by its parts — both currencies, the fee tier, the tick spacing and the hook`,
      );
    }
  }
  if (input.fee === undefined) {
    throw new UsageError(
      "missing_option",
      "--fee is required on V4: the fee tier is part of the pool's identity, so the pair alone does not name a pool",
    );
  }
  if (input.tickSpacing === undefined) {
    throw new UsageError(
      "missing_option",
      "--tick-spacing is required on V4 and has no default: two V4 pools at the SAME fee tier can have different tick spacings — measured, USDC/USDT at fee 500 has spacing 12 while TRX/USDT at fee 500 has spacing 10 — so it cannot be derived from --fee. 'sunswap pool-list --protocol V4' publishes each pool's tickSpacing and hooks",
    );
  }
  // Last of the presence checks, and deliberately: a caller missing a flag should hear about the
  // flag, not about an ordering they have not finished describing yet.
  assertSortedPairWhenResolved(input.token0!, input.token1!);
  return {
    token0: input.token0!.trim(),
    token1: input.token1!.trim(),
    fee: input.fee,
    tickSpacing: input.tickSpacing,
    hooks: (input.hooks ?? V4_NO_HOOKS).trim(),
  };
}

/**
 * The pair's order, checked only once both sides are addresses.
 *
 * `--token0 TRX` is a SYMBOL, and a symbol has no 20-byte value to order by. This function is
 * reached twice: once from the command schema, where the flags are still whatever the caller typed,
 * and once from the use case, after the token resolver has turned each side into an address. Running
 * the byte comparison on a symbol threw "Invalid checksum" out of the address decoder — a refusal
 * that named neither the flag at fault nor anything the caller could act on — so the schema pass
 * skips it and the use-case pass, which always has addresses, performs it.
 *
 * A side that is neither a symbol nor an address is not silently accepted here: the token resolver
 * refuses it a moment later, by the name of the flag it came from.
 */
function assertSortedPairWhenResolved(token0: string, token1: string): void {
  const codec = new TronAddress();
  if (!codec.validate(token0.trim()) || !codec.validate(token1.trim())) return;
  assertSortedPair(token0, token1);
}
