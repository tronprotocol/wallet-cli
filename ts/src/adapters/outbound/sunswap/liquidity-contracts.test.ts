import { describe, expect, it } from "vitest";
import { TickMath } from "@sun-protocol/sun-sdk-sunswap-v3";
import { SunSwapLiquidityContracts } from "./liquidity-contracts.js";

/** The sqrt price AT a tick — the lower edge of its band, which is what V3 sizes from. */
const sqrtAt = (tick: number): string => TickMath.getSqrtRatioAtTick(tick).toString();
/** Measured: the sqrt price at tick -85, which is NOT the real Nile pool's price. */
const TICK_SQRT = sqrtAt(-85);
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
  sunswap: {
    contracts: {
      v2Router: "TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy",
      v3PositionManager: "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R",
      wtrx: "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
    },
  },
} as NetworkDescriptor;

const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const FACTORY = "THomLGMLhAjMecQf9FQjbZ8a1RtwsZLrGE";
const PAIR = "TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh";

/** a 32-byte word holding a TRON address's low 20 bytes, the way an ABI return carries one. */
const addressWord = (hex20: string) => "0".repeat(24) + hex20;
const uint = (value: bigint | number) => BigInt(value).toString(16).padStart(64, "0");

/** hex-20 bodies of the addresses above, as the contracts return them. */
const HEX = {
  factory: "55f7d5d874a73f21c0851c62d374307985f440fc",
  pair: "6af7a2b30e6e90f6907b440aebe6c7f5cb82f321",
  usdt: "eca9bc828a3005b9a3b909f2cc5c2a54794de05f",
  wtrx: "fb3b3134f13ccd2c81f4012e53024e8135d58fee",
};

/** build a gateway whose constant calls answer from a scripted table. */
function gatewayAnswering(answers: Record<string, string>, seen: string[] = []) {
  return {
    get: () => ({
      triggerConstantContract: async (
        contract: string,
        method: string,
        parameters: { type: string; value: unknown }[],
      ) => {
        // `method` already carries its own parentheses; the arguments go after it
        seen.push(`${contract}:${method} [${parameters.map((p) => String(p.value)).join(",")}]`);
        const answer = answers[`${contract}:${method}`] ?? answers[method];
        if (answer === undefined) throw new Error(`unscripted call ${contract}:${method}`);
        return [answer];
      },
    }),
  } as unknown as ChainGatewayProvider;
}

describe("tokenFacts", () => {
  // decimals converts a human amount into base units, so a wrong one moves the decimal point on
  // somebody's deposit. It comes from the token contract, never from a market DTO.
  it("reads decimals and symbol from the token contract itself", async () => {
    const port = new SunSwapLiquidityContracts(
      gatewayAnswering({
        "decimals()": uint(6),
        "symbol()": `${uint(32)}${uint(4)}${Buffer.from("USDT").toString("hex").padEnd(64, "0")}`,
      }),
    );
    await expect(port.tokenFacts(NILE, USDT)).resolves.toEqual({
      address: USDT,
      decimals: 6,
      symbol: "USDT",
    });
  });
});

describe("v2PairState", () => {
  const answers = {
    "factory()": addressWord(HEX.factory),
    "getPair(address,address)": addressWord(HEX.pair),
    "getReserves()": `${uint(8971373980412n)}${uint(6154765875016n)}${uint(1758000000)}`,
    "totalSupply()": uint(6877486283243n),
    // The LP token's own decimals, asked for rather than assumed: it scales what the caller is
    // told they will receive.
    "decimals()": uint(18),
  };

  /**
   * A pair stores its reserves in ITS OWN token order, which is sorted and need not match the
   * order the caller named. Reading `token0()` and swapping is what keeps a deposit from being
   * paired against the wrong reserve — the most expensive mistake available on this path.
   */
  it("returns reserves in the caller's token order, not the pair's", async () => {
    const forward = new SunSwapLiquidityContracts(
      gatewayAnswering({ ...answers, "token0()": addressWord(HEX.usdt) }),
    );
    await expect(forward.v2PairState(NILE, USDT, WTRX)).resolves.toMatchObject({
      pairAddress: PAIR,
      reserve0: "8971373980412",
      reserve1: "6154765875016",
    });

    // same pool, opposite order asked for: the reserves must come back swapped
    const reversed = new SunSwapLiquidityContracts(
      gatewayAnswering({ ...answers, "token0()": addressWord(HEX.usdt) }),
    );
    await expect(reversed.v2PairState(NILE, WTRX, USDT)).resolves.toMatchObject({
      reserve0: "6154765875016",
      reserve1: "8971373980412",
    });
  });

  it("reports a pair the factory has never created rather than inventing one", async () => {
    const port = new SunSwapLiquidityContracts(
      gatewayAnswering({
        "factory()": addressWord(HEX.factory),
        "getPair(address,address)": addressWord("0".repeat(40)),
      }),
    );
    await expect(port.v2PairState(NILE, USDT, WTRX)).resolves.toEqual({
      pairAddress: "",
      reserve0: "0",
      reserve1: "0",
      totalSupply: "0",
      lpDecimals: 0,
      exists: false,
    });
  });

  it("asks the router which factory to use rather than assuming one", async () => {
    const seen: string[] = [];
    const port = new SunSwapLiquidityContracts(
      gatewayAnswering({ ...answers, "token0()": addressWord(HEX.usdt) }, seen),
    );
    await port.v2PairState(NILE, USDT, WTRX);
    expect(seen[0]).toBe("TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy:factory() []");
    expect(seen[1]).toBe(`${FACTORY}:getPair(address,address) [${USDT},${WTRX}]`);
  });
});

describe("allowance", () => {
  it("reads the spender's current allowance as base units", async () => {
    const port = new SunSwapLiquidityContracts(
      gatewayAnswering({ "allowance(address,address)": uint(1234567890123456789n) }),
    );
    await expect(port.allowance(NILE, USDT, "TOwner", "TSpender")).resolves.toBe(
      "1234567890123456789",
    );
  });
});

describe("approvalPayload", () => {
  /**
   * Exactly the amount, never MAX_UINT256. An unbounded approval leaves the router able to move
   * that token forever, and this path knows precisely how much it needs.
   */
  it("approves the exact amount", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    expect(port.approvalPayload(NILE, USDT, "TSpender", "1000000")).toEqual({
      target: USDT,
      method: "approve(address,uint256)",
      parameters: [
        { type: "address", value: "TSpender" },
        { type: "uint256", value: "1000000" },
      ],
    });
  });

  it("never emits an unbounded approval", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    const max = (2n ** 256n - 1n).toString();
    const payload = port.approvalPayload(NILE, USDT, "TSpender", "5");
    expect(payload.parameters[1]?.value).not.toBe(max);
  });
});

describe("v2AddLiquidityPayload", () => {
  const request = {
    token0: { address: USDT, decimals: 6, symbol: "USDT" },
    token1: { address: WTRX, decimals: 6, symbol: "WTRX" },
    amount0Desired: "1000000",
    amount1Desired: "2000000",
    amount0Min: "950000",
    amount1Min: "1900000",
    recipient: "TRecipient",
    deadline: 1790000000,
  };

  it("targets the configured router and lays the arguments out in the contract's order", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    const payload = port.v2AddLiquidityPayload(NILE, request);
    expect(payload.target).toBe("TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy");
    expect(payload.method).toBe(
      "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
    );
    expect(payload.parameters.map((p) => p.value)).toEqual([
      USDT,
      WTRX,
      "1000000",
      "2000000",
      "950000",
      "1900000",
      "TRecipient",
      "1790000000",
    ]);
  });

  // Parameters cross as {type, value} rather than encoded calldata, so the gateway's encoder is
  // the only one in the process.
  it("hands over typed parameters rather than calldata", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    const payload = port.v2AddLiquidityPayload(NILE, request);
    expect(payload.parameters.map((p) => p.type)).toEqual([
      "address",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "address",
      "uint256",
    ]);
    expect(payload).not.toHaveProperty("parameter");
  });

  it("refuses a network with no router configured rather than guessing one", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    const bare = { ...NILE, sunswap: undefined } as NetworkDescriptor;
    expect(() => port.v2AddLiquidityPayload(bare, request)).toThrow(
      /has no SunSwap V2 router configured/,
    );
  });
});

/**
 * Both protocols size from the POOL'S OWN PRICE, through one implementation.
 *
 * This block has been rewritten twice because the facts changed twice, which is what tests are for.
 * The history is the finding:
 *
 * 1. Both used the price of the current TICK — the lower edge of a price band. Imprecise.
 * 2. A real Nile V4 mint REVERTED on it, and the contract named both figures: our ceiling 170007
 *    against 172953 required. 1.73% short, not a rounding unit, because the range spanned only 35
 *    ticks above its lower bound and a sub-tick difference is amplified across so narrow a span.
 * 3. V4 was fixed to the pool's price. V3 kept the tick, on the grounds that its bound is a FLOOR so
 *    nothing reverts — and that was judged not good enough: the caller still deposits a ratio they
 *    did not ask for and takes less liquidity than their money should buy, and the withdrawal
 *    estimate goes in front of a person in a receipt.
 *
 * So the two agree again, and now they agree on the right price. The lesson that generalises: the
 * bound inversion does not merely change a default, it changes whether an APPROXIMATION IS SAFE. The
 * same arithmetic was conservative on V3 and fatal on V4, purely because of which side the bound sat.
 */
describe("sizing uses the pool's own price, on both protocols", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);

  /** Real Nile V4 pool: tick -85, spacing 12, and its actual price, which is NOT the tick's. */
  const RANGE = { tickLower: -120, tickUpper: 120 };
  const TICK = -85;
  const REAL_SQRT = "78894563934534620073206563176";
  const v4Pool = { currentTick: TICK, sqrtPriceX96: REAL_SQRT, exists: true } as never;
  const v3Pool = { currentTick: TICK, sqrtPriceX96: REAL_SQRT, exists: true } as never;

  it.each([
    ["token0 named", { amount0: "1000000" }],
    ["token1 named", { amount1: "1000000" }],
    ["both named", { amount0: "1000000", amount1: "2000000" }],
  ])("gives V3 and V4 the same answer, %s", (_name, given) => {
    expect(contracts.v4Amounts(v4Pool, RANGE, given)).toEqual(
      contracts.v3Amounts(v3Pool, RANGE, given),
    );
  });

  /**
   * And that answer is NOT the tick-edge one. If it were, the mint that reverted would revert again,
   * so this is the case that pins the fix rather than merely the agreement.
   */
  it("is not the answer the tick's price gives", () => {
    const real = contracts.v4Amounts(v4Pool, RANGE, { amount0: "1000000" });
    const atTickEdge = contracts.v4Amounts(
      { currentTick: TICK, sqrtPriceX96: TICK_SQRT, exists: true } as never,
      RANGE,
      { amount0: "1000000" },
    );
    // Higher: the tick is the band's lower edge, which understates what the deposit costs. 170007 is
    // the exact ceiling the contract rejected.
    expect(BigInt(real.amount1)).toBeGreaterThan(BigInt(atTickEdge.amount1));
    expect(atTickEdge.amount1).toBe("170007");
  });

  /**
   * THE CEILING IS THE SIZED AMOUNTS, reproduced to the unit against the contract's own revert data.
   *
   * The contract takes the LIQUIDITY and recomputes what it costs at the pool's real price, rounding
   * up — which is what sizing already does. So no separate ceiling calculation exists; one would only
   * be somewhere for two numbers to drift apart. Pricing the reverted mint's own liquidity of
   * 97650829 this way gives 997030 and 172953, and 172953 is the figure the contract demanded.
   */
  it("reproduces the contract's own required amounts for the liquidity it reverted on", () => {
    expect(contracts.v4AmountsForLiquidityCeiling(v4Pool, RANGE, "97650829")).toEqual({
      amount0: "997030",
      amount1: "172953",
    });
  });

  it("a plan's amounts are the ceiling for its own liquidity", () => {
    const plan = contracts.v4Amounts(v4Pool, RANGE, { amount0: "1000000" });
    expect(contracts.v4AmountsForLiquidityCeiling(v4Pool, RANGE, plan.liquidity)).toEqual({
      amount0: plan.amount0,
      amount1: plan.amount1,
    });
  });

  it("sizes both sides of an in-range deposit", () => {
    const plan = contracts.v4Amounts(v4Pool, RANGE, { amount0: "1000000" });
    expect(BigInt(plan.amount0)).toBeGreaterThan(0n);
    expect(BigInt(plan.amount1)).toBeGreaterThan(0n);
    expect(BigInt(plan.liquidity)).toBeGreaterThan(0n);
  });

  it.each([
    ["above the range", { amount0: "1" }, 20000, /takes only token1/],
    ["below the range", { amount1: "1" }, -20000, /takes only token0/],
  ])("refuses a one-sided range named from the wrong side, %s", (_name, given, tick, message) => {
    const moved = { currentTick: tick, sqrtPriceX96: sqrtAt(tick), exists: true } as never;
    expect(() => contracts.v4Amounts(moved, RANGE, given)).toThrow(message);
  });

  /**
   * A HAZARD THAT ARRIVED WITH THE FIX. A pool the factory never created, or one nothing has
   * initialised, reports `sqrtPriceX96: "0"`. The tick-edge version never had a zero to worry about —
   * the sqrt ratio at tick 0 is a real price — so feeding one in is a new way to get a plausible
   * answer out of nothing. Refused on both protocols, naming what is missing rather than malformed.
   *
   * The message says nothing has INITIALISED the pool, not that nothing has been deposited into it —
   * a V4 pool can be initialised, and so have a real price, while holding no liquidity at all, and a
   * reader holding one of those would otherwise draw the wrong conclusion about why they are refused.
   *
   * `--create-pool` is the one caller entitled to size against a pool with no chain price, and it
   * does not come through here: it sizes against the `--sqrt-price` the caller supplied.
   */
  it.each([
    ["v4Amounts", () => contracts.v4Amounts(EMPTY, RANGE, { amount0: "1" })],
    ["v3Amounts", () => contracts.v3Amounts(EMPTY, RANGE, { amount0: "1" })],
    ["v4AmountsForLiquidity", () => contracts.v4AmountsForLiquidity(EMPTY, RANGE, "1")],
    ["v3AmountsForLiquidity", () => contracts.v3AmountsForLiquidity(EMPTY, RANGE, "1")],
    [
      "v4AmountsForLiquidityCeiling",
      () => contracts.v4AmountsForLiquidityCeiling(EMPTY, RANGE, "1"),
    ],
  ])("refuses a pool with no price, in %s", (_name, call) => {
    expect(call).toThrow(expect.objectContaining({ code: "pool_not_found" }));
  });

  it("says the pool is uninitialised, not that it is empty", () => {
    expect(() => contracts.v4Amounts(EMPTY, RANGE, { amount0: "1" })).toThrow(
      /nothing has initialised it/,
    );
    expect(() => contracts.v4Amounts(EMPTY, RANGE, { amount0: "1" })).not.toThrow(
      /nothing has been deposited/,
    );
  });

  // And a supplied price is accepted, which is how `--create-pool` sizes against a pool that has no
  // chain price of its own.
  it("accepts a price the caller supplied for a pool that does not exist yet", () => {
    const creating = { currentTick: 0, sqrtPriceX96: REAL_SQRT, exists: false } as never;
    expect(
      BigInt(contracts.v4Amounts(creating, RANGE, { amount0: "1000000" }).liquidity),
    ).toBeGreaterThan(0n);
  });
});

/** A pool the factory never created: the shape `v3PoolState` and `v4PoolState` both report. */
const EMPTY = { currentTick: 0, sqrtPriceX96: "0", exists: false } as never;

describe("the sizing round trip rounds outward", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const RANGE = { tickLower: -9000, tickUpper: 9000 };
  const pool = { currentTick: -85, sqrtPriceX96: "78894563934534620073206563176" } as never;

  it("never reports a ceiling below what the same liquidity is worth", () => {
    const plan = contracts.v4Amounts(pool, RANGE, { amount0: "1000000" });
    const worth = contracts.v4AmountsForLiquidity(pool, RANGE, plan.liquidity);
    expect(BigInt(plan.amount0)).toBeGreaterThanOrEqual(BigInt(worth.amount0));
    expect(BigInt(plan.amount1)).toBeGreaterThanOrEqual(BigInt(worth.amount1));
  });

  /**
   * And the two are not simply the same number. If they were, the rounding would be doing nothing and
   * the guarantee above would be accidental — so at least one side must differ on a figure whose
   * exact value is fractional.
   */
  it("differs from the withdrawal figure, so the rounding is real", () => {
    const plan = contracts.v4Amounts(pool, RANGE, { amount0: "1000001" });
    const worth = contracts.v4AmountsForLiquidity(pool, RANGE, plan.liquidity);
    const grew =
      BigInt(plan.amount0) > BigInt(worth.amount0) || BigInt(plan.amount1) > BigInt(worth.amount1);
    expect(grew).toBe(true);
  });
});

/**
 * The V4 deposit call, held against the shape measured on Nile.
 *
 * Two real mints established it: with no permits a bare `modifyLiquidities`, and with them a
 * `multicall(bytes[])` carrying one Permit2 forward call per token and THEN the deposit — 8 logs
 * against the bare call's 6, so the forwarding happens rather than being accepted and ignored.
 */
describe("the V4 deposit payload", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

  /** The real Nile USDC/USDT V4 pool: fee 500, spacing 12, no hooks. */
  const pool = {
    currency0: "TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3",
    currency1: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    hooks: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
    fee: 500,
    parameters: "0x00000000000000000000000000000000000000000000000000000000000c0000",
  };
  const base = {
    pool,
    tickLower: -120,
    tickUpper: 120,
    liquidity: "97941773",
    amount0Max: "1000000",
    amount1Max: "173468",
    owner: OWNER,
    sweepRecipient: OWNER,
    deadline: 1790240000,
    permits: [],
  };
  const grant = (amount: string) => ({
    grant: {
      details: { token: pool.currency0, amount, expiration: "1790240349", nonce: "0" },
      spender: MANAGER,
      sigDeadline: "1790240349",
    },
    signature: `0x${"ab".repeat(65)}`,
  });

  it("is a bare modifyLiquidities when no permit is needed", () => {
    const payload = contracts.v4DepositPayload(NILE, base);
    expect(payload.target).toBe(MANAGER);
    expect(payload.method).toBe("modifyLiquidities(bytes,uint256)");
    expect(payload.parameters).toHaveLength(2);
  });

  /**
   * And a multicall when permits travel with it, with the permits FIRST. The order is not incidental:
   * a forward call after the deposit would authorize a pull that has already been attempted.
   */
  it("wraps the deposit in a multicall behind its permits", () => {
    const payload = contracts.v4DepositPayload(NILE, {
      ...base,
      permits: [grant("1000000"), grant("173468")],
    });
    expect(payload.target).toBe(MANAGER);
    expect(payload.method).toBe("multicall(bytes[])");
    const calls = payload.parameters[0]!.value as readonly string[];
    expect(calls).toHaveLength(3);
    // The last entry is the deposit; the two before it are the grants.
    expect(calls[2]).not.toBe(calls[0]);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it("carries one call per permit, plus the deposit", () => {
    const one = contracts.v4DepositPayload(NILE, { ...base, permits: [grant("1000000")] });
    expect(one.parameters[0]!.value as readonly string[]).toHaveLength(2);
  });

  // A token deposit sends no TRX, so the payload carries no call value at all rather than "0".
  it("sends no TRX for a token pair", () => {
    expect(contracts.v4DepositPayload(NILE, base).callValueSun).toBeUndefined();
  });

  /**
   * Everything the caller set must be IN the encoded call, so changing it must change the bytes. A
   * value that made no difference would be one the payload was quietly ignoring.
   */
  it.each([
    ["the ceiling", { amount1Max: "173469" }],
    ["the range", { tickUpper: 132 }],
    ["the liquidity", { liquidity: "97941774" }],
  ])("changes the encoded call when %s changes", (_name, change) => {
    const before = contracts.v4DepositPayload(NILE, base);
    const after = contracts.v4DepositPayload(NILE, { ...base, ...change });
    expect(JSON.stringify(after.parameters)).not.toBe(JSON.stringify(before.parameters));
  });

  /**
   * SWEEPRECIPIENT MATTERS ONLY WHEN A NATIVE CURRENCY IS INVOLVED, which is measured rather than
   * assumed — and the first version of the case above asserted otherwise and failed.
   *
   * On a token pair it changes NOTHING, because there is nothing to sweep: the contract pulls exactly
   * what it needs through Permit2, so no excess is ever sitting in the position manager. On a native
   * pair the CEILING is sent up front as the call's value, so whatever the pool does not take has to be
   * returned, and the recipient is encoded.
   *
   * This is why it is set on every call rather than only where it bites: the same request shape serves
   * both, and a caller should not have to know which pools make it load-bearing.
   */
  it("has no effect on a token pair, because nothing can be left over", () => {
    const one = contracts.v4DepositPayload(NILE, { ...base, sweepRecipient: OWNER });
    const two = contracts.v4DepositPayload(NILE, { ...base, sweepRecipient: pool.currency0 });
    expect(JSON.stringify(two.parameters)).toBe(JSON.stringify(one.parameters));
    expect(one.callValueSun).toBeUndefined();
  });

  it("is encoded on a native pair, where the ceiling is sent as the call's value", () => {
    const native = {
      ...base,
      pool: { ...pool, currency0: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" },
    };
    const one = contracts.v4DepositPayload(NILE, { ...native, sweepRecipient: OWNER });
    const two = contracts.v4DepositPayload(NILE, { ...native, sweepRecipient: pool.currency1 });
    expect(JSON.stringify(two.parameters)).not.toBe(JSON.stringify(one.parameters));
    // The TRX ceiling travels as the call's value, so a native deposit sends the CEILING and gets the
    // remainder swept back — not the amount the pool actually takes.
    expect(one.callValueSun).toBe(base.amount0Max);
  });
});

/**
 * The V4 increase call: more liquidity into a position that already exists.
 *
 * Held against the deposit above, because an increase IS a deposit — same position manager, same
 * `modifyLiquidities`, same ceiling bounding it from ABOVE, same multicall when grants travel with
 * it. What must differ is what the position already fixes: it is named by its token id, and its range
 * is its own rather than a parameter.
 */
describe("the V4 increase payload", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

  /** The real Nile USDC/USDT V4 pool: fee 500, spacing 12, no hooks. */
  const pool = {
    currency0: "TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3",
    currency1: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    hooks: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
    fee: 500,
    parameters: "0x00000000000000000000000000000000000000000000000000000000000c0000",
  };
  const base = {
    pool,
    tokenId: "12",
    liquidity: "97941773",
    amount0Max: "1000000",
    amount1Max: "173468",
    owner: OWNER,
    sweepRecipient: OWNER,
    deadline: 1790240000,
    permits: [],
  };
  const grant = (amount: string) => ({
    grant: {
      details: { token: pool.currency1, amount, expiration: "1790240349", nonce: "0" },
      spender: MANAGER,
      sigDeadline: "1790240349",
    },
    signature: `0x${"ab".repeat(65)}`,
  });

  it("is a bare modifyLiquidities when no grant is needed", () => {
    const payload = contracts.v4IncreasePayload(NILE, base);
    expect(payload.target).toBe(MANAGER);
    expect(payload.method).toBe("modifyLiquidities(bytes,uint256)");
    expect(payload.parameters).toHaveLength(2);
  });

  // Grants FIRST, then the increase — a forward call after it would authorize a pull already tried.
  it("wraps the increase in a multicall behind its grants", () => {
    const payload = contracts.v4IncreasePayload(NILE, { ...base, permits: [grant("173468")] });
    expect(payload.method).toBe("multicall(bytes[])");
    const calls = payload.parameters[0]!.value as readonly string[];
    expect(calls).toHaveLength(2);
    // The increase is last, and it is the same bytes the bare call carries.
    const bare = contracts.v4IncreasePayload(NILE, base);
    expect(calls[1]).toContain((bare.parameters[0]!.value as string).replace(/^0x/, ""));
  });

  /**
   * EVERY VALUE THE CALLER SET MUST BE IN THE ENCODED CALL.
   *
   * A value that made no difference to the bytes would be one the payload was quietly dropping — and
   * dropping the token id in particular would send the liquidity into whatever position the contract
   * defaulted to. Each case here fails if its field stops reaching the encoder.
   */
  it.each([
    ["the position", { tokenId: "13" }],
    ["the liquidity", { liquidity: "97941774" }],
    ["the ceiling on currency0", { amount0Max: "1000001" }],
    ["the ceiling on currency1", { amount1Max: "173469" }],
    ["the deadline", { deadline: 1790240001 }],
    // The currencies DO reach the bytes: they are what the two settles name.
    ["a currency", { pool: { ...pool, currency1: "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a" } }],
  ])("changes the encoded call when %s changes", (_name, change) => {
    const before = contracts.v4IncreasePayload(NILE, base);
    const after = contracts.v4IncreasePayload(NILE, { ...base, ...change });
    expect(JSON.stringify(after.parameters)).not.toBe(JSON.stringify(before.parameters));
  });

  /**
   * AND THE TIER AND THE SPACING DO NOT — which is a fact about the protocol, not an omission.
   *
   * An increase's actions are the increase itself and one settle per currency. The pool is chosen by
   * the TOKEN ID on chain, so the tier and the `parameters` word have nothing to encode into; a mint
   * has to carry the whole key because it has no position to inherit one from. The first version of
   * the case above asserted otherwise and failed, which is how this was found.
   */
  it("does not encode the tier or the spacing, which the position id already settles", () => {
    const before = contracts.v4IncreasePayload(NILE, base);
    for (const key of [
      { ...pool, fee: 3000 },
      // spacing 60 rather than 12, in the layout a real pool's own word uses.
      { ...pool, parameters: `0x${"0".repeat(58)}3c0000` },
    ]) {
      const after = contracts.v4IncreasePayload(NILE, { ...base, pool: key });
      expect(JSON.stringify(after.parameters)).toBe(JSON.stringify(before.parameters));
    }
  });

  /**
   * `sweepRecipient` bites only on a native pair — measured on the deposit, and the same here for the
   * same reason: on a token pair the contract pulls exactly what it needs through Permit2, so there is
   * never an excess sitting in the position manager.
   */
  it("has no effect on a token pair, because nothing can be left over", () => {
    const one = contracts.v4IncreasePayload(NILE, { ...base, sweepRecipient: OWNER });
    const two = contracts.v4IncreasePayload(NILE, { ...base, sweepRecipient: pool.currency0 });
    expect(JSON.stringify(two.parameters)).toBe(JSON.stringify(one.parameters));
    expect(one.callValueSun).toBeUndefined();
  });

  const native = { ...base, pool: { ...pool, currency0: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb" } };

  it("sends the CEILING as the call's value on a native pair, and encodes where the rest returns", () => {
    const one = contracts.v4IncreasePayload(NILE, { ...native, sweepRecipient: OWNER });
    const two = contracts.v4IncreasePayload(NILE, { ...native, sweepRecipient: pool.currency1 });
    expect(JSON.stringify(two.parameters)).not.toBe(JSON.stringify(one.parameters));
    expect(one.callValueSun).toBe(base.amount0Max);
  });

  /**
   * AND THE CALL VALUE SURVIVES THE MULTICALL.
   *
   * `buildV4MulticallAction` computes no call value of its own — only the inner action knows a native
   * pair sends its ceiling as the value — so a multicall built without carrying it across forwards the
   * grants and then sends a native deposit worth nothing. A native pair always needs exactly one
   * grant (for the token side), so this is the shape a native increase actually takes.
   */
  it("keeps the native call value when grants wrap it", () => {
    const payload = contracts.v4IncreasePayload(NILE, { ...native, permits: [grant("173468")] });
    expect(payload.method).toBe("multicall(bytes[])");
    expect(payload.callValueSun).toBe(base.amount0Max);
  });
});

/**
 * What a V4 position is owed, from the LP fee helper.
 *
 * The whole point of this read is the number, so the cases below assert the number — and the one
 * case that matters most is the one where there is NO number: an answer that cannot be decoded
 * must come back as `undefined`, not as a pair of zeros. On a command whose purpose is collecting
 * money, a zero says "the position earned nothing", which is a measurement.
 */
describe("the V4 owed-fees read", () => {
  /** the LP fee helper the SDK's own chain config names for Nile. */
  const LP_FEE_HELPER = "TYKPrQ45J7w9E73JaTe9VWR7yAut8nkbgf";
  const GET_LP_FEES = "getLPFees(address,bytes32,address,int24,int24,bytes32)";
  const POOL_ID = "2f8c".padEnd(64, "a");
  const QUERY = { tokenId: "1", poolId: POOL_ID, tickLower: -1284, tickUpper: 1116 };

  /** PM 6.3.4's own figures, so a pass here means the receipt's example is reproducible. */
  const OWED = uint(13974n) + uint(4108n);

  function answering(answer: string, seen: string[] = []) {
    return {
      contracts: new SunSwapLiquidityContracts(
        gatewayAnswering({ [`${LP_FEE_HELPER}:${GET_LP_FEES}`]: answer }, seen),
      ),
      seen,
    };
  }

  // (b) the read answered, and the amounts are positive. This fails if the result is ignored.
  it("returns the two figures the helper reported", async () => {
    const { contracts } = answering(OWED);
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: "13974",
      amount1: "4108",
    });
  });

  // Base units past 2^53: a `number` anywhere on this path would round it and say nothing.
  it("carries an amount larger than a double can hold, exactly", async () => {
    const huge = 123456789012345678901234567890n;
    const { contracts } = answering(uint(huge) + uint(1n));
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: huge.toString(),
      amount1: "1",
    });
  });

  // (a) the read answered zero. That IS the answer, and it is published as one.
  it("returns a zero when the helper says the position is owed nothing", async () => {
    const { contracts } = answering(uint(0n) + uint(0n));
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: "0",
      amount1: "0",
    });
  });

  // (c) the read came back in a shape that cannot hold two words — undefined, never zeros.
  it.each([
    ["a single word", uint(13974n)],
    ["an empty answer", ""],
    ["something that is not hex", "z".repeat(128)],
  ])("gives no answer at all for %s, rather than zeros", async (_name, answer) => {
    const { contracts } = answering(answer);
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toBeUndefined();
  });

  /**
   * The position's OWN key reaches the helper.
   *
   * The pool id, the range and the token id are all arguments to the position key `getLPFees`
   * rebuilds, so a case that only checked the helper was called would pass while asking about a
   * different position entirely.
   */
  it("asks the helper about this position's pool, range and id", async () => {
    const { contracts, seen } = answering(OWED);
    await contracts.v4OwedFees(NILE, QUERY);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(`${LP_FEE_HELPER}:${GET_LP_FEES}`);
    expect(seen[0]).toContain(`0x${POOL_ID}`);
    expect(seen[0]).toContain("-1284");
    expect(seen[0]).toContain("1116");
    // the token id doubles as the position's salt, as a 32-byte word.
    expect(seen[0]).toContain(`0x${uint(1n)}`);
  });
});
