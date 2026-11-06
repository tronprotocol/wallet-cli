import { describe, expect, it } from "vitest";
import { isTxHash, normalizeTxHash, txHashInputPattern } from "./tx-hash.js";

const HEX = "AbCdEf0123456789".repeat(4);

describe("isTxHash", () => {
  it("accepts each family's own spelling only", () => {
    expect(isTxHash("tron", HEX)).toBe(true);
    expect(isTxHash("tron", `0x${HEX}`)).toBe(false);
    expect(isTxHash("evm", `0x${HEX}`)).toBe(true);
    expect(isTxHash("evm", HEX)).toBe(false);
  });

  it.each(["", "0x", HEX.slice(1), `${HEX}0`, `${HEX.slice(1)}g`, `0X${HEX}`])(
    "rejects %j in both families",
    (value) => {
      expect(isTxHash("tron", value)).toBe(false);
      expect(isTxHash("evm", value)).toBe(false);
    },
  );
});

describe("normalizeTxHash", () => {
  it("drops an optional lowercase 0x prefix from a TRON id and lowercases it", () => {
    expect(normalizeTxHash("tron", HEX)).toBe(HEX.toLowerCase());
    expect(normalizeTxHash("tron", `0x${HEX}`)).toBe(HEX.toLowerCase());
  });

  it("rejects an uppercase prefix and malformed TRON ids", () => {
    expect(normalizeTxHash("tron", `0X${HEX}`)).toBeUndefined();
    expect(normalizeTxHash("tron", HEX.slice(2))).toBeUndefined();
  });

  it("keeps the 0x prefix on EVM and requires it", () => {
    expect(normalizeTxHash("evm", `0x${HEX}`)).toBe(`0x${HEX.toLowerCase()}`);
    expect(normalizeTxHash("evm", HEX)).toBeUndefined();
  });

  it("agrees with the input pattern used by command schemas", () => {
    for (const value of [HEX, `0x${HEX}`, `0X${HEX}`, HEX.slice(1)]) {
      expect(txHashInputPattern("tron").test(value)).toBe(
        normalizeTxHash("tron", value) !== undefined,
      );
    }
  });
});
