import { describe, expect, it } from "vitest";
import { SunSwapFormatters } from "./sunswap.js";

const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const WIN = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const BTT = "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4";

const render = (
  prices: { address: string; priceUsd: string; quotedAt: string }[],
  symbols: [string, string][] = [],
) => SunSwapFormatters.sunswapPrice({ prices, view: { symbols: Object.fromEntries(symbols) } });

describe("sunswap price table", () => {
  it("renders PM 8.3.4's example rows", () => {
    const out = render(
      [
        { address: WIN, priceUsd: "0.000039609945", quotedAt: "2026-09-15 08:20" },
        { address: TRX, priceUsd: "0.33759495662", quotedAt: "2026-09-15 08:20" },
        { address: BTT, priceUsd: "0.000000327978", quotedAt: "2026-09-15 08:20" },
      ],
      [
        [WIN, "WIN"],
        [TRX, "TRX"],
        [BTT, "BTT"],
      ],
    );
    expect(out).toContain("$0.00003960");
    expect(out).toContain("$0.3376");
    expect(out).toContain("$0.0000003279");
    expect(out).toContain("Quoted at (UTC)");
  });

  // The address identifies the token; a catalogue symbol is only what the contract calls itself.
  it("always shows the address column", () => {
    expect(render([{ address: WIN, priceUsd: "1", quotedAt: "2026-09-15 08:20" }])).toContain(WIN);
  });

  it("writes an em dash for a symbol the catalogue did not know", () => {
    const out = render([{ address: WIN, priceUsd: "1", quotedAt: "2026-09-15 08:20" }]);
    expect(out).toContain("—");
  });

  // A zero price is what the service returns for an address it never indexed. It is shown as a
  // price, not as missing, because the service did answer.
  it("prints a zero price rather than blanking it", () => {
    const out = render([{ address: WIN, priceUsd: "0", quotedAt: "2026-09-15 08:20" }]);
    expect(out).toContain("$0.0000");
  });
});

const token = (over: Record<string, unknown> = {}) => ({
  address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  symbol: "TRX",
  name: "TRX",
  protocol: "ALL",
  priceUsd: "0.337713594502",
  reserveUsd: "295756284.245457787492589487",
  volumeUsd1d: "48536880.21582629762547943",
  priceUsd1dRate: "-0.0043",
  ...over,
});

const renderList = (
  tokens: ReturnType<typeof token>[],
  pagination = { offset: 0, limit: 3, total: null as number | null },
) => SunSwapFormatters.sunswapTokenList({ tokens, pagination });

describe("sunswap token table", () => {
  it("renders PM 8.1.4's example row", () => {
    const out = renderList([token()]);
    expect(out).toContain("Tokens (limit 3, offset 0)");
    expect(out).toContain("$0.3377");
    expect(out).toContain("$295,756,284.25");
    expect(out).toContain("$48,536,880.22");
    expect(out).toContain("-0.43%");
  });

  // Symbol and name alone cannot tell an impersonation from the token it copies.
  it("always shows the address, and the scope the row was measured in", () => {
    const out = renderList([token({ protocol: "V3" })]);
    expect(out).toContain("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb");
    expect(out).toContain("V3");
  });

  // Without the window, a short page is indistinguishable from the end of the data.
  it("titles the window, and says so when a total is known", () => {
    expect(renderList([token()], { offset: 20, limit: 5, total: null })).toContain(
      "Tokens (limit 5, offset 20)",
    );
    expect(renderList([token()], { offset: 0, limit: 5, total: 3 })).toContain(
      "Tokens (showing 1 of 3)",
    );
  });

  it("says (none) rather than printing an empty table", () => {
    expect(renderList([])).toBe("(none)");
  });

  it("writes an em dash for a rate it cannot read", () => {
    expect(renderList([token({ priceUsd1dRate: "" })])).toContain("—");
  });
});

const pool = (over: Record<string, unknown> = {}) => ({
  poolAddress: "TSUUVjysXV8YqHytSNjfkNXnnB49QDvZpx",
  protocol: "V3",
  feeRate: "0.0005",
  reserveUsd: "187903773.76",
  volumeUsd1d: "30616370.16",
  totalApr: "0.0320",
  tokens: [
    { address: "TNUC", symbol: "WTRX" },
    { address: "TR7N", symbol: "USDT" },
  ],
  extra: {},
  ...over,
});

const renderPools = (
  pools: ReturnType<typeof pool>[],
  view?: { quoteSymbol?: string },
  pagination = { offset: 0, limit: 3, total: null as number | null },
) =>
  SunSwapFormatters.sunswapPoolList({
    pools,
    pagination,
    ...(view === undefined ? {} : { view }),
  });

describe("sunswap pool table", () => {
  it("renders PM 7.3.4's example row", () => {
    const out = renderPools([pool()]);
    expect(out).toContain("Pools (limit 3, offset 0)");
    expect(out).toContain("WTRX/USDT");
    expect(out).toContain("0.05%");
    expect(out).toContain("$187,903,773.76");
    expect(out).toContain("3.20%");
  });

  // A truncated pool identifier is one nobody can paste into the next command.
  it("prints a 64-hex V4 pool id in full", () => {
    const id = "dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e";
    expect(renderPools([pool({ poolAddress: id, protocol: "V4" })])).toContain(id);
  });

  // A dynamic-fee pool reports 0, which would read as free. It is not free.
  it("writes dynamic rather than 0% for a dynamic-fee pool", () => {
    const out = renderPools([pool({ feeRate: "0", extra: { isDynamicFee: true } })]);
    expect(out).toContain("dynamic");
    expect(out).not.toMatch(/\|\s0%\s\|/);
  });

  it("adds the price column only when a quote token was given", () => {
    const priced = pool({ pairPrices: [{ base: "TNUC", quote: "TR7N", price: "0.342287437118" }] });
    const out = renderPools([priced], { quoteSymbol: "USDT" });
    expect(out).toContain("Price (USDT)");
    expect(out).toContain("0.342287 USDT");
    expect(renderPools([pool()])).not.toContain("Price (");
  });

  // A pool with more than two tokens has no single pairwise rate; json is the authority.
  it("writes an em dash where there is no single pair price", () => {
    const out = renderPools([pool({ pairPrices: [] })], { quoteSymbol: "USDT" });
    expect(out).toContain("—");
  });

  it("shows a real total when the search counted one", () => {
    expect(renderPools([pool()], undefined, { offset: 0, limit: 3, total: 81 })).toContain(
      "Pools (showing 1 of 81)",
    );
  });
});

const position = (over: Record<string, unknown> = {}) => ({
  protocol: "V4",
  status: "IN_RANGE",
  poolShare: "0.998537",
  lpBalanceUsd: "1960337.60",
  nftTokenId: "88",
  tokens: [{ symbol: "U" }, { symbol: "USDT" }],
  extra: { tokenRewardUsd: "386.25", positionLiquidity: "392657176790371861588" },
  ...over,
});

const renderPositions = (
  positions: ReturnType<typeof position>[],
  pagination = { offset: 8, limit: 4, total: null as number | null },
) => SunSwapFormatters.sunswapPositionList({ positions, pagination });

describe("sunswap position table", () => {
  it("renders PM 7.1.4's example row", () => {
    const out = renderPositions([position()]);
    expect(out).toContain("Positions (limit 4, offset 8)");
    expect(out).toContain("#88");
    expect(out).toContain("U/USDT");
    expect(out).toContain("$1,960,337.60");
    expect(out).toContain("99.8537%");
    expect(out).toContain("$386.25");
  });

  // Only V3/V4 positions are NFTs; an em dash means "no id exists", not "unknown".
  it("writes an em dash where a protocol has no position id", () => {
    const { nftTokenId: _omitted, ...withoutId } = position({ protocol: "V2", extra: {} });
    const out = renderPositions([withoutId as ReturnType<typeof position>]);
    expect(out).not.toContain("#");
    expect(out).toContain("—");
  });

  // Range status says nothing about a position with nothing in range. The json keeps the source
  // status, so a script reads extra.positionLiquidity rather than this cell.
  it("writes EMPTY when a V3/V4 position has no liquidity left", () => {
    const out = renderPositions([
      position({ status: "OUT_RANGE", extra: { positionLiquidity: "0" } }),
    ]);
    expect(out).toContain("EMPTY");
    expect(out).not.toContain("OUT_RANGE");
  });

  // A share above 100% cannot be true; printing it would be publishing an impossible number.
  it("blanks a share the source reports above 100%", () => {
    expect(renderPositions([position({ poolShare: "1.00067" })])).toContain("—");
  });

  // Fees accrue into the LP token on the full-range protocols: there is nothing unclaimed to
  // show, which is not the same as zero unclaimed.
  it("writes an em dash rather than a zero when there are no separable fees", () => {
    const out = renderPositions([position({ protocol: "V2", extra: {} })]);
    expect(out).toContain("—");
    expect(out).not.toContain("$0.00");
  });

  it("says (none) rather than printing an empty table", () => {
    expect(renderPositions([])).toBe("(none)");
  });
});

/** PM 7.2.4's V4 position, as the single-position renderer receives it. */
const positionInfo = (over: Record<string, unknown> = {}) => ({
  position: {
    nftTokenId: "88",
    owner: "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N",
    poolAddress: "61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e",
    protocol: "V4",
    status: "IN_RANGE",
    lpBalanceAmount: "392657176790371861588",
    lpBalanceUsd: "1960337.604921974103310348",
    poolShare: "0.998537379021518415",
    poolFeeRate: "0.0001",
    tokens: [
      {
        symbol: "U",
        decimals: 18,
        amount: "984154975046066985622761",
        rewardAmount: "192392895141706307962",
      },
      { symbol: "USDT", decimals: 6, amount: "976580959229", rewardAmount: "193934246" },
    ],
    extra: {
      tickLower: -276374,
      tickUpper: -276274,
      minPrice: "0.9950153585777257",
      maxPrice: "1.005014926708653",
      positionLiquidity: "392657176790371861588",
      tokenRewardUsd: "386.2484542373319",
      isDynamicFee: false,
    },
    ...over,
  },
});

describe("sunswap position detail", () => {
  /**
   * PM 7.2.4's text block, line for line.
   *
   * Every published field has a line here, so dropping one from the view — or rendering it from
   * the wrong side of the pair — fails this rather than quietly shrinking the output.
   */
  it("renders PM 7.2.4's V4 example", () => {
    const out = SunSwapFormatters.sunswapPositionInfo(positionInfo() as never);
    expect(out).toContain("Position     #88");
    expect(out).toContain("Owner        TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N");
    // the 64-hex pool id in full: a truncated identifier is one nobody can paste anywhere
    expect(out).toContain(
      "Pool         61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e",
    );
    expect(out).toContain("Protocol     V4");
    expect(out).toContain("Status       IN_RANGE");
    expect(out).toContain("Pair         U/USDT");
    expect(out).toContain("Amounts      984,154.975046 U / 976,580.959229 USDT");
    expect(out).toContain("Value        $1,960,337.60");
    expect(out).toContain("Price range  0.995015 – 1.005014 USDT per U");
    expect(out).toContain("Tick range   [-276374, -276274]");
    expect(out).toContain("Liquidity    392,657,176,790,371,861,588");
    expect(out).toContain("Unclaimed    192.392895 U / 193.934246 USDT  ($386.25)");
    expect(out).toContain("Pool share   99.8537%");
    expect(out).toContain("Pool fee     0.01%");
  });

  /**
   * A value nobody measured is an em dash, never $0.00.
   *
   * These keys are ABSENT from the json on a network with no price source, and the text has to
   * say the same thing: "$0.00" would read as a worthless position.
   */
  it("writes an em dash where there is no USD value, not a zero", () => {
    const { lpBalanceUsd: _usd, ...rest } = positionInfo().position;
    const { tokenRewardUsd: _reward, ...extra } = rest.extra;
    const out = SunSwapFormatters.sunswapPositionInfo({
      position: { ...rest, extra },
    } as never);
    expect(out).toContain("Value        —");
    expect(out).not.toContain("$0.00");
  });

  it("says EMPTY for a position whose liquidity is gone", () => {
    const out = SunSwapFormatters.sunswapPositionInfo(
      positionInfo({
        status: "OUT_RANGE",
        extra: { ...positionInfo().position.extra, positionLiquidity: "0" },
      }) as never,
    );
    expect(out).toContain("Status       EMPTY");
  });

  // A dynamic-fee pool reports 0, which would render as "0%" and read as a free pool.
  it("writes dynamic rather than 0% for a pool that prices itself per swap", () => {
    const out = SunSwapFormatters.sunswapPositionInfo(
      positionInfo({
        poolFeeRate: "0",
        extra: { ...positionInfo().position.extra, isDynamicFee: true },
      }) as never,
    );
    expect(out).toContain("Pool fee     dynamic");
  });

  it("writes an em dash for unclaimed fees nobody could read", () => {
    const position = positionInfo().position;
    const { tokenRewardUsd: _reward, ...extra } = position.extra;
    const out = SunSwapFormatters.sunswapPositionInfo({
      position: {
        ...position,
        extra,
        tokens: position.tokens.map(({ rewardAmount: _r, ...token }) => token),
      },
    } as never);
    expect(out).toContain("Unclaimed    —");
  });
});
