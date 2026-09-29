import { describe, expect, it } from "vitest";
import { SunSwapLiquidityFormatters } from "./sunswap-liquidity.js";
import { SunSwapRemoveLiquidityFormatters } from "./sunswap-remove-liquidity.js";
import { SunSwapCollectFeesFormatters } from "./sunswap-collect-fees.js";

const ctx = { net: { family: "tron", nativeSymbol: "TRX" } } as never;
const base = {
  protocol: "V2",
  recipient: "recipient",
  deadline: 1790000000,
  token0: { symbol: "TRX", decimals: 6, amount: "895260075" },
  token1: { symbol: "USDT", decimals: 6, amount: "1303966990" },
};

describe("liquidity receipt amount provenance", () => {
  for (const [render, label] of [
    [SunSwapLiquidityFormatters.sunswapLiquidity, "Deposited"],
    [SunSwapRemoveLiquidityFormatters.sunswapRemoveLiquidity, "Received"],
    [SunSwapCollectFeesFormatters.sunswapCollectFees, "Collected"],
  ] as const) {
    it.each([
      ["submitted", false],
      ["failed", false],
      ["confirmed", true],
    ])(`${label} labels %s / estimated=%s as an estimate`, (stage, amountsEstimated) => {
      expect(render({ ...base, stage, amountsEstimated } as never, ctx)).toContain(
        `${label} (est)`,
      );
    });
    it(`${label} distinguishes confirmed receipt amounts`, () => {
      expect(
        render({ ...base, stage: "confirmed", amountsEstimated: false } as never, ctx),
      ).not.toContain(`${label} (est)`);
    });
  }
});

import { SunPumpTradeFormatters } from "./sunpump-trade.js";
it.each(["sunpump-buy", "sunpump-sell"])(
  "labels %s output as quoted after confirmation",
  (kind) => {
    const text = SunPumpTradeFormatters.sunpumpTrade(
      {
        kind,
        stage: "confirmed",
        tokenAddress: "token",
        tokenSymbol: "TKN",
        tokenDecimals: 6,
        trxIn: "1000000",
        tokensIn: "1000000",
        tokensOutExpected: "2000000",
        trxOutExpected: "2000000",
        platformFee: "1000",
      },
      ctx,
    );
    expect(text).toContain("Received (est)");
    expect(text).not.toMatch(/(?:Bought|Sold) .* for /);
  },
);

it("renders V4 actual settlement even when a hook changes principal plus fees", () => {
  const text = SunSwapRemoveLiquidityFormatters.sunswapRemoveLiquidity(
    {
      ...base,
      protocol: "V4",
      stage: "confirmed",
      amountsEstimated: false,
      token0: {
        symbol: "TRX",
        decimals: 6,
        amount: "1660",
        feeAmount: "4821",
        receivedAmount: "6400",
      },
      token1: {
        symbol: "USDT",
        decimals: 6,
        amount: "602",
        feeAmount: "3132",
        receivedAmount: "3734",
      },
    },
    ctx,
  );
  expect(text).toContain("0.0064 TRX");
  expect(text).not.toContain("0.006481 TRX");
  expect(text).not.toContain("Received (est)");
});
