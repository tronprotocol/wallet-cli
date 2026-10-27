import { describe, expect, it } from "vitest";
import { SunSwapRemoveLiquidityFormatters } from "./sunswap-remove-liquidity.js";

const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";

const CTX = {
  net: { family: "tron", nativeSymbol: "TRX", id: "tron:3448148188" },
  accountLabel: "main",
} as never;

const render = (value: Record<string, unknown>) =>
  SunSwapRemoveLiquidityFormatters.sunswapRemoveLiquidity(value as never, CTX);

function dryRun(protocol: string): Record<string, unknown> {
  return {
    mode: "dry-run",
    protocol,
    account: OWNER,
    recipient: OWNER,
    deadline: 1790000000,
    nftTokenId: "7",
    liquidity: "1000",
    token0: { address: TRX, symbol: "TRX", decimals: 6, amount: "1660", amountMinimum: "1600" },
    token1: { address: USDT, symbol: "USDT", decimals: 6, amount: "602", amountMinimum: "590" },
    fee: { feeModel: "tron-resource", energy: 1000, energyPriceSun: "100" },
    feeCovers: "all",
  };
}

const FEES_WARNING = "Any fees this position has accrued are collected in the same transaction";

describe("sunswap remove-liquidity dry run — the fees that arrive with the principal", () => {
  it("warns on V3", () => {
    expect(render(dryRun("V3"))).toContain(FEES_WARNING);
  });

  it("warns on V4 too, because V4 pays the fees out the same way", () => {
    expect(render(dryRun("V4"))).toContain(FEES_WARNING);
  });

  it("does not warn on V2", () => {
    expect(render(dryRun("V2"))).not.toContain(FEES_WARNING);
  });
});

describe("sunswap remove-liquidity dry run — the No-minimum warning comes last", () => {
  const NO_MINIMUM = "No minimum set — this transaction accepts any output amount.";
  const unfloored = (protocol: string): Record<string, unknown> => {
    const value = dryRun(protocol);
    return {
      ...value,
      feeCovers: "approvals",
      token0: { ...(value.token0 as object), amountMinimum: "0" },
    };
  };

  it.each(["V2", "V3", "V4"])("ends a %s dry run on it", (protocol) => {
    const text = render(unfloored(protocol));
    expect(text.trimEnd().endsWith(NO_MINIMUM)).toBe(true);
  });

  it("still prints the fees warning, above it", () => {
    const text = render(unfloored("V3"));
    expect(text.indexOf(FEES_WARNING)).toBeGreaterThan(-1);
    expect(text.indexOf(FEES_WARNING)).toBeLessThan(text.indexOf(NO_MINIMUM));
  });
});
