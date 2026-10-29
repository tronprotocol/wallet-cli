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
    token0: {
      address: TRX,
      symbol: "TRX",
      decimals: 6,
      amount: "1660",
      amountMinimum: "1600",
      receivedAmount: "1660",
    },
    token1: {
      address: USDT,
      symbol: "USDT",
      decimals: 6,
      amount: "602",
      amountMinimum: "590",
      receivedAmount: "602",
    },
    ...(protocol === "V2" ? {} : { collectsFees: true }),
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
  const NO_MINIMUM = "No minimum set for TRX — this transaction accepts any amount of TRX.";
  const unfloored = (protocol: string): Record<string, unknown> => {
    const value = dryRun(protocol);
    return {
      ...value,
      feeCovers: "approvals",
      token0: { ...(value.token0 as object), amountMinimum: "0", acceptsAnyAmount: true },
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

  it("does not claim any output is accepted when only one side has no floor", () => {
    expect(render(unfloored("V2"))).not.toContain("accepts any output amount");
  });

  it("says any output is accepted when neither side has a floor", () => {
    const value = unfloored("V2");
    const text = render({
      ...value,
      token1: { ...(value.token1 as object), amountMinimum: "0", acceptsAnyAmount: true },
    });
    expect(text.trimEnd()).toMatch(
      /No minimum set — this transaction accepts any output amount\.$/,
    );
  });
});

describe("sunswap remove-liquidity — the received amount comes from the result", () => {
  it("prints receivedAmount without adding fees to the principal", () => {
    const value = dryRun("V4");
    const text = render({
      ...value,
      token0: { ...(value.token0 as object), feeAmount: "40", receivedAmount: "1700" },
    });
    expect(text).toMatch(/Received \(est\) +0\.0017 TRX \/ 0\.000602 USDT/);
  });

  it("invents no amount when the result carries none", () => {
    const value = dryRun("V2");
    const text = render({
      ...value,
      token0: { ...(value.token0 as object), receivedAmount: undefined, feeAmount: "40" },
    });
    expect(text).not.toContain("0.0017");
    expect(text).not.toContain("0.00166 TRX /");
  });
});
