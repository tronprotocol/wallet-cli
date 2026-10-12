import { describe, it, expect } from "vitest";
import { formatAmount, formatSun, formatUsd, formatUsdPrice, formatWei } from "./scalars.js";

// 18 decimals laid out in full is neither readable nor meaningful, so text output caps the
// fraction — but a balance must never be shown as something it is not.
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

  // Truncate, never round: rounding 1.9999999 up to "2" overstates a balance, and for a wallet
  // an overstatement is the dangerous direction.
  it("truncates rather than rounds", () => {
    expect(formatAmount("1999999900000000000", 18)).toBe("1.999999");
  });

  // The critical one: 1 wei rendered as "0" reads as an empty account.
  it.each([
    ["1", 18],
    ["999999999999", 18],
  ])(
    "renders a non-zero amount below display precision as <0.000001 (%s @ %i)",
    (raw, decimals) => {
      expect(formatAmount(raw, decimals)).toBe("<0.000001");
    },
  );

  // The boundary: 0.000001 is exactly representable, so it prints in full. At 6 decimals one
  // base unit IS 0.000001, which is why a TRON amount can never fall below display precision.
  it.each([
    ["1000000000000", 18],
    ["1", 6],
  ])("prints the smallest representable amount in full (%s @ %i)", (raw, decimals) => {
    expect(formatAmount(raw, decimals)).toBe("0.000001");
  });

  it("still renders an actual zero as 0", () => {
    expect(formatAmount("0", 18)).toBe("0");
  });

  // Every integer part in text output is grouped, amounts included.
  it("groups the integer part with thousands separators", () => {
    expect(formatAmount("41004350000", 6)).toBe("41,004.35");
    expect(formatAmount("1234567000000000000000000", 18)).toBe("1,234,567");
  });

  it("keeps the family helpers as thin wrappers", () => {
    expect(formatSun("1204560000")).toBe(formatAmount("1204560000", 6));
    expect(formatWei("250000000000000000")).toBe(formatAmount("250000000000000000", 18));
  });
});

// Valuations get 2 decimals, UNIT PRICES get 4. A stablecoin at $0.9998 shown as "$1.00"
// hides a depeg, and a sub-cent token would collapse to "$0.00".
describe("USD formatting", () => {
  it("renders a valuation with two decimals and thousands separators", () => {
    expect(formatUsd("41004.35")).toBe("41,004.35");
    expect(formatUsd("2500")).toBe("2,500.00");
  });

  it("renders a unit price with four decimals", () => {
    expect(formatUsdPrice("0.9998")).toBe("0.9998");
    expect(formatUsdPrice("2500")).toBe("2,500.0000");
  });

  // Below a cent, four decimals would print every small token as nothing, so the price switches
  // to four significant digits — trailing zeros kept, so the precision shown is the one meant.
  it("keeps a sub-cent price visible instead of collapsing it to zero", () => {
    expect(formatUsdPrice("0.0001")).toBe("0.0001000");
    expect(formatUsdPrice("0.00003824")).toBe("0.00003824");
    expect(formatUsdPrice("0.000000327978")).toBe("0.0000003279");
  });

  // A price is read to decide a trade; a rounded-up last digit is a number never quoted.
  it("truncates a sub-cent price rather than rounding it", () => {
    expect(formatUsdPrice("0.000039609945")).toBe("0.00003960");
    expect(formatUsdPrice("0.0000099999")).toBe("0.000009999");
  });

  it("prints an exact zero as four decimals", () => {
    expect(formatUsdPrice("0")).toBe("0.0000");
    expect(formatUsdPrice("0.000")).toBe("0.0000");
  });

  // A cent and above keeps the four-decimal form, including the boundary itself.
  it("uses four decimals from one cent upward", () => {
    expect(formatUsdPrice("0.01")).toBe("0.0100");
    expect(formatUsdPrice("0.337556899071")).toBe("0.3376");
  });

  // Unchanged fallback for input that is not a plain decimal. Exponent form is NOT expanded
  // here — the SunSwap adapter expands it before a price reaches the renderer — so a caller that
  // passes "1e-7" straight in still gets the old collapsed "0.0000".
  it("falls back for a value that is not a plain decimal", () => {
    expect(formatUsdPrice("n/a")).toBe("n/a");
    expect(formatUsdPrice("0.0000001")).toBe("0.0000001000");
  });
});
