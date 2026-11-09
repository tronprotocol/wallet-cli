import { describe, expect, it } from "vitest";
import { decimalToBigInt } from "./index.js";

const invalid = (message: string) => new Error(message);

describe("decimalToBigInt", () => {
  it("reads decimal integer text beyond the safe-integer range", () => {
    expect(decimalToBigInt("0", "count", invalid)).toBe(0n);
    expect(decimalToBigInt("9007199254740993", "count", invalid)).toBe(9007199254740993n);
  });

  it.each(["", "-1", "1.5", "0x10", " 1", "abc"])("rejects %j", (value) => {
    expect(() => decimalToBigInt(value, "count", invalid)).toThrow(
      "count must be a non-negative decimal integer",
    );
  });
});
