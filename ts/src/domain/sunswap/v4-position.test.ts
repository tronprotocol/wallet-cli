/**
 * Unpacking a V4 position, held against a live one.
 *
 * `INFO` and `POOL_ID` are what mainnet position 1 and its own pool key actually returned. Nothing
 * here is composed: the point of the fixture is that the bit layout is confirmed by two independent
 * facts about a real position rather than by having been read somewhere.
 */
import { describe, expect, it } from "vitest";
import { assertPositionPool, decodeV4PositionInfo } from "./v4-position.js";

/** Measured: `getPoolAndPositionInfo(1)`'s second return value on mainnet. */
const INFO = "42336396225037886459451028485864057278422247372159621142374784394315415879680";
/** Measured: `computeV4PoolId` over the pool key that same call returned. */
const POOL_ID = "0x5d998d14c22d3962d44013c8c28433779fdd4b4242c62296ea1cd8d456b145a6";
/** Measured: that pool's tick spacing, from its `parameters` field. */
const TICK_SPACING = 60;

describe("the packed word, unpacked", () => {
  it("reads the range a real position holds", () => {
    const info = decodeV4PositionInfo(INFO);
    expect(info.tickLower).toBe(264960);
    expect(info.tickUpper).toBe(278880);
    expect(info.hasSubscriber).toBe(false);
  });

  /**
   * The self-check that makes the offsets credible. A wrong bit offset does not land on a multiple
   * of the pool's tick spacing twice by accident, and every V4 range is aligned to it.
   */
  it("lands both ticks on the pool's tick spacing", () => {
    const info = decodeV4PositionInfo(INFO);
    expect(info.tickLower % TICK_SPACING).toBe(0);
    expect(info.tickUpper % TICK_SPACING).toBe(0);
    expect(info.tickLower).toBeLessThan(info.tickUpper);
  });

  it("accepts the word as hex as well as decimal", () => {
    const hex = `0x${BigInt(INFO).toString(16)}`;
    expect(decodeV4PositionInfo(hex)).toEqual(decodeV4PositionInfo(INFO));
  });

  // Ticks are signed and routinely negative; a range below the current price is the ordinary case
  // for one-sided liquidity.
  it("reads a negative range", () => {
    const packed =
      ((BigInt(POOL_ID) >> 56n) << 56n) |
      (BigInt.asUintN(24, -120n) << 32n) |
      (BigInt.asUintN(24, -240n) << 8n);
    const info = decodeV4PositionInfo(packed.toString());
    expect(info.tickLower).toBe(-240);
    expect(info.tickUpper).toBe(-120);
  });

  it("reads a subscribed position", () => {
    const info = decodeV4PositionInfo((BigInt(INFO) | 1n).toString());
    expect(info.hasSubscriber).toBe(true);
  });

  it.each([
    ["", "not a number"],
    ["abc", "not a number"],
    ["-1", "not a number"],
  ])("refuses %s", (value, message) => {
    expect(() => decodeV4PositionInfo(value)).toThrow(message);
  });

  it("refuses a word that does not fit in 256 bits", () => {
    expect(() => decodeV4PositionInfo((1n << 256n).toString())).toThrow(/does not fit in 256 bits/);
  });
});

describe("the position and its pool must agree", () => {
  /**
   * The cross-check, and the reason this file exists. The top 200 bits of the packed word are the
   * pool's own id; `computeV4PoolId` over the key the same call returned reproduces them exactly.
   * Verified live: 200 bits for 200 bits.
   */
  it("accepts a position whose key hashes to the id packed inside it", () => {
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), POOL_ID)).not.toThrow();
  });

  it("accepts the pool id with or without 0x", () => {
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), POOL_ID.slice(2))).not.toThrow();
  });

  /**
   * A mismatch means the decode is wrong, so nothing read out of it can be trusted — including the
   * range a withdrawal would be sized against. It is a `invalid_node_response`: the question was fine and
   * the answer does not hang together.
   */
  it("refuses a position whose key belongs to another pool", () => {
    const other = `0x${"11".repeat(32)}`;
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), other)).toThrow(
      expect.objectContaining({ code: "invalid_node_response" }),
    );
  });

  // The low 56 bits are the ticks and the subscriber byte, and they are NOT part of the comparison:
  // two positions in the same pool with different ranges must both pass.
  it("ignores the part of the id the position does not store", () => {
    const sameTop = `0x${BigInt(POOL_ID).toString(16).padStart(64, "0").slice(0, 50)}${"ff".repeat(7)}`;
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), sameTop)).not.toThrow();
  });
});
