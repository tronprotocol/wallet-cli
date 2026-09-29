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

it("shows the exact initial price and its range in a V4 creation preview", () => {
  const text = SunSwapLiquidityFormatters.sunswapLiquidity(
    {
      ...base,
      protocol: "V4",
      mode: "dry-run",
      poolCreated: true,
      initialSqrtPriceX96: "263961795081773446554",
      tickLower: -396420,
      tickUpper: -384420,
      tickRangeAuto: true,
    },
    ctx,
  );
  expect(text).toContain("Initial sqrtPriceX96");
  expect(text).toContain("263961795081773446554");
  expect(text).toContain("[-396420, -384420]");
});

it.each(["sunpump-buy", "sunpump-sell"])(
  "renders verified %s output instead of the quote",
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
        tokensOutExpected: "999000000",
        trxOutExpected: "999000000",
        tokensOut: "1230000",
        trxOut: "1230000",
        platformFee: "10000",
      },
      ctx,
    );
    expect(text).toContain("Received");
    expect(text).not.toContain("Received (est)");
    expect(text).toContain("1.23");
    expect(text).not.toContain("999");
  },
);
it("renders a Permit2-only fee gap and initial human price without an approval warning", () => {
  const text = SunSwapLiquidityFormatters.sunswapLiquidity(
    {
      ...base,
      protocol: "V4",
      mode: "dry-run",
      initialSqrtPriceX96: "79228162514264337593543950336",
      initialPrice: { token0: "USDT", token1: "WTRX", token1PerToken0: "1" },
      feeCovers: "none",
      feeUnavailableReason:
        "the main transaction cannot be estimated until the Permit2 authorization is signed",
    },
    ctx,
  );
  expect(text).toContain("Permit2");
  expect(text).not.toContain("until the approval is on-chain");
  expect(text).toContain("1 USDT ≈ 1 WTRX");
});
