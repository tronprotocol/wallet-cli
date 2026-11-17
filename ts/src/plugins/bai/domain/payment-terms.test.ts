import { describe, expect, it } from "vitest";
import {
  isPaymentDecimals,
  paymentBaseUnits,
  paymentRawAmount,
  paymentValidity,
  X402_DEFAULT_VALIDITY_SECONDS,
} from "./payment-terms.js";

describe("x402 payment terms", () => {
  it("converts whole tokens without floating point loss", () => {
    expect(paymentBaseUnits("1.000001", 6, "amount")).toBe("1000001");
    expect(() => paymentBaseUnits("0.0000001", 6, "amount")).toThrow(/at most 6/);
  });

  it.each(["0", "1e3", (1n << 256n).toString()])("refuses whole amount %s", (amount) => {
    expect(() => paymentBaseUnits(amount, 6, "amount")).toThrow(
      expect.objectContaining({
        code: "invalid_amount",
        message: expect.stringMatching(/^amount /),
      }),
    );
  });

  it.each(["0", "01x", (1n << 256n).toString(), "1".repeat(79)])("refuses raw amount %s", (raw) => {
    expect(() => paymentRawAmount(raw, "rawAmount")).toThrow(
      expect.objectContaining({ code: "invalid_amount" }),
    );
  });

  it("accepts the largest uint256", () => {
    const max = ((1n << 256n) - 1n).toString();
    expect(paymentRawAmount(max, "rawAmount")).toBe(max);
  });

  it("defaults the validity and bounds it", () => {
    expect(paymentValidity(undefined, "validForSeconds")).toBe(X402_DEFAULT_VALIDITY_SECONDS);
    expect(paymentValidity(86_400, "validForSeconds")).toBe(86_400);
    for (const seconds of [0, 86_401, 1.5])
      expect(() => paymentValidity(seconds, "validForSeconds")).toThrow(
        expect.objectContaining({
          code: "invalid_value",
          message: "validForSeconds must be from 1 to 86400",
        }),
      );
  });

  it("bounds explicit precision to 0..18", () => {
    expect([0, 18].map(isPaymentDecimals)).toEqual([true, true]);
    expect([-1, 19, 1.5].map(isPaymentDecimals)).toEqual([false, false, false]);
  });
});
