import { describe, expect, it } from "vitest";
import { assertPositionPool, decodeV4PositionInfo } from "./v4-position.js";

const INFO = "42336396225037886459451028485864057278422247372159621142374784394315415879680";
const POOL_ID = "0x5d998d14c22d3962d44013c8c28433779fdd4b4242c62296ea1cd8d456b145a6";
const TICK_SPACING = 60;

describe("the packed word, unpacked", () => {
  it("reads the range a real position holds", () => {
    const info = decodeV4PositionInfo(INFO);
    expect(info.tickLower).toBe(264960);
    expect(info.tickUpper).toBe(278880);
    expect(info.hasSubscriber).toBe(false);
  });

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
  it("accepts a position whose key hashes to the id packed inside it", () => {
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), POOL_ID)).not.toThrow();
  });

  it("accepts the pool id with or without 0x", () => {
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), POOL_ID.slice(2))).not.toThrow();
  });

  it("refuses a position whose key belongs to another pool", () => {
    const other = `0x${"11".repeat(32)}`;
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), other)).toThrow(
      expect.objectContaining({ code: "invalid_node_response" }),
    );
  });

  it("ignores the part of the id the position does not store", () => {
    const sameTop = `0x${BigInt(POOL_ID).toString(16).padStart(64, "0").slice(0, 50)}${"ff".repeat(7)}`;
    expect(() => assertPositionPool(decodeV4PositionInfo(INFO), sameTop)).not.toThrow();
  });
});
