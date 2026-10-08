/**
 * The `sunswap add-liquidity` preview text.
 *
 * Two properties are pinned here: a preview reads the liquidity it funds from `liquidityExpected`,
 * and when a floor is zero the No-minimum warning is the LAST line.
 */
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
    token0: { symbol: "USDT", decimals: 6, amount: "1000000", amountMinimum: "0" },
    token1: { symbol: "WTRX", decimals: 6, amount: "493089", amountMinimum: "0" },
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
});
