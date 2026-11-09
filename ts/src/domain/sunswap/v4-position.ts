// Packed layout: subscriber bits 0–7, signed lower tick 8–31, signed upper tick 32–55,
// and the top 200 bits of the pool ID in bits 56–255.
import { ChainError } from "../errors/index.js";

const POOL_ID_SHIFT = 56n;
const TICK_BITS = 24n;
const TICK_MASK = (1n << TICK_BITS) - 1n;

export interface V4PositionInfo {
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly hasSubscriber: boolean;
  // Top 200 bits of the pool ID as 50 hex characters; only a prefix for comparison.
  readonly poolIdPrefix: string;
}

// Accepts decimal or 0x-prefixed hex uint256; bigint preserves all packed bits.
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
    // Any nonzero subscriber byte means subscribed.
    hasSubscriber: (packed & 0xffn) !== 0n,
    poolIdPrefix: (packed >> POOL_ID_SHIFT).toString(16).padStart(50, "0"),
  };
}

// Match the stored prefix to the pool-key hash before using the position for a withdrawal.
export function assertPositionPool(info: V4PositionInfo, poolId: string): void {
  const expected = (BigInt(prefixed(poolId)) >> POOL_ID_SHIFT).toString(16).padStart(50, "0");
  if (expected !== info.poolIdPrefix) {
    throw new ChainError(
      "invalid_node_response",
      `this position's own record names pool 0x${info.poolIdPrefix}… and the pool key it returned hashes to 0x${expected}…; the two do not agree, so the position's range and pair cannot be trusted`,
    );
  }
}

function signed(value: bigint): number {
  const raw = value & TICK_MASK;
  const complement = raw >= 1n << (TICK_BITS - 1n) ? raw - (1n << TICK_BITS) : raw;
  return Number(complement);
}

function prefixed(hex: string): string {
  const text = hex.trim();
  return text.startsWith("0x") ? text : `0x${text}`;
}
