import { describe, expect, it } from "vitest";
import { SunSwapCollectFeesFormatters } from "./sunswap-collect-fees.js";

const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";

const CTX = {
  net: { family: "tron", nativeSymbol: "TRX", id: "tron:3448148188" },
  accountLabel: "main",
} as never;

const render = (value: Record<string, unknown>) =>
  SunSwapCollectFeesFormatters.sunswapCollectFees(value as never, CTX);

const V3 = {
  kind: "sunswap-collect-fees",
  stage: "confirmed",
  account: OWNER,
  protocol: "V3",
  nftTokenId: "1846",
  recipient: "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC",
  token0: { address: TRX, symbol: "WTRX", decimals: 6, amount: "31" },
  token1: { address: USDT, symbol: "USDT", decimals: 6, amount: "9" },
  txId: "f60b85ce",
  blockNumber: 57884371,
};

const V4 = {
  kind: "sunswap-collect-fees",
  stage: "confirmed",
  account: OWNER,
  protocol: "V4",
  nftTokenId: "1",
  recipient: OWNER,
  token0: { address: TRX, symbol: "TRX", decimals: 6 },
  token1: { address: USDT, symbol: "USDT", decimals: 6 },
  txId: "3da4c902",
  blockNumber: 57884479,
};

describe("collect-fees receipt — V3", () => {
  it("prints the amounts the contract reported", () => {
    const out = render(V3);
    expect(out).toContain("Collected");
    expect(out).toContain("0.000031 WTRX / 0.000009 USDT");
  });

  it("marks a dry run's figure as an estimate", () => {
    expect(render({ ...V3, mode: "dry-run" })).toContain("Collected (est)");
  });

  it("prints a zero when that is what was owed", () => {
    const zero = { ...V3, token0: { ...V3.token0, amount: "0" } };
    expect(render(zero)).toContain("0 WTRX / 0.000009 USDT");
  });
});

describe("collect-fees receipt — V4", () => {
  const PRICED = {
    ...V4,
    token0: { address: TRX, symbol: "TRX", decimals: 6, amount: "13974" },
    token1: { address: USDT, symbol: "USDT", decimals: 6, amount: "4108" },
  };

  it("prints the amounts the fee read reported", () => {
    const out = render(PRICED);
    expect(out).toContain("Collected");
    expect(out).toContain("0.013974 TRX / 0.004108 USDT");
  });

  it("marks a dry run's figure as an estimate", () => {
    expect(render({ ...PRICED, mode: "dry-run" })).toContain("Collected (est)");
  });

  it("prints a zero that was measured", () => {
    const zero = {
      ...PRICED,
      token0: { ...PRICED.token0, amount: "0" },
      token1: { ...PRICED.token1, amount: "0" },
    };
    const out = render(zero);
    expect(out).toContain("0 TRX / 0 USDT");
    expect(out).not.toContain("position-list");
  });

  it("names both sides without printing an amount for them", () => {
    const out = render(V4);
    expect(out).toContain("TRX / USDT");
    expect(out).not.toContain("0 TRX");
    expect(out).not.toContain("Collected ");
  });

  it("says where the unclaimed figure can be found", () => {
    expect(render(V4)).toContain("sunswap position-list");
  });

  it("still reports the outcome", () => {
    const out = render(V4);
    expect(out).toContain("Fees collected");
    expect(out).toContain("3da4c902");
    expect(out).toContain("57,884,479");
  });
});
