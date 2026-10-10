import { describe, it, expect, vi } from "vitest";
import { SunSwapPositionInfoService } from "./position-info-service.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { MarketDataPort, PriceRecord } from "../../../ports/sunswap/market-data.js";
import type { NetworkDescriptor, WarningView } from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js";

/** Mainnet, which has a price source — the branch where the USD fields may be published. */
const TRON = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  httpEndpoint: "https://api.trongrid.io",
  feeModel: "tron-resource",
  capabilities: [],
  sunswap: { marketApiBaseUrl: "https://open.sun.io" },
} as unknown as NetworkDescriptor;

/** Nile: the same contracts, no market API. Everything but the USD keys must still be published. */
const NILE = {
  ...TRON,
  id: "tron:3448148188",
  chainId: "3448148188",
  sunswap: {},
} as NetworkDescriptor;

const U = "TFNirp6PbqYE1ZTtWuCMUKJWLNZkoCoeFJ";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER = "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N";
const POOL_ID = "61446c8062cdc7f165946650c5ca6b6aa1809d19fcdf69b58824b01dd581333e";

/** Mainnet position 88: the amounts, the fees and the liquidity the market API reports for it. */
const AMOUNT0 = "984154975046066985622761";
const AMOUNT1 = "976580959229";
const REWARD0 = "192392895141706307962";
const REWARD1 = "193934246";
const LIQUIDITY = "392657176790371861588";

/**
 * `sqrt(P) * 2^96` for the pool price the market API's own derived amounts imply.
 *
 * Written out rather than computed, because the price (0.9999833482373381, in base units) has more
 * significant digits than a `number` literal may carry without losing some.
 */
const SQRT_PRICE = "79227502867239086850048";

const FACTS: Record<string, { address: string; decimals: number; symbol: string }> = {
  [U]: { address: U, decimals: 18, symbol: "U" },
  [USDT]: { address: USDT, decimals: 6, symbol: "USDT" },
};
const NAMES: Record<string, string> = { [U]: "United Stables", [USDT]: "Tether USD" };
const PRICES: Record<string, string> = {
  [U]: "0.999682975934",
  [USDT]: "0.999737704408",
};

function warnScope() {
  const warnings: (string | WarningView)[] = [];
  return { scope: { warn: (w: string | WarningView) => warnings.push(w) }, warnings };
}

function makeV4Port(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
  return {
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    tokenName: vi.fn(async (_n: NetworkDescriptor, address: string) => NAMES[address]),
    positionNftFacts: vi.fn(async () => ({
      name: "SunSwap V4 Positions NFT",
      symbol: "SUN-SWAP-V4-POSM",
    })),
    v4Position: vi.fn(async () => ({
      tokenId: "88",
      owner: OWNER,
      poolId: POOL_ID,
      currency0: U,
      currency1: USDT,
      fee: 100,
      tickSpacing: 1,
      hooks: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      tickLower: -276374,
      tickUpper: -276274,
      liquidity: LIQUIDITY,
      hasSubscriber: false,
    })),
    v4PoolState: vi.fn(async () => ({
      poolId: POOL_ID,
      exists: true,
      sqrtPriceX96: SQRT_PRICE,
      currentTick: -276300,
      liquidity: "393232335211814161588",
      currency0: U,
      currency1: USDT,
      fee: 100,
      tickSpacing: 1,
      hooks: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
      parameters: "0x0000000000000000000000000000000000000000000000000000000000010000",
    })),
    v4AmountsForLiquidity: vi.fn(() => ({ amount0: AMOUNT0, amount1: AMOUNT1 })),
    v4OwedFees: vi.fn(async () => ({ amount0: REWARD0, amount1: REWARD1 })),
    ...overrides,
  } as unknown as LiquidityPort;
}

function makeMarket(overrides: Partial<MarketDataPort> = {}): MarketDataPort {
  return {
    prices: vi.fn(
      async (_n: NetworkDescriptor, addresses: readonly string[]): Promise<PriceRecord[]> =>
        addresses.map((address) => ({
          address,
          priceUsd: PRICES[address] ?? "0",
          quotedAt: "2026-09-28 00:00",
        })),
    ),
    ...overrides,
  } as unknown as MarketDataPort;
}

describe("position-info — V4", () => {
  /**
   * The WHOLE published object, asserted exactly.
   *
   * Deliberately not a set of `toHaveProperty` checks: this command's entire job is publishing a
   * field-by-field description of a position, so a dropped key, a key published under another
   * name, or a value taken from the wrong side of the pair all have to fail here. A partial
   * assertion would let any of the three through.
   */
  it("publishes every field it can read, and nothing it cannot", async () => {
    const { scope, warnings } = warnScope();
    const service = new SunSwapPositionInfoService(makeV4Port(), makeMarket());
    const out = await service.positionInfo(scope, TRON, { protocol: "V4", positionId: "88" });

    expect(out).toEqual({
      position: {
        nftTokenId: "88",
        owner: OWNER,
        // a V4 pool has no address: the 64-hex pool id is what names it
        poolAddress: POOL_ID,
        protocol: "V4",
        status: "IN_RANGE",
        // read off the NFT contract, NOT the market API's strings
        lpTokenName: "SunSwap V4 Positions NFT",
        lpTokenSymbol: "SUN-SWAP-V4-POSM",
        lpBalanceAmount: LIQUIDITY,
        lpBalanceUsd: "1960167.780582466854511102",
        poolShare: "0.998537357256919140",
        poolFeeRate: "0.0001",
        tokens: [
          {
            address: U,
            symbol: "U",
            name: "United Stables",
            decimals: 18,
            amount: AMOUNT0,
            rewardAmount: REWARD0,
            priceUsd: "0.999682975934",
          },
          {
            address: USDT,
            symbol: "USDT",
            name: "Tether USD",
            decimals: 6,
            amount: AMOUNT1,
            rewardAmount: REWARD1,
            priceUsd: "0.999737704408",
          },
        ],
        extra: {
          tickLower: -276374,
          tickUpper: -276274,
          minPrice: "0.9950153585777257",
          maxPrice: "1.005014926708653",
          positionLiquidity: LIQUIDITY,
          tokenRewardUsd: "386.215279865955328950",
          // the market API's derived pair, reproduced from the pool price it implies — the last
          // digits differ only by the precision of the sqrt price this test can construct from a
          // double
          derivedToken0Amount: "1960752196340212367546053",
          derivedToken1Amount: "1960719546359",
          isDynamicFee: false,
          // the pool key's own word, without the 0x the read carries
          parameters: "0000000000000000000000000000000000000000000000000000000000010000",
          hasSubscriber: false,
        },
      },
    });
    expect(warnings).toEqual([]);
  });

  /**
   * The valuation, to eighteen places.
   *
   * Pinned separately from the shape above because it is the one place a `number` would survive
   * every structural check while quietly rewriting the figure: this sum has twenty-five
   * significant digits.
   *
   * IT IS NOT the market API's `lpBalanceUsd` (1960337.604921974103310348), and the gap is not a
   * bug here. This figure is exactly `amount0 * priceUsd0 + amount1 * priceUsd1` from the values
   * published alongside it, which is the only definition anyone can check; the market API's own
   * total does not reconcile with its own amounts and prices, and reproducing a figure we cannot
   * derive would mean copying it rather than computing it.
   */
  it("values the position exactly, past what a double could hold", async () => {
    const { scope } = warnScope();
    const service = new SunSwapPositionInfoService(makeV4Port(), makeMarket());
    const out = await service.positionInfo(scope, TRON, { protocol: "V4", positionId: "88" });
    expect(out.position.lpBalanceUsd).toBe("1960167.780582466854511102");
    expect(out.position.extra.tokenRewardUsd).toBe("386.215279865955328950");
  });

  it("names the hook only when the pool has one", async () => {
    const { scope } = warnScope();
    const hooked = makeV4Port({
      v4PoolState: vi.fn(async () => ({
        poolId: POOL_ID,
        exists: true,
        sqrtPriceX96: SQRT_PRICE,
        currentTick: -276300,
        liquidity: "393232335211814161588",
        currency0: U,
        currency1: USDT,
        fee: 100,
        tickSpacing: 1,
        hooks: "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP",
        parameters: "0x00",
      })),
    } as unknown as Partial<LiquidityPort>);
    const out = await new SunSwapPositionInfoService(hooked, makeMarket()).positionInfo(
      scope,
      TRON,
      { protocol: "V4", positionId: "88" },
    );
    expect(out.position.extra.hooksAddress).toBe("TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP");

    const { scope: plain } = warnScope();
    const unhooked = await new SunSwapPositionInfoService(makeV4Port(), makeMarket()).positionInfo(
      plain,
      TRON,
      { protocol: "V4", positionId: "88" },
    );
    // the zero address is ALSO native TRX's on TRON, so publishing it would say "hooked to TRX"
    expect("hooksAddress" in unhooked.position.extra).toBe(false);
  });
});

describe("position-info — a USD figure is a claim", () => {
  it("omits every USD key on a network with no price source, and says so", async () => {
    const { scope, warnings } = warnScope();
    const service = new SunSwapPositionInfoService(makeV4Port(), makeMarket());
    const out = await service.positionInfo(scope, NILE, { protocol: "V4", positionId: "88" });

    expect("lpBalanceUsd" in out.position).toBe(false);
    expect("tokenRewardUsd" in out.position.extra).toBe(false);
    for (const token of out.position.tokens) expect("priceUsd" in token).toBe(false);
    // and everything the chain does answer is still there
    expect(out.position.lpBalanceAmount).toBe(LIQUIDITY);
    expect(out.position.tokens[0]!.amount).toBe(AMOUNT0);
    expect(warnings).toEqual([expect.objectContaining({ code: "sunswap_prices_unavailable" })]);
  });

  it("treats the service's 0 as an unlisted token rather than a price of nothing", async () => {
    const { scope } = warnScope();
    const market = makeMarket({
      prices: vi.fn(async (_n: NetworkDescriptor, addresses: readonly string[]) =>
        addresses.map((address) => ({ address, priceUsd: "0", quotedAt: "" })),
      ),
    } as unknown as Partial<MarketDataPort>);
    const out = await new SunSwapPositionInfoService(makeV4Port(), market).positionInfo(
      scope,
      TRON,
      { protocol: "V4", positionId: "88" },
    );
    expect("lpBalanceUsd" in out.position).toBe(false);
    for (const token of out.position.tokens) expect("priceUsd" in token).toBe(false);
  });

  it("drops the total when only one side has a price, rather than halving it", async () => {
    const { scope } = warnScope();
    const market = makeMarket({
      prices: vi.fn(async () => [{ address: U, priceUsd: "0.999682975934", quotedAt: "" }]),
    } as unknown as Partial<MarketDataPort>);
    const out = await new SunSwapPositionInfoService(makeV4Port(), market).positionInfo(
      scope,
      TRON,
      { protocol: "V4", positionId: "88" },
    );
    expect(out.position.tokens[0]!.priceUsd).toBe("0.999682975934");
    expect("priceUsd" in out.position.tokens[1]!).toBe(false);
    expect("lpBalanceUsd" in out.position).toBe(false);
  });

  it("survives a price service that fails, with a warning and no USD", async () => {
    const { scope, warnings } = warnScope();
    const market = makeMarket({
      prices: vi.fn(async () => {
        throw new ChainError("provider_error", "boom");
      }),
    } as unknown as Partial<MarketDataPort>);
    const out = await new SunSwapPositionInfoService(makeV4Port(), market).positionInfo(
      scope,
      TRON,
      { protocol: "V4", positionId: "88" },
    );
    expect("lpBalanceUsd" in out.position).toBe(false);
    expect(warnings).toEqual([expect.objectContaining({ code: "sunswap_prices_unavailable" })]);
  });
});

describe("position-info — unclaimed fees", () => {
  it("publishes no amount at all when the fee read cannot answer, never a zero", async () => {
    const { scope, warnings } = warnScope();
    const port = makeV4Port({ v4OwedFees: vi.fn(async () => undefined) } as Partial<LiquidityPort>);
    const out = await new SunSwapPositionInfoService(port, makeMarket()).positionInfo(scope, TRON, {
      protocol: "V4",
      positionId: "88",
    });
    for (const token of out.position.tokens) expect("rewardAmount" in token).toBe(false);
    expect("tokenRewardUsd" in out.position.extra).toBe(false);
    expect(warnings).toEqual([expect.objectContaining({ code: "sunswap_owed_fees_undecodable" })]);
  });

  it("publishes a measured zero, which is a different fact", async () => {
    const { scope } = warnScope();
    const port = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: "0", amount1: "0" })),
    } as unknown as Partial<LiquidityPort>);
    const out = await new SunSwapPositionInfoService(port, makeMarket()).positionInfo(scope, TRON, {
      protocol: "V4",
      positionId: "88",
    });
    expect(out.position.tokens.map((token) => token.rewardAmount)).toEqual(["0", "0"]);
    expect(out.position.extra.tokenRewardUsd).toBe("0.000000000000000000");
  });
});

describe("position-info — refusals", () => {
  it("turns a revert on the id into position_not_found", async () => {
    const { scope } = warnScope();
    const port = makeV4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }),
    } as unknown as Partial<LiquidityPort>);
    await expect(
      new SunSwapPositionInfoService(port, makeMarket()).positionInfo(scope, TRON, {
        protocol: "V4",
        positionId: "99999999",
      }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  /**
   * An outage must not be reported as a missing position: a caller told "no such position" stops
   * looking, while one told "nobody answered" retries.
   */
  it("lets a timeout keep its own code", async () => {
    const { scope } = warnScope();
    const port = makeV4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("timeout", "the node did not answer");
      }),
    } as unknown as Partial<LiquidityPort>);
    await expect(
      new SunSwapPositionInfoService(port, makeMarket()).positionInfo(scope, TRON, {
        protocol: "V4",
        positionId: "88",
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("refuses a protocol that has no position ids, and a malformed id", async () => {
    const { scope } = warnScope();
    const service = new SunSwapPositionInfoService(makeV4Port(), makeMarket());
    await expect(
      service.positionInfo(scope, TRON, { protocol: "V2", positionId: "1" }),
    ).rejects.toMatchObject({ code: "invalid_value" });
    await expect(
      service.positionInfo(scope, TRON, { protocol: "V4", positionId: "-1" }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});

describe("position-info — V3", () => {
  const V3_POOL = "THiFr5PQX28AFPFgg3G1YP2er6EFNiXoCS";

  function makeV3Port(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
    return {
      tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
      tokenName: vi.fn(async (_n: NetworkDescriptor, address: string) => NAMES[address]),
      positionNftFacts: vi.fn(async () => ({
        name: "Sunswap V3 Positions NFT-V1",
        symbol: "SUN-V3-POS",
      })),
      v3Position: vi.fn(async () => ({
        tokenId: "1845",
        owner: OWNER,
        token0: U,
        token1: USDT,
        fee: 3000,
        tickLower: -12480,
        tickUpper: -9480,
        liquidity: "110912740081",
      })),
      v3PoolState: vi.fn(async () => ({
        poolAddress: V3_POOL,
        exists: true,
        sqrtPriceX96: SQRT_PRICE,
        currentTick: -11000,
        fee: 3000,
        token0: U,
        liquidity: "284258342196",
      })),
      v3AmountsForLiquidity: vi.fn(() => ({ amount0: AMOUNT0, amount1: AMOUNT1 })),
      v3OwedFees: vi.fn(async () => ({ amount0: REWARD0, amount1: REWARD1 })),
      ...overrides,
    } as unknown as LiquidityPort;
  }

  /**
   * V3's `extra` carries NO V4 key — not a zero, not a false, not an
   * empty string. The assertion is on the key SET, because a `derivedToken0Amount: undefined`
   * would pass any value check and still change the json.
   */
  it("publishes the V3 shape, with a pool ADDRESS and none of V4's extra keys", async () => {
    const { scope } = warnScope();
    const out = await new SunSwapPositionInfoService(makeV3Port(), makeMarket()).positionInfo(
      scope,
      TRON,
      { protocol: "V3", positionId: "1845" },
    );
    expect(out.position.poolAddress).toBe(V3_POOL);
    expect(out.position.protocol).toBe("V3");
    expect(out.position.lpTokenSymbol).toBe("SUN-V3-POS");
    expect(out.position.poolFeeRate).toBe("0.003");
    expect(Object.keys(out.position.extra).sort()).toEqual([
      "maxPrice",
      "minPrice",
      "positionLiquidity",
      "tickLower",
      "tickUpper",
      "tokenRewardUsd",
    ]);
  });

  it("is out of range when the pool's tick has left the position's band", async () => {
    const { scope } = warnScope();
    const port = makeV3Port({
      v3PoolState: vi.fn(async () => ({
        poolAddress: V3_POOL,
        exists: true,
        sqrtPriceX96: SQRT_PRICE,
        currentTick: -9480,
        fee: 3000,
        token0: U,
        liquidity: "284258342196",
      })),
    } as unknown as Partial<LiquidityPort>);
    const out = await new SunSwapPositionInfoService(port, makeMarket()).positionInfo(scope, TRON, {
      protocol: "V3",
      positionId: "1845",
    });
    expect(out.position.status).toBe("OUT_RANGE");
    // it holds none of the pool's ACTIVE liquidity while it is out of range
    expect(out.position.poolShare).toBe("0");
  });
});
