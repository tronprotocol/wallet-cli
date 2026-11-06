import { describe, it, expect } from "vitest";
import { formatAmount, formatSun, formatUsd, formatUsdPrice, formatWei } from "./scalars.js";

describe("formatAmount", () => {
  it.each([
    ["1000000", 6, "1"],
    ["1204560000", 6, "1,204.56"],
    ["250000000000000000", 18, "0.25"],
    ["12345600000000000000", 18, "12.3456"],
  ])("renders %s at %i decimals as %s", (raw, decimals, expected) => {
    expect(formatAmount(raw, decimals)).toBe(expected);
  });

  it("caps the fraction at six places", () => {
    expect(formatAmount("1234567890123456789", 18)).toBe("1.234567");
  });

  it("truncates rather than rounds", () => {
    expect(formatAmount("1999999900000000000", 18)).toBe("1.999999");
  });

  it.each([
    ["1", 18],
    ["999999999999", 18],
  ])(
    "renders a non-zero amount below display precision as <0.000001 (%s @ %i)",
    (raw, decimals) => {
      expect(formatAmount(raw, decimals)).toBe("<0.000001");
    },
  );

  it.each([
    ["1000000000000", 18],
    ["1", 6],
  ])("prints the smallest representable amount in full (%s @ %i)", (raw, decimals) => {
    expect(formatAmount(raw, decimals)).toBe("0.000001");
  });

  it("still renders an actual zero as 0", () => {
    expect(formatAmount("0", 18)).toBe("0");
  });

  it("groups the integer part with thousands separators", () => {
    expect(formatAmount("41004350000", 6)).toBe("41,004.35");
    expect(formatAmount("1234567000000000000000000", 18)).toBe("1,234,567");
  });

  it("keeps the family helpers as thin wrappers", () => {
    expect(formatSun("1204560000")).toBe(formatAmount("1204560000", 6));
    expect(formatWei("250000000000000000")).toBe(formatAmount("250000000000000000", 18));
  });
});

describe("USD formatting", () => {
  it("renders a valuation with two decimals and thousands separators", () => {
    expect(formatUsd("41004.35")).toBe("41,004.35");
    expect(formatUsd("2500")).toBe("2,500.00");
  });

  it("renders a unit price with four decimals", () => {
    expect(formatUsdPrice("0.9998")).toBe("0.9998");
    expect(formatUsdPrice("2500")).toBe("2,500.0000");
  });

  it("keeps a sub-cent price visible instead of collapsing it to zero", () => {
    expect(formatUsdPrice("0.0001")).toBe("0.0001000");
    expect(formatUsdPrice("0.00003824")).toBe("0.00003824");
    expect(formatUsdPrice("0.000000327978")).toBe("0.0000003279");
  });

  it("truncates a sub-cent price rather than rounding it", () => {
    expect(formatUsdPrice("0.000039609945")).toBe("0.00003960");
    expect(formatUsdPrice("0.0000099999")).toBe("0.000009999");
  });

  it("prints an exact zero as four decimals", () => {
    expect(formatUsdPrice("0")).toBe("0.0000");
    expect(formatUsdPrice("0.000")).toBe("0.0000");
  });

  it("uses four decimals from one cent upward", () => {
    expect(formatUsdPrice("0.01")).toBe("0.0100");
    expect(formatUsdPrice("0.337556899071")).toBe("0.3376");
  });

  it("falls back for a value that is not a plain decimal", () => {
    expect(formatUsdPrice("n/a")).toBe("n/a");
    expect(formatUsdPrice("0.0000001")).toBe("0.0000001000");
  });
});
