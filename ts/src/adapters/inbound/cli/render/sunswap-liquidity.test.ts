import { describe, expect, it } from "vitest";
import { SunSwapLiquidityFormatters } from "./sunswap-liquidity.js";

const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";
const CTX = {
  net: { family: "tron", nativeSymbol: "TRX", id: "tron:3448148188" },
  accountLabel: "main",
} as never;
const NO_MINIMUM = "No minimum set — this transaction accepts any output amount.";

const render = (value: Record<string, unknown>) =>
  SunSwapLiquidityFormatters.sunswapLiquidity(value as never, CTX);

function preview(mode: string): Record<string, unknown> {
  return {
    mode,
    protocol: "V3",
    account: OWNER,
    recipient: OWNER,
    deadline: 1790000000,
    newPosition: true,
    feeTier: 500,
    tickLower: -8030,
    tickUpper: -6030,
    liquidityExpected: "14398816",
    token0: {
      symbol: "USDT",
      decimals: 6,
      amount: "1000000",
      amountMinimum: "0",
      acceptsAnyAmount: true,
    },
    token1: {
      symbol: "WTRX",
      decimals: 6,
      amount: "493089",
      amountMinimum: "0",
      acceptsAnyAmount: true,
    },
    fee: { feeModel: "tron-resource", energy: 1000, energyPriceSun: "100" },
    feeCovers: "all",
  };
}

describe("sunswap add-liquidity preview — the liquidity it funds", () => {
  it.each(["dry-run", "build-only"])("reads liquidityExpected on a %s", (mode) => {
    expect(render(preview(mode))).toMatch(/Liquidity +14,398,816\n/);
  });
});

describe("sunswap add-liquidity dry run — the No-minimum warning comes last", () => {
  it("ends on it even when other warnings are printed", () => {
    const text = render({ ...preview("dry-run"), feeCovers: "approvals", poolHasNoPrice: true });
    expect(text).toContain("no established price");
    expect(text).toContain("until the approval is on-chain");
    expect(text.trimEnd().endsWith(NO_MINIMUM)).toBe(true);
  });

  it("names the one side without a floor instead of claiming any output is accepted", () => {
    const value = preview("dry-run");
    const text = render({
      ...value,
      token0: { symbol: "USDT", decimals: 6, amount: "1000000", amountMinimum: "950000" },
    });
    expect(text).not.toContain(NO_MINIMUM);
    expect(text.trimEnd()).toMatch(
      /No minimum set for WTRX — this transaction accepts any amount of WTRX\.$/,
    );
  });

  it("prints no zero-minimum note when the result flags no side", () => {
    const value = preview("dry-run");
    const strip = (side: unknown) => ({ ...(side as object), acceptsAnyAmount: undefined });
    const text = render({ ...value, token0: strip(value.token0), token1: strip(value.token1) });
    expect(text).not.toContain("No minimum set");
  });
});
