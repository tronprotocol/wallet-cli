/**
 * The `sunswap remove-liquidity` dry run.
 *
 * One property is pinned here, because it was wrong once and the wrongness was silent: a V3 or V4
 * withdrawal pays the position's accrued fees out alongside the principal, so more arrives than the
 * `Received (est)` row quotes, and the dry run has to say so BEFORE the caller sends.
 */
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

  /**
   * V4 behaves the same, and was once left out of this warning on PM 6.2's claim that a V4
   * withdrawal leaves fees behind. Measured on Nile it does not — position 7 owed 4821 / 3132
   * before a partial withdrawal and 0 / 0 after — so a V4 dry run quoted only the principal and
   * said nothing about the rest.
   */
  it("warns on V4 too, because V4 pays the fees out the same way", () => {
    expect(render(dryRun("V4"))).toContain(FEES_WARNING);
  });

  // V2 has no accrued fees to pay: they are already inside the LP token being burned.
  it("does not warn on V2", () => {
    expect(render(dryRun("V2"))).not.toContain(FEES_WARNING);
  });
});
