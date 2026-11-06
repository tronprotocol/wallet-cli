import { describe, expect, it } from "vitest";
import { SunPumpTradeFormatters } from "./sunpump-trade.js";

const CTX = { net: { family: "tron", nativeSymbol: "TRX" } } as never;

const quote = (extra: Record<string, unknown>) =>
  SunPumpTradeFormatters.sunpumpTrade(
    {
      kind: "sunpump-sell",
      mode: "quote",
      tokenAddress: "token",
      tokenSymbol: "TKN",
      tokenDecimals: 6,
      tokensIn: "1000000",
      trxOutExpected: "22728",
      platformFee: "10000",
      platformFeePercent: "30.55",
      ...extra,
    },
    CTX,
  );

describe("the platform fee note", () => {
  it("states the minimum the result carries", () => {
    expect(quote({ platformFeeMinimum: "20000" })).toContain(
      "Platform fee is 30.55% of this sell (0.02 TRX minimum).",
    );
  });

  it("states no minimum the result does not carry", () => {
    const text = quote({});
    expect(text).toContain("Platform fee is 30.55% of this sell.");
    expect(text).not.toContain("minimum)");
  });
});
