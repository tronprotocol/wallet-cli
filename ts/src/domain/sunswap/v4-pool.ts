// V4 keeps TRX native; substituting WTRX selects a different pool.
import { ChainError, errorMessage, followUp, inputRef, UsageError } from "../errors/index.js";
import { TronAddress, tronAddressBytes } from "../address/index.js";
import { NATIVE_TRX_ADDRESS } from "./tokens.js";

// Base58 zero address: no hooks, despite sharing the native TRX marker.
export const V4_NO_HOOKS = NATIVE_TRX_ADDRESS;

export function hasHooks(hooks: string): boolean {
  return hooks.trim() !== V4_NO_HOOKS;
}

export function describeHooks(hooks: string): string {
  return hasHooks(hooks) ? hooks.trim() : "none";
}

// Compare decoded address values; silently sorting would invert the caller's starting price.
export function assertSortedPair(token0: string, token1: string): void {
  const first = addressValue(token0);
  const second = addressValue(token1);

  if (second === 0n) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("token1")} cannot be native TRX: TRX is the zero address, so it sorts before every token and is always currency0. Pass it as ${inputRef("token0")}`,
    );
  }
  if (first === second) {
    // same_token uses the execution-error exit class.
    throw new ChainError("same_token", "a pool's two currencies are the same token");
  }
  if (first > second) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("token0")} and ${inputRef("token1")} are the wrong way round: a V4 pool key requires the numerically smaller address first, so pass ${inputRef("token0")} ${token1.trim()} ${inputRef("token1")} ${token0.trim()}. This is not cosmetic — ${inputRef("sqrtPrice")} is the price of the second currency measured in the first, so a reversed pair would create the pool at the reciprocal of the price you meant`,
    );
  }
}

// Numeric 20-byte address without the TRON 0x41 prefix.
function addressValue(address: string): bigint {
  const bytes = tronAddressBytes(address.trim());
  return BigInt(
    `0x${Array.from(bytes.slice(1))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`,
  );
}

// V4 tick spacing is independent of fee; every key field selects the pool.
export interface V4PoolKey {
  readonly token0: string;
  readonly token1: string;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: string;
}

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

export function resolveV4Pool(input: V4PoolTargetInput): V4PoolTarget {
  if (input.createPool !== true) {
    if (input.sqrtPrice !== undefined) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("sqrtPrice")} is the starting price of a NEW pool and is only accepted with ${inputRef("createPool")}; an existing pool already has a price`,
      );
    }
    return { kind: "existing", ...requireV4PoolKey(input) };
  }

  if (input.sqrtPrice === undefined) {
    throw new UsageError(
      "missing_option",
      errorMessage`${inputRef("sqrtPrice")} is required with ${inputRef("createPool")}: a new pool has no price until one is set, and the first deposit's range is meaningless without it`,
    );
  }
  if (!/^\d+$/.test(input.sqrtPrice.trim()) || BigInt(input.sqrtPrice.trim()) === 0n) {
    throw new UsageError(
      "invalid_value",
      errorMessage`${inputRef("sqrtPrice")} must be a positive whole number: it is the price in Q64.96 fixed point, not a decimal ratio`,
    );
  }
  return { kind: "create", ...requireV4PoolKey(input), sqrtPriceX96: input.sqrtPrice.trim() };
}

export function requireV4PoolKey(input: V4PoolTargetInput): V4PoolKey {
  for (const [field, value] of [
    ["token0", input.token0],
    ["token1", input.token1],
  ] as const) {
    if (value === undefined) {
      throw new UsageError(
        "missing_option",
        errorMessage`${inputRef(field)} is required on V4: a pool is named by its parts — both currencies, the fee tier, the tick spacing and the hook`,
      );
    }
  }
  if (input.fee === undefined) {
    throw new UsageError(
      "missing_option",
      errorMessage`${inputRef("fee")} is required on V4: the fee tier is part of the pool's identity, so the pair alone does not name a pool`,
    );
  }
  if (input.tickSpacing === undefined) {
    throw new UsageError(
      "missing_option",
      errorMessage`${inputRef("tickSpacing")} is required on V4 and has no default: two V4 pools at the SAME fee tier can have different tick spacings — measured, USDC/USDT at fee 500 has spacing 12 while TRX/USDT at fee 500 has spacing 10 — so it cannot be derived from ${inputRef("fee")}. '${followUp("sunswap-pool-list-v4")}' publishes each pool's tickSpacing and hooks`,
    );
  }
  // Report missing flags before checking pair order.
  assertSortedPairWhenResolved(input.token0!, input.token1!);
  return {
    token0: input.token0!.trim(),
    token1: input.token1!.trim(),
    fee: input.fee,
    tickSpacing: input.tickSpacing,
    hooks: (input.hooks ?? V4_NO_HOOKS).trim(),
  };
}

// Symbols need resolution first; callers must recheck order after obtaining addresses.
function assertSortedPairWhenResolved(token0: string, token1: string): void {
  const codec = new TronAddress();
  if (!codec.validate(token0.trim()) || !codec.validate(token1.trim())) return;
  assertSortedPair(token0, token1);
}
