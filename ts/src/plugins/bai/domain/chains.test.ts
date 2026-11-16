import { describe, expect, it } from "vitest";
import { isBaiTxHash } from "./chains.js";

const tronHash = "a".repeat(64);
const evmHash = `0x${"a".repeat(64)}`;

describe("isBaiTxHash", () => {
  it.each([
    ["tron", tronHash, true],
    ["tron", evmHash, false],
    ["bnb", evmHash, true],
    ["bnb", tronHash, false],
    ["base", evmHash, true],
    ["base", tronHash, false],
  ] as const)("checks a %s hash in its family's format", (chain, hash, valid) => {
    expect(isBaiTxHash(chain, hash)).toBe(valid);
  });
});
