import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits } from "./index.js";
import { UsageError } from "../errors/index.js";

describe("fromBaseUnits", () => {
  it("converts base units to a trimmed human decimal", () => {
    expect(fromBaseUnits("1204560000", 6)).toBe("1204.56");
    expect(fromBaseUnits("1000000", 6)).toBe("1");
    expect(fromBaseUnits("100", 6)).toBe("0.0001");
    expect(fromBaseUnits("0", 6)).toBe("0");
  });
  it("preserves negatives (the case the old copies disagreed on)", () => {
    expect(fromBaseUnits("-268000", 6)).toBe("-0.268");
    expect(fromBaseUnits("-1000000", 6)).toBe("-1");
  });
  it("accepts number and bigint", () => {
    expect(fromBaseUnits(1000000, 6)).toBe("1");
    expect(fromBaseUnits(1000000n, 6)).toBe("1");
  });
  it("returns non-integer input unchanged (lenient passthrough)", () => {
    expect(fromBaseUnits("not-a-number", 6)).toBe("not-a-number");
    expect(fromBaseUnits("1.5", 6)).toBe("1.5");
  });
});

describe("toBaseUnits", () => {
  it("converts a human decimal to integer base units", () => {
    expect(toBaseUnits("1204.56", 6, "TRX")).toBe("1204560000");
    expect(toBaseUnits("1", 6, "TRX")).toBe("1000000");
    expect(toBaseUnits("0", 6, "TRX")).toBe("0");
    expect(toBaseUnits("0.0001", 6, "TRX")).toBe("100");
  });
  it("round-trips with fromBaseUnits", () => {
    expect(fromBaseUnits(toBaseUnits("3.14159", 6, "TRX"), 6)).toBe("3.14159");
  });
  it("rejects negative / non-numeric / scientific-notation input", () => {
    expect(() => toBaseUnits("-1", 6, "TRX")).toThrow(UsageError);
    expect(() => toBaseUnits("abc", 6, "TRX")).toThrow(UsageError);
    expect(() => toBaseUnits("1e6", 6, "TRX")).toThrow(UsageError);
  });
  it("rejects more fractional digits than the unit supports", () => {
    expect(() => toBaseUnits("1.1234567", 6, "TRX")).toThrow(/too many decimal places/);
  });
});
