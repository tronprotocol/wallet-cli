import { describe, expect, it } from "vitest";
import { AbiCoder, Interface } from "ethers";
import { TickMath } from "@sun-protocol/sun-sdk-sunswap-v3";
import { SunSwapLiquidityContracts } from "./liquidity-contracts.js";
import { readPosition } from "../../../application/use-cases/tron/sunswap/position-read.js";

const sqrtAt = (tick: number): string => TickMath.getSqrtRatioAtTick(tick).toString();
const TICK_SQRT = sqrtAt(-85);
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

const NILE = {
  id: "tron:3448148188",
  family: "tron",
  chainId: "3448148188",
  nativeSymbol: "TRX",
  capabilities: [],
  sunswap: { liquidity: true },
} as NetworkDescriptor;

const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const FACTORY = "THomLGMLhAjMecQf9FQjbZ8a1RtwsZLrGE";
const PAIR = "TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh";

const addressWord = (hex20: string) => "0".repeat(24) + hex20;
const uint = (value: bigint | number) => BigInt(value).toString(16).padStart(64, "0");

// 20-byte hex bodies corresponding to the base58 fixtures.
const HEX = {
  factory: "55f7d5d874a73f21c0851c62d374307985f440fc",
  pair: "6af7a2b30e6e90f6907b440aebe6c7f5cb82f321",
  usdt: "eca9bc828a3005b9a3b909f2cc5c2a54794de05f",
  wtrx: "fb3b3134f13ccd2c81f4012e53024e8135d58fee",
};

function gatewayAnswering(answers: Record<string, string>, seen: string[] = []) {
  return {
    get: () => ({
      triggerConstantContract: async (
        contract: string,
        method: string,
        parameters: { type: string; value: unknown }[],
      ) => {
        seen.push(`${contract}:${method} [${parameters.map((p) => String(p.value)).join(",")}]`);
        const answer = answers[`${contract}:${method}`] ?? answers[method];
        if (answer === undefined) throw new Error(`unscripted call ${contract}:${method}`);
        return [answer];
      },
    }),
  } as unknown as ChainGatewayProvider;
}

describe("tokenFacts", () => {
  it.each([78, 255, 9999999999])(
    "rejects unsupported token decimals %i before sizing",
    async (decimals) => {
      const port = new SunSwapLiquidityContracts(
        gatewayAnswering({
          "decimals()": uint(decimals),
          "symbol()": uint(32) + uint(0),
        }),
      );
      await expect(port.tokenFacts(NILE, USDT)).rejects.toMatchObject({
        code: "invalid_node_response",
      });
    },
  );
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
    "decimals()": uint(18),
  };

  it("returns reserves in the caller's token order, not the pair's", async () => {
    const forward = new SunSwapLiquidityContracts(
      gatewayAnswering({ ...answers, "token0()": addressWord(HEX.usdt) }),
    );
    await expect(forward.v2PairState(NILE, USDT, WTRX)).resolves.toMatchObject({
      pairAddress: PAIR,
      reserve0: "8971373980412",
      reserve1: "6154765875016",
    });

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

  it("refuses a network the SDK has no deployment for rather than guessing one", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    const shasta = { ...NILE, id: "tron:2494104990", chainId: "2494104990" } as NetworkDescriptor;
    expect(() => port.v2AddLiquidityPayload(shasta, request)).toThrow(
      /SunSwap SDK has no configuration for tron:2494104990/,
    );
  });

  it("takes its addresses from the SDK, which match what the builtins used to carry", () => {
    const port = new SunSwapLiquidityContracts(gatewayAnswering({}));
    expect(port.contracts(NILE)).toEqual({
      v2Router: "TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy",
      v3PositionManager: "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R",
      wtrx: "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a",
    });
    expect(port.contracts({ ...NILE, id: "tron:728126428" } as NetworkDescriptor)).toEqual({
      v2Router: "TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq",
      v3PositionManager: "TLSWrv7eC1AZCXkRjpqMZUmvgd99cj7pPF",
      wtrx: "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
    });
  });
});

describe("sizing uses the pool's own price, on both protocols", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);

  // The fixture price lies inside tick -85, above its lower edge.
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

  it("is not the answer the tick's price gives", () => {
    const real = contracts.v4Amounts(v4Pool, RANGE, { amount0: "1000000" });
    const atTickEdge = contracts.v4Amounts(
      { currentTick: TICK, sqrtPriceX96: TICK_SQRT, exists: true } as never,
      RANGE,
      { amount0: "1000000" },
    );
    expect(BigInt(real.amount1)).toBeGreaterThan(BigInt(atTickEdge.amount1));
    expect(atTickEdge.amount1).toBe("170007");
  });

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
    for (const size of [
      () => contracts.v3Amounts(moved, RANGE, given),
      () => contracts.v4Amounts(moved, RANGE, given),
    ]) {
      expect(size).toThrow(
        expect.objectContaining({ details: { requiredAmount: tick > 0 ? "amount1" : "amount0" } }),
      );
    }
  });

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

  it("accepts a price the caller supplied for a pool that does not exist yet", () => {
    const creating = { currentTick: 0, sqrtPriceX96: REAL_SQRT, exists: false } as never;
    expect(
      BigInt(contracts.v4Amounts(creating, RANGE, { amount0: "1000000" }).liquidity),
    ).toBeGreaterThan(0n);
  });
});

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

  it("differs from the withdrawal figure, so the rounding is real", () => {
    const plan = contracts.v4Amounts(pool, RANGE, { amount0: "1000001" });
    const worth = contracts.v4AmountsForLiquidity(pool, RANGE, plan.liquidity);
    const grew =
      BigInt(plan.amount0) > BigInt(worth.amount0) || BigInt(plan.amount1) > BigInt(worth.amount1);
    expect(grew).toBe(true);
  });
});

describe("the V4 deposit payload", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

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
    recipient: OWNER,
    permitOwner: OWNER,
    sweepRecipient: OWNER,
    deadline: 1790240000,
    permits: [],
  };
  const grant = (amount: string, token = pool.currency0) => ({
    grant: {
      details: { token, amount, expiration: "1790240349", nonce: "0" },
      spender: MANAGER,
      sigDeadline: "1790240349",
    },
    signature: `0x${"ab".repeat(65)}`,
  });

  it.each([false, true])(
    "initializes before permits and mint in one transaction (native=%s)",
    (native) => {
      const abi = new Interface([
        "function initializePool((address currency0,address currency1,address hooks,uint24 fee,bytes32 parameters),uint160)",
        "function modifyLiquidities(bytes,uint256)",
      ]);
      const request = {
        ...base,
        pool: { ...pool, ...(native ? { currency0: pool.hooks } : {}) },
        initialSqrtPriceX96: "263961795081773446554",
      };
      const grants = [
        ...(native ? [] : [grant(base.amount0Max)]),
        grant(base.amount1Max, pool.currency1),
      ];
      for (const permits of [[], grants]) {
        const payload = contracts.v4DepositPayload(NILE, { ...request, permits });
        expect(payload.method).toBe("multicall(bytes[])");
        const calls = payload.parameters[0]!.value as string[];
        expect(calls).toHaveLength(permits.length + 2);
        const [key, price] = abi.decodeFunctionData("initializePool", calls[0]!);
        expect([...key].map((v) => (typeof v === "string" ? v.toLowerCase() : v))).toEqual(
          [
            ...[request.pool.currency0, request.pool.currency1, request.pool.hooks].map(
              (a) => `0x${tronHexAddress(a).slice(2)}`,
            ),
            500n,
            request.pool.parameters,
          ].map((v) => (typeof v === "string" && v.startsWith("0x") ? v.toLowerCase() : v)),
        );
        expect(price).toBe(263961795081773446554n);
        const plain = contracts.v4DepositPayload(NILE, {
          ...base,
          pool: request.pool,
          permits: [],
        });
        expect(calls.at(-1)).toBe(
          abi.encodeFunctionData(
            "modifyLiquidities",
            plain.parameters.map((p) => p.value),
          ),
        );
        if (permits.length) {
          const existing = contracts.v4DepositPayload(NILE, {
            ...base,
            pool: request.pool,
            permits,
          });
          expect(calls.slice(1)).toEqual(existing.parameters[0]!.value);
        }
        expect(payload.callValueSun).toBe(native ? base.amount0Max : undefined);
      }
    },
  );

  it("is a bare modifyLiquidities when no permit is needed", () => {
    const payload = contracts.v4DepositPayload(NILE, base);
    expect(payload.target).toBe(MANAGER);
    expect(payload.method).toBe("modifyLiquidities(bytes,uint256)");
    expect(payload.parameters).toHaveLength(2);
  });

  it("wraps the deposit in a multicall behind its permits", () => {
    const payload = contracts.v4DepositPayload(NILE, {
      ...base,
      permits: [grant("1000000"), grant("173468")],
    });
    expect(payload.target).toBe(MANAGER);
    expect(payload.method).toBe("multicall(bytes[])");
    const calls = payload.parameters[0]!.value as readonly string[];
    expect(calls).toHaveLength(3);
    expect(calls[2]).not.toBe(calls[0]);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it("carries one call per permit, plus the deposit", () => {
    const one = contracts.v4DepositPayload(NILE, { ...base, permits: [grant("1000000")] });
    expect(one.parameters[0]!.value as readonly string[]).toHaveLength(2);
  });

  it.each([false, true])(
    "keeps the permit owner and refund separate from the NFT recipient (native=%s)",
    (native) => {
      const abi = new Interface([
        "function permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)",
        "function modifyLiquidities(bytes,uint256)",
      ]);
      const coder = AbiCoder.defaultAbiCoder();
      const hex = (address: string) => `0x${tronHexAddress(address).slice(2)}`.toLowerCase();
      const grants = [
        ...(native ? [] : [grant(base.amount0Max)]),
        grant(base.amount1Max, pool.currency1),
      ];
      for (const recipient of [OWNER, WTRX]) {
        for (const permits of [[], grants]) {
          const payload = contracts.v4DepositPayload(NILE, {
            ...base,
            pool: { ...pool, ...(native ? { currency0: pool.hooks } : {}) },
            recipient,
            permitOwner: OWNER,
            permits,
          });
          let plannerPayload: string;
          if (permits.length) {
            const calls = payload.parameters[0]!.value as string[];
            for (const call of calls.slice(0, -1)) {
              expect(abi.decodeFunctionData("permit", call)[0].toLowerCase()).toBe(hex(OWNER));
            }
            plannerPayload = abi.decodeFunctionData("modifyLiquidities", calls.at(-1)!)[0];
          } else {
            plannerPayload = payload.parameters[0]!.value as string;
          }
          const [, params] = coder.decode(["bytes", "bytes[]"], plannerPayload);
          const mint = coder.decode(
            [
              "tuple(address,address,address,uint24,bytes32)",
              "int24",
              "int24",
              "uint256",
              "uint128",
              "uint128",
              "address",
              "bytes",
            ],
            params[0],
          );
          expect(mint[6].toLowerCase()).toBe(hex(recipient));
          if (native) {
            const [, refundRecipient] = coder.decode(["address", "address"], params.at(-1));
            expect(refundRecipient.toLowerCase()).toBe(hex(OWNER));
            expect(payload.callValueSun).toBe(base.amount0Max);
          }
        }
      }
    },
  );

  it("sends no TRX for a token pair", () => {
    expect(contracts.v4DepositPayload(NILE, base).callValueSun).toBeUndefined();
  });

  it.each([
    ["the ceiling", { amount1Max: "173469" }],
    ["the range", { tickUpper: 132 }],
    ["the liquidity", { liquidity: "97941774" }],
  ])("changes the encoded call when %s changes", (_name, change) => {
    const before = contracts.v4DepositPayload(NILE, base);
    const after = contracts.v4DepositPayload(NILE, { ...base, ...change });
    expect(JSON.stringify(after.parameters)).not.toBe(JSON.stringify(before.parameters));
  });

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
    expect(one.callValueSun).toBe(base.amount0Max);
  });
});

describe("the V4 increase payload", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

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

  it("wraps the increase in a multicall behind its grants", () => {
    const payload = contracts.v4IncreasePayload(NILE, { ...base, permits: [grant("173468")] });
    expect(payload.method).toBe("multicall(bytes[])");
    const calls = payload.parameters[0]!.value as readonly string[];
    expect(calls).toHaveLength(2);
    const bare = contracts.v4IncreasePayload(NILE, base);
    expect(calls[1]).toContain((bare.parameters[0]!.value as string).replace(/^0x/, ""));
  });

  it.each([
    ["the position", { tokenId: "13" }],
    ["the liquidity", { liquidity: "97941774" }],
    ["the ceiling on currency0", { amount0Max: "1000001" }],
    ["the ceiling on currency1", { amount1Max: "173469" }],
    ["the deadline", { deadline: 1790240001 }],
    ["a currency", { pool: { ...pool, currency1: "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a" } }],
  ])("changes the encoded call when %s changes", (_name, change) => {
    const before = contracts.v4IncreasePayload(NILE, base);
    const after = contracts.v4IncreasePayload(NILE, { ...base, ...change });
    expect(JSON.stringify(after.parameters)).not.toBe(JSON.stringify(before.parameters));
  });

  it("does not encode the tier or the spacing, which the position id already settles", () => {
    const before = contracts.v4IncreasePayload(NILE, base);
    for (const key of [
      { ...pool, fee: 3000 },
      // Tick spacing 60 encoded in bits 16–39.
      { ...pool, parameters: `0x${"0".repeat(58)}3c0000` },
    ]) {
      const after = contracts.v4IncreasePayload(NILE, { ...base, pool: key });
      expect(JSON.stringify(after.parameters)).toBe(JSON.stringify(before.parameters));
    }
  });

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

  it("keeps the native call value when grants wrap it", () => {
    const payload = contracts.v4IncreasePayload(NILE, { ...native, permits: [grant("173468")] });
    expect(payload.method).toBe("multicall(bytes[])");
    expect(payload.callValueSun).toBe(base.amount0Max);
  });
});

describe("the V4 owed-fees read", () => {
  const LP_FEE_HELPER = "TYKPrQ45J7w9E73JaTe9VWR7yAut8nkbgf";
  const GET_LP_FEES = "getLPFees(address,bytes32,address,int24,int24,bytes32)";
  const POOL_ID = "2f8c".padEnd(64, "a");
  const QUERY = { tokenId: "1", poolId: POOL_ID, tickLower: -1284, tickUpper: 1116 };

  const OWED = uint(13974n) + uint(4108n);

  function answering(answer: string, seen: string[] = []) {
    return {
      contracts: new SunSwapLiquidityContracts(
        gatewayAnswering({ [`${LP_FEE_HELPER}:${GET_LP_FEES}`]: answer }, seen),
      ),
      seen,
    };
  }

  it("returns the two figures the helper reported", async () => {
    const { contracts } = answering(OWED);
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: "13974",
      amount1: "4108",
    });
  });

  it("carries an amount larger than a double can hold, exactly", async () => {
    const huge = 123456789012345678901234567890n;
    const { contracts } = answering(uint(huge) + uint(1n));
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: huge.toString(),
      amount1: "1",
    });
  });

  it("returns a zero when the helper says the position is owed nothing", async () => {
    const { contracts } = answering(uint(0n) + uint(0n));
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toEqual({
      amount0: "0",
      amount1: "0",
    });
  });

  it.each([
    ["a single word", uint(13974n)],
    ["an empty answer", ""],
    ["something that is not hex", "z".repeat(128)],
  ])("gives no answer at all for %s, rather than zeros", async (_name, answer) => {
    const { contracts } = answering(answer);
    await expect(contracts.v4OwedFees(NILE, QUERY)).resolves.toBeUndefined();
  });

  it("asks the helper about this position's pool, range and id", async () => {
    const { contracts, seen } = answering(OWED);
    await contracts.v4OwedFees(NILE, QUERY);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(`${LP_FEE_HELPER}:${GET_LP_FEES}`);
    expect(seen[0]).toContain(`0x${POOL_ID}`);
    expect(seen[0]).toContain("-1284");
    expect(seen[0]).toContain("1116");
    // The token id is also the position salt, encoded as bytes32.
    expect(seen[0]).toContain(`0x${uint(1n)}`);
  });
});

describe("the V3 owed-fees read", () => {
  const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
  const RECIPIENT = "TT2T17KZhoDu47i2E4FWxfG79zdkEWkU9N";

  it("simulates collect as the position's owner, not the default reader", async () => {
    const callers: (string | undefined)[] = [];
    const gateways = {
      get: () => ({
        triggerConstantContract: async (
          _contract: string,
          _method: string,
          _parameters: unknown[],
          owner?: string,
        ) => {
          callers.push(owner);
          if (owner !== OWNER) throw new Error("REVERT opcode executed: Not approved");
          return [uint(1200n) + uint(800n)];
        },
      }),
    } as unknown as ChainGatewayProvider;

    await expect(
      new SunSwapLiquidityContracts(gateways).v3OwedFees(NILE, "686", RECIPIENT, OWNER),
    ).resolves.toEqual({ amount0: "1200", amount1: "800" });
    expect(callers).toEqual([OWNER]);
  });
});

describe("the V4 pool id, from the parts a caller gives", () => {
  const contracts = new SunSwapLiquidityContracts({} as unknown as ChainGatewayProvider);
  const MAINNET = {
    id: "tron:728126428",
    family: "tron",
    chainId: "728126428",
    nativeSymbol: "TRX",
    capabilities: [],
    sunswap: { contracts: {} },
  } as unknown as NetworkDescriptor;

  const key = {
    token0: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
    token1: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    fee: 500,
    tickSpacing: 10,
    hooks: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
  };
  const LIVE_POOL_ID = "dda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e";

  it("reproduces a real pool's id from its parts alone", () => {
    expect(contracts.v4PoolIdOf(MAINNET, key)).toBe(LIVE_POOL_ID);
  });

  it.each([
    ["token0", { ...key, token0: "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9" }],
    ["token1", { ...key, token1: "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR" }],
    ["fee", { ...key, fee: 3000 }],
    ["tickSpacing", { ...key, tickSpacing: 12 }],
    ["hooks", { ...key, hooks: "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB" }],
  ])("gives a different pool when %s differs", (_part, changed) => {
    expect(contracts.v4PoolIdOf(MAINNET, changed)).not.toBe(LIVE_POOL_ID);
    expect(contracts.v4PoolIdOf(MAINNET, changed)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same parts", () => {
    expect(contracts.v4PoolIdOf(MAINNET, { ...key })).toBe(contracts.v4PoolIdOf(MAINNET, key));
  });
});

describe("V2 transaction return amounts", () => {
  function portFor(contractResult: unknown, result = "SUCCESS") {
    return new SunSwapLiquidityContracts({
      get: () => ({
        getTransactionInfoById: async () => ({ receipt: { result }, contractResult }),
      }),
    } as unknown as ChainGatewayProvider);
  }

  it.each([false, true])("decodes a real Nile withdrawal, nativeFirst=%s", async (nativeFirst) => {
    const raw =
      "000000000000000000000000000000000000000000000000000000004db8f50e00000000000000000000000000000000000000000000000000000000355c95ab";
    expect(await portFor([raw]).v2LiquidityResult(NILE, "qa-tx", "remove", nativeFirst)).toEqual({
      amount0: nativeFirst ? "895260075" : "1303966990",
      amount1: nativeFirst ? "1303966990" : "895260075",
    });
  });

  it.each([false, true])(
    "decodes used amounts and minted LP without rounding, nativeFirst=%s",
    async (nativeFirst) => {
      const large = 123456789012345678901234n;
      expect(
        await portFor([uint(large) + uint(456) + uint(789)]).v2LiquidityResult(
          NILE,
          "tx",
          "add",
          nativeFirst,
        ),
      ).toEqual({
        amount0: nativeFirst ? "456" : large.toString(),
        amount1: nativeFirst ? large.toString() : "456",
        lpAmount: "789",
      });
    },
  );

  it.each([undefined, [], [""], ["zz".repeat(64)], [uint(1)], [uint(1) + uint(2) + uint(3)]])(
    "does not turn missing or malformed removal output into zero: %j",
    async (raw) => {
      expect(await portFor(raw).v2LiquidityResult(NILE, "tx", "remove", false)).toBeUndefined();
    },
  );
  it("rejects failed receipts and truncated deposit output", async () => {
    expect(
      await portFor([uint(1) + uint(2)], "REVERT").v2LiquidityResult(NILE, "tx", "remove", false),
    ).toBeUndefined();
    expect(
      await portFor([uint(1) + uint(2)]).v2LiquidityResult(NILE, "tx", "add", false),
    ).toBeUndefined();
  });
});

import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { tronHexAddress } from "../../../domain/address/index.js";
describe("V3 deposited amounts", () => {
  const event = {
    address: tronHexAddress("TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R").slice(2).toLowerCase(),
    topics: [
      bytesToHex(keccak_256(utf8ToBytes("IncreaseLiquidity(uint256,uint128,uint256,uint256)"))),
      uint(686),
    ],
    data: uint(12345) + uint(999000) + uint(173000),
  };
  const port = (logs: unknown[], result = "SUCCESS") =>
    new SunSwapLiquidityContracts({
      get: () => ({ getTransactionInfoById: async () => ({ receipt: { result }, log: logs }) }),
    } as unknown as ChainGatewayProvider);
  it("reads exact amounts and position liquidity from one transaction", async () => {
    await expect(port([event]).v3DepositedAmounts(NILE, "tx", "686")).resolves.toEqual({
      tokenId: "686",
      liquidity: "12345",
      amount0: "999000",
      amount1: "173000",
    });
    await expect(port([event]).v3DepositedAmounts(NILE, "tx")).resolves.toHaveProperty(
      "tokenId",
      "686",
    );
  });
  it("rejects another position, malformed/ambiguous logs, and failed receipts", async () => {
    await expect(port([event]).v3DepositedAmounts(NILE, "tx", "687")).resolves.toBeUndefined();
    await expect(port([event, event]).v3DepositedAmounts(NILE, "tx")).resolves.toBeUndefined();
    await expect(
      port([{ ...event, data: "00" }]).v3DepositedAmounts(NILE, "tx"),
    ).resolves.toBeUndefined();
    await expect(port([event], "REVERT").v3DepositedAmounts(NILE, "tx")).resolves.toBeUndefined();
  });
});

describe("initial V4 price to tick", () => {
  const contracts = new SunSwapLiquidityContracts({} as ChainGatewayProvider);
  it.each([
    ["79228162514264337593543950336", 0],
    ["263961795081773446554", -390416],
    ["4295128739", -887272],
  ])("uses integer TickMath for %s", (price, expected) => {
    expect(contracts.tickAtSqrtPrice(price)).toBe(expected);
  });
  it.each(["0", "4295128738", "1461446703485210103287273052203988822378723970342", "-1", "1.5"])(
    "rejects invalid initial price %s before approval",
    (price) => {
      expect(() => contracts.tickAtSqrtPrice(price)).toThrow(/--sqrt-price/);
    },
  );
});

describe("a position read the node answered with undecodable data", () => {
  const MANAGER = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
  const OWNER = addressWord(HEX.usdt);
  const POSITIONS =
    uint(0) +
    addressWord("0".repeat(40)) +
    addressWord(HEX.usdt) +
    addressWord(HEX.wtrx) +
    uint(3000) +
    uint((1n << 256n) - 60n) +
    uint(60) +
    uint(1234) +
    uint(0).repeat(4);

  function v3(positions: string, owner = OWNER) {
    return new SunSwapLiquidityContracts(
      gatewayAnswering({
        [`${MANAGER}:positions(uint256)`]: positions,
        [`${MANAGER}:ownerOf(uint256)`]: owner,
      }),
    );
  }

  it("decodes a complete V3 answer", async () => {
    await expect(v3(POSITIONS).v3Position(NILE, "88")).resolves.toMatchObject({
      token0: USDT,
      token1: WTRX,
      fee: 3000,
      tickLower: -60,
      tickUpper: 60,
      liquidity: "1234",
    });
  });

  it.each([
    ["four bytes", "deadbeef"],
    ["seven words, one short of the liquidity", POSITIONS.slice(0, 7 * 64)],
    ["words that are not hex", "z".repeat(POSITIONS.length)],
  ])("refuses a V3 positions answer of %s as invalid_node_response", async (_name, answer) => {
    await expect(v3(answer).v3Position(NILE, "88")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  it("refuses a V3 ownerOf answer shorter than a word as invalid_node_response", async () => {
    await expect(v3(POSITIONS, "deadbeef").v3Position(NILE, "88")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });

  function v4(answers: { info: string; liquidity: string; owner: string }) {
    return new SunSwapLiquidityContracts({
      get: () => ({
        triggerConstantContract: async (_contract: string, method: string) => {
          if (method.startsWith("getPoolAndPositionInfo")) return [answers.info];
          if (method.startsWith("getPositionLiquidity")) return [answers.liquidity];
          if (method.startsWith("ownerOf")) return [answers.owner];
          throw new Error(`unscripted call ${method}`);
        },
      }),
    } as unknown as ChainGatewayProvider);
  }

  it.each([0, 12])(
    "preserves V4 data integrity errors through position lookup (spacing=%i)",
    async (spacing) => {
      const info =
        addressWord(HEX.usdt) +
        addressWord(HEX.wtrx) +
        uint(0) +
        uint(500) +
        uint(BigInt(spacing) << 16n) +
        uint(0);
      const port = v4({ info, liquidity: uint(1), owner: OWNER });
      await expect(
        readPosition("V4", "88", NILE, () => port.v4Position(NILE, "88")),
      ).rejects.toMatchObject({
        code: "invalid_node_response",
        message: expect.stringMatching(spacing === 0 ? /tick spacing of 0/ : /two do not agree/),
      });
    },
  );

  it.each([
    ["a pool key cut short", { info: "deadbeef", liquidity: uint(1), owner: OWNER }],
    ["no liquidity word", { info: uint(0).repeat(6), liquidity: "", owner: OWNER }],
    ["an owner cut short", { info: uint(0).repeat(6), liquidity: uint(1), owner: "dead" }],
  ])("refuses a V4 position read with %s as invalid_node_response", async (_name, answers) => {
    await expect(v4(answers).v4Position(NILE, "88")).rejects.toMatchObject({
      code: "invalid_node_response",
    });
  });
});

describe("V3 Collect receipt identity", () => {
  const manager = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
  const topic = new Interface([
    "event Collect(uint256 indexed tokenId,address recipient,uint256 amount0,uint256 amount1)",
  ])
    .getEvent("Collect")!
    .topicHash.slice(2);
  const event = (id: number, recipient = manager) => ({
    address: tronHexAddress(manager).slice(2),
    topics: [topic, uint(id)],
    data: addressWord(tronHexAddress(recipient).slice(2)) + uint(id) + uint(id * 2),
  });
  const port = (log: unknown[], result = "SUCCESS") =>
    new SunSwapLiquidityContracts({
      get: () => ({ getTransactionInfoById: async () => ({ receipt: { result }, log }) }),
    } as never);

  it("selects the requested tokenId even when another position emitted first", async () => {
    await expect(
      port([event(11), event(22)]).v3CollectedAmounts(NILE, "tx", "22"),
    ).resolves.toEqual({ amount0: "22", amount1: "44" });
  });
  it("does not substitute another position's collection", async () => {
    await expect(port([event(11)]).v3CollectedAmounts(NILE, "tx", "22")).resolves.toBeUndefined();
  });
  it("rejects duplicate matching events", async () => {
    await expect(
      port([event(22), event(22)]).v3CollectedAmounts(NILE, "tx", "22"),
    ).resolves.toBeUndefined();
  });
  it.each([manager, USDT])(
    "identifies the position independently of recipient %s",
    async (recipient) => {
      await expect(
        port([event(22, recipient)]).v3CollectedAmounts(NILE, "tx", "22"),
      ).resolves.toEqual({ amount0: "22", amount1: "44" });
    },
  );
  it("ignores malformed event data and failed receipts", async () => {
    await expect(
      port([{ ...event(22), data: "dead" }]).v3CollectedAmounts(NILE, "tx", "22"),
    ).resolves.toBeUndefined();
    await expect(
      port([event(22)], "REVERT").v3CollectedAmounts(NILE, "tx", "22"),
    ).resolves.toBeUndefined();
  });
});
