import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_LIMIT_SUN, TRX_TRANSFER_BANDWIDTH_BURN_SUN } from "./tron.js";

describe("TRON fee constants", () => {
  it("defaults the fee limit to 100 TRX in SUN", () => {
    expect(DEFAULT_FEE_LIMIT_SUN).toBe("100000000");
  });

  it("estimates a TRX transfer's bandwidth burn at 0.1 TRX", () => {
    expect(TRX_TRANSFER_BANDWIDTH_BURN_SUN).toBe(100_000);
  });
});
