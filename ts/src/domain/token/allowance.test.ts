import { describe, expect, it } from "vitest";
import { isUnlimitedAllowance, MAX_UINT256, UNLIMITED_ALLOWANCE } from "./allowance.js";

describe("unlimited allowance", () => {
  it("is max uint256 in base units", () => {
    expect(MAX_UINT256).toBe((1n << 256n) - 1n);
    expect(UNLIMITED_ALLOWANCE).toBe(MAX_UINT256.toString());
  });

  it("recognizes only max uint256", () => {
    expect(isUnlimitedAllowance(UNLIMITED_ALLOWANCE)).toBe(true);
    expect(isUnlimitedAllowance(MAX_UINT256)).toBe(true);
    expect(isUnlimitedAllowance(MAX_UINT256 - 1n)).toBe(false);
    expect(isUnlimitedAllowance("0")).toBe(false);
  });
});
