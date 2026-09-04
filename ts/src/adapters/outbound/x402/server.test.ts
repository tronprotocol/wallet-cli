import { describe, expect, it } from "vitest";
import { toSmallestUnit } from "./server.js";

describe("x402 server amount conversion", () => {
  it("converts without floating point loss", () => {
    expect(toSmallestUnit("1.000001", 6)).toBe("1000001");
    expect(() => toSmallestUnit("0.0000001", 6)).toThrow(/at most 6/);
  });
});
