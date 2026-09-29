import { describe, expect, it } from "vitest";
import { expandScientificNotation, toBaseUnitsTruncating } from "./amount.js";

describe("toBaseUnitsTruncating", () => {
  it("scales a decimal amount to base units", () => {
    expect(toBaseUnitsTruncating("1070163.618808583559303388", 18)).toBe(
      "1070163618808583559303388",
    );
    expect(toBaseUnitsTruncating("890592.582622", 6)).toBe("890592582622");
  });

  it("pads a fraction shorter than the token's precision", () => {
    expect(toBaseUnitsTruncating("1.5", 6)).toBe("1500000");
    expect(toBaseUnitsTruncating("2", 6)).toBe("2000000");
  });

  // The indexer's own rounding artefacts, not digits anyone can spend.
  it("truncates rather than rounding past the token's precision", () => {
    expect(toBaseUnitsTruncating("1.9999999", 6)).toBe("1999999");
    expect(toBaseUnitsTruncating("0.0000009", 6)).toBe("0");
  });

  it("handles zero decimals", () => {
    expect(toBaseUnitsTruncating("42.75", 0)).toBe("42");
  });

  it("keeps every digit of a value far past float precision", () => {
    const exact = "1961161232999063830653955.123456";
    expect(toBaseUnitsTruncating(exact, 6)).toBe("1961161232999063830653955123456");
  });

  it("normalises the several spellings of zero", () => {
    expect(toBaseUnitsTruncating("0", 18)).toBe("0");
    expect(toBaseUnitsTruncating("0.0", 18)).toBe("0");
    expect(toBaseUnitsTruncating("000.000", 18)).toBe("0");
  });

  it("preserves a negative amount", () => {
    expect(toBaseUnitsTruncating("-1.5", 6)).toBe("-1500000");
  });

  // Returning it unchanged sends the surprise to the caller instead of inventing a number here.
  it("passes a non-decimal literal through untouched", () => {
    expect(toBaseUnitsTruncating("7.06e-05", 6)).toBe("7.06e-05");
    expect(toBaseUnitsTruncating("", 6)).toBe("");
    expect(toBaseUnitsTruncating("n/a", 6)).toBe("n/a");
  });
});

describe("expandScientificNotation", () => {
  it("expands a small price the API sends in exponent form", () => {
    expect(expandScientificNotation("7.06e-05")).toBe("0.0000706");
    expect(expandScientificNotation("1e-7")).toBe("0.0000001");
  });

  it("expands a large value without going through a float", () => {
    expect(expandScientificNotation("1.961161232999063830653955E+24")).toBe(
      "1961161232999063830653955",
    );
    expect(expandScientificNotation("1.5e3")).toBe("1500");
  });

  it("keeps the sign", () => {
    expect(expandScientificNotation("-2.5e-3")).toBe("-0.0025");
  });

  it("collapses the several spellings of zero", () => {
    expect(expandScientificNotation("0e0")).toBe("0");
    expect(expandScientificNotation("0.0e-5")).toBe("0");
  });

  it("leaves a plain decimal or a non-number untouched", () => {
    expect(expandScientificNotation("1070163.618808583559303388")).toBe(
      "1070163.618808583559303388",
    );
    expect(expandScientificNotation("IN_RANGE")).toBe("IN_RANGE");
    expect(expandScientificNotation("")).toBe("");
  });

  // The two compose: the API's exponent form has to survive into base units.
  it("feeds a plain decimal into the base-unit conversion", () => {
    expect(toBaseUnitsTruncating(expandScientificNotation("7.06e-05"), 6)).toBe("70");
  });
});
