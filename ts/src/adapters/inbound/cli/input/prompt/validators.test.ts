import { describe, it, expect } from "vitest";
import { isValidPrivateKeyHex, isValidMnemonic } from "./validators.js";

describe("isValidPrivateKeyHex", () => {
  it("accepts 64 hex with or without 0x", () => {
    const k = "a".repeat(64);
    expect(isValidPrivateKeyHex(k)).toBe(true);
    expect(isValidPrivateKeyHex("0x" + k)).toBe(true);
  });
  it("rejects wrong length or non-hex", () => {
    expect(isValidPrivateKeyHex("a".repeat(63))).toBe(false);
    expect(isValidPrivateKeyHex("z".repeat(64))).toBe(false);
  });
  it.each([
    ["zero", "0".repeat(64)],
    ["the curve order n", "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"],
    ["above n", "f".repeat(64)],
  ])("rejects a key out of range for secp256k1 (%s)", (_case, key) => {
    expect(isValidPrivateKeyHex(key)).toBe(false);
    expect(isValidPrivateKeyHex(`0x${key}`)).toBe(false);
  });
  it("accepts n - 1", () => {
    expect(
      isValidPrivateKeyHex("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140"),
    ).toBe(true);
  });
});

describe("isValidMnemonic", () => {
  it("accepts a valid 12-word phrase", () => {
    expect(
      isValidMnemonic(
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
      ),
    ).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isValidMnemonic("not a real mnemonic phrase at all nope nope nope nope nope")).toBe(
      false,
    );
  });
});
