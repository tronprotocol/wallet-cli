/**
 * A V4 position's own description of itself, unpacked — and checked against itself.
 *
 * `getPoolAndPositionInfo(uint256)` answers with a pool key and a single `uint256` that carries the
 * rest. The range a position holds is in that word, not in a field, so reading it wrong produces a
 * position with plausible ticks that belong to nobody — the failure mode this version has already
 * produced four times, where a wrong answer looks exactly like a right one.
 *
 * So the layout is not trusted on the strength of having been read somewhere. It is:
 *
 *   bits 0–7     hasSubscriber
 *   bits 8–31    tickLower   (int24, signed)
 *   bits 32–55   tickUpper   (int24, signed)
 *   bits 56–255  poolId, truncated to its top 200 bits
 *
 * and it is CHECKED, twice, against a live mainnet position (token id 1):
 *
 * - The ticks come out 264960 and 278880, both exact multiples of that pool's tick spacing of 60.
 *   A wrong bit offset would not land on a multiple of 60 twice.
 * - The truncated pool id matches `computeV4PoolId` over the pool key the SAME call returned,
 *   200 bits for 200 bits. That is the cross-check `assertPositionPool` exists to run at runtime:
 *   a position whose key does not hash to the id packed inside it has been mis-decoded, and
 *   continuing would size a withdrawal against the wrong pool.
 */
import { ChainError } from "../errors/index.js";

/** How many low bits the pool id is NOT stored in. */
const POOL_ID_SHIFT = 56n;
const TICK_BITS = 24n;
const TICK_MASK = (1n << TICK_BITS) - 1n;

export interface V4PositionInfo {
  readonly tickLower: number;
  readonly tickUpper: number;
  /** Whether the position is subscribed to a notifier contract. A fact, not a problem. */
  readonly hasSubscriber: boolean;
  /**
   * The pool id as the position stores it: the top 200 bits, so 25 bytes of the 32.
   *
   * Not a pool id you can look a pool up by — it is a fingerprint, and it exists to be compared
   * with the top 200 bits of a full one.
   */
  readonly poolIdPrefix: string;
}

/**
 * The packed word, unpacked.
 *
 * Integer arithmetic throughout, on `bigint`. The word is a full 256 bits, so anything that touched
 * a `number` on the way through would round the pool id away entirely.
 */
export function decodeV4PositionInfo(info: string): V4PositionInfo {
  const text = info.trim();
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(text)) {
    throw new ChainError(
      "invalid_node_response",
      `the position manager returned ${JSON.stringify(info)} as a position's packed info, which is not a number`,
    );
  }
  const packed = BigInt(text);
  if (packed < 0n || packed >= 1n << 256n) {
    throw new ChainError(
      "invalid_node_response",
      `a position's packed info is ${text}, which does not fit in 256 bits`,
    );
  }
  return {
    tickLower: signed(packed >> 8n),
    tickUpper: signed(packed >> 32n),
    // Any non-zero byte means subscribed; the field is a byte rather than a bit in the layout.
    hasSubscriber: (packed & 0xffn) !== 0n,
    poolIdPrefix: (packed >> POOL_ID_SHIFT).toString(16).padStart(50, "0"),
  };
}

/**
 * The position's pool, confirmed to be the pool we think it is.
 *
 * Cheap — a shift and a string compare — and it is the only thing standing between a decode error
 * and a withdrawal sized against another pool's reserves. A mismatch is `invalid_node_response`:
 * the caller asked a reasonable question and the answer does not hang together.
 */
export function assertPositionPool(info: V4PositionInfo, poolId: string): void {
  const expected = (BigInt(prefixed(poolId)) >> POOL_ID_SHIFT).toString(16).padStart(50, "0");
  if (expected !== info.poolIdPrefix) {
    throw new ChainError(
      "invalid_node_response",
      `this position's own record names pool 0x${info.poolIdPrefix}… and the pool key it returned hashes to 0x${expected}…; the two do not agree, so the position's range and pair cannot be trusted`,
    );
  }
}

/** An int24 read out of the low 24 bits of `value`. Ticks are routinely negative. */
function signed(value: bigint): number {
  const raw = value & TICK_MASK;
  const complement = raw >= 1n << (TICK_BITS - 1n) ? raw - (1n << TICK_BITS) : raw;
  return Number(complement);
}

function prefixed(hex: string): string {
  const text = hex.trim();
  return text.startsWith("0x") ? text : `0x${text}`;
}
