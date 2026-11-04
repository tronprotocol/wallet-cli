import { describe, expect, it } from "vitest";
import { assertBaiRechargePrecision, baiRechargeAmount } from "./recharge-policy.js";

describe("assertBaiRechargePrecision", () => {
  it.each(["1", "1.5", "1.000001", "1.0000010"])("accepts %s", (amount) => {
    expect(() => assertBaiRechargePrecision(baiRechargeAmount(amount))).not.toThrow();
  });

  it.each(["1.0000001", "0.1234567"])("refuses %s as invalid_amount", (amount) => {
    expect(() => assertBaiRechargePrecision(baiRechargeAmount(amount))).toThrow(
      expect.objectContaining({ code: "invalid_amount" }),
    );
  });
});
