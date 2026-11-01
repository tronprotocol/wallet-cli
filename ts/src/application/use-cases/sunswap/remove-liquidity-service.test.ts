import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { SunSwapTokenResolver } from "../../services/sunswap/sunswap-token-resolver.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import { SunSwapRemoveLiquidityService } from "./remove-liquidity-service.js";
import { ChainError } from "../../../domain/errors/index.js";
import { baseUnitAmount } from "../../../domain/amounts/index.js";
import { CommandDeadline } from "../../services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

const ROUTER = "TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy";
const MANAGER = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
const PAIR_ADDRESS = "TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

const REMOVE_V2 = "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)";
const REMOVE_V2_ETH = "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)";
const MULTICALL = "multicall(bytes[])";
const APPROVE = "approve(address,uint256)";

const NETWORK = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "3448148188",
  sunswap: { liquidity: true },
} as unknown as NetworkDescriptor;

const FACTS: Record<string, { address: string; decimals: number; symbol: string }> = {
  [USDT]: { address: USDT, decimals: 6, symbol: "USDT" },
  [WTRX]: { address: WTRX, decimals: 6, symbol: "WTRX" },
};

const PAIR = {
  pairAddress: PAIR_ADDRESS,
  reserve0: "8971373980412",
  reserve1: "6154765875016",
  totalSupply: "7000000000000",
  lpDecimals: 6,
  exists: true,
};

const POSITION = {
  tokenId: "686",
  owner: OWNER,
  token0: USDT,
  token1: WTRX,
  fee: 500,
  tickLower: -8030,
  tickUpper: -6030,
  liquidity: "14398816",
};

const resolver = {
  resolvePair: (_n: NetworkDescriptor, input: object) => ({ input, resolved: [] }),
  resolve: (_n: NetworkDescriptor, value: string) =>
    ({ USDT, WTRX, TRX })[value.toUpperCase()] ?? value,
  resolveSymbol: (_n: NetworkDescriptor, value: string) => value,
  label: () => "nile",
} as unknown as SunSwapTokenResolver;

function makePort(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
  return {
    contracts: vi.fn(() => ({ v2Router: ROUTER, v3PositionManager: MANAGER, wtrx: WTRX })),
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v2PairState: vi.fn(async () => PAIR),
    v2LiquidityResult: vi.fn(async () => undefined),
    balanceOf: vi.fn(async () => "999999999999"),
    nativeBalance: vi.fn(async () => "999999999999"),
    allowance: vi.fn(async () => baseUnitAmount("0")),
    approvalPayload: vi.fn((_n: NetworkDescriptor, token: string) => ({
      target: token,
      method: APPROVE,
      parameters: [],
    })),
    v2RemoveLiquidityPayload: vi.fn(() => ({
      target: ROUTER,
      method: REMOVE_V2,
      parameters: [],
    })),
    v2RemoveLiquidityEthPayload: vi.fn(() => ({
      target: ROUTER,
      method: REMOVE_V2_ETH,
      parameters: [],
    })),
    v3Position: vi.fn(async () => POSITION),
    v3PoolState: vi.fn(async () => ({
      poolAddress: "Tpool",
      exists: true,
      sqrtPriceX96: "55743275095956664623638036817",
      currentTick: -7032,
      fee: 500,
      token0: USDT,
    })),
    v3AmountsForLiquidity: vi.fn(() => ({ amount0: "999999", amount1: "493088" })),
    v3RemovePayload: vi.fn(() => ({ target: MANAGER, method: MULTICALL, parameters: [] })),
    v3OwedFees: vi.fn(async () => ({ amount0: "1200", amount1: "800" })),
    v3CollectedAmounts: vi.fn(async () => ({ amount0: "1001199", amount1: "493888" })),
    ...overrides,
  } as unknown as LiquidityPort;
}

interface PipelineParams {
  mode?: string;
  build: (from: string) => Promise<unknown>;
  estimate: (tx: unknown) => Promise<Record<string, unknown>>;
}

function makeHarness(
  port: LiquidityPort = makePort(),
  confirmed = false,
  feeSun = 0,
  tokens: SunSwapTokenResolver = resolver,
) {
  const gateway = {
    triggerSmartContract: vi.fn(async (_from, target, method) => ({
      txID: `built:${method}`,
      target,
    })),
    estimateResources: vi.fn(async () => ({
      feeModel: "tron-resource" as const,
      energy: 1000,
      energyPriceSun: "420",
    })),
  };
  const assertCanSign = vi.fn();
  const pipeline = {
    assertCanSign,
    runTron: vi.fn(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      const fee = await p.estimate(tx);
      if (p.mode === "dry-run") return { stage: "plan", tx, fee };
      if (p.mode === "build-only") return { stage: "built", tx, hex: "0abc", fee };
      return confirmed
        ? { stage: "confirmed", txId: `tx:${tx.txID}`, blockNumber: 1, fee, feeSun }
        : { stage: "submitted", txId: `tx:${tx.txID}`, fee };
    }),
  } as unknown as TxPipeline;
  const warn = vi.fn();
  const scope = {
    deadline: NO_DEADLINE,
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress: () => OWNER,
    warn,
  } as unknown as TransactionScope;
  const service = new SunSwapRemoveLiquidityService(
    port,
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
    tokens,
  );
  return { service, scope, gateway, pipeline, port, assertCanSign };
}

const V2 = { protocol: "V2", token0: USDT, token1: WTRX, liquidity: "0.5" };
const V3 = { protocol: "V3", positionId: "686", liquidity: "1000" };

describe("remove-liquidity V2", () => {
  it("returns each side in proportion to the LP being burned, floored at 95%", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0).toMatchObject({ amount: "640812", amountMinimum: "608771" });
    expect(result.token1).toMatchObject({ amount: "439626", amountMinimum: "417644" });
  });

  it("approves the LP token to the router, not the pair's two sides", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      dryRun: true,
    })) as { approvals: { token: string; spender: string; amount: string }[] };

    expect(result.approvals).toEqual([
      expect.objectContaining({ token: PAIR_ADDRESS, spender: ROUTER, amount: "500000" }),
    ]);
  });

  it("refuses to burn more LP than the account holds", async () => {
    const port = makePort({ balanceOf: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V2, dryRun: true }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
  });

  it("takes the native path when one side is TRX", async () => {
    const { service, scope, gateway } = makeHarness();

    await service.removeLiquidity(scope, NETWORK, {
      protocol: "V2",
      token0: "TRX",
      token1: USDT,
      liquidity: "0.5",
      buildOnly: true,
    });

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toContain(REMOVE_V2_ETH);
    expect(methods).not.toContain(REMOVE_V2);
  });

  it("resolves no signer on a dry run, so a watch-only account can preview a withdrawal", async () => {
    const { service, scope, assertCanSign } = makeHarness();

    await service.removeLiquidity(scope, NETWORK, { ...V2, dryRun: true });

    expect(assertCanSign).not.toHaveBeenCalled();
  });
});

describe("remove-liquidity V2 — gross native receipts", () => {
  it.each([
    ["token0", OWNER, "895260075", "20073600"],
    ["token1", OWNER, "895260075", "20073600"],
    ["token0", USDT, "895260075", "20073600"],
    ["token0", OWNER, "1000000", "20073600"],
    ["token0", OWNER, "895260075", "0"],
  ])(
    "reports received TRX on %s to %s (received %s, fee %s)",
    async (side, recipient, received, fee) => {
      const before = 1000000000n;
      // Include an unrelated transfer so balance deltas cannot stand in for receipts.
      const after = before + BigInt(received) - (recipient === OWNER ? BigInt(fee) : 0n) + 1000000n;
      const port = makePort({
        v2LiquidityResult: vi.fn(async () => ({
          amount0: baseUnitAmount(side === "token0" ? received : "0"),
          amount1: baseUnitAmount(side === "token1" ? received : "0"),
        })),
        allowance: vi.fn(async () => baseUnitAmount("999999999999")),
        nativeBalance: vi
          .fn()
          .mockResolvedValueOnce(before.toString())
          .mockResolvedValue(after.toString()),
        balanceOf: vi.fn(async (_n, token) =>
          baseUnitAmount(token === PAIR_ADDRESS ? "999999999999" : "0"),
        ),
      });
      const { service, scope } = makeHarness(port, true, Number(fee));
      const result = await service.removeLiquidity(scope, NETWORK, {
        ...V2,
        token0: side === "token0" ? "TRX" : USDT,
        token1: side === "token1" ? "TRX" : USDT,
        recipient,
      });
      expect(port.v2LiquidityResult).toHaveBeenCalledWith(
        NETWORK,
        expect.any(String),
        "remove",
        side === "token0",
        expect.anything(),
      );
      expect(result.amountsEstimated).toBe(false);
      expect(result[side]).toMatchObject({ amount: received });
      expect(result[side === "token0" ? "token1" : "token0"]).toMatchObject({ amount: "0" });
    },
  );
});

describe("V2 removal receipt availability", () => {
  it("preserves confirmed amounts if the later reserves query fails", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")),
      v2LiquidityResult: vi.fn(async () => ({
        amount0: baseUnitAmount("12"),
        amount1: baseUnitAmount("34"),
      })),
      v2PairState: vi.fn().mockResolvedValueOnce(PAIR).mockRejectedValue(new Error("offline")),
    });
    const { service, scope } = makeHarness(port, true);
    const result = await service.removeLiquidity(scope, NETWORK, V2);
    expect(result.token0).toMatchObject({ amount: "12" });
    expect(result.token1).toMatchObject({ amount: "34" });
    expect(result.amountsEstimated).toBe(false);
    expect(scope.warn).toHaveBeenCalled();
  });

  it.each([false, true])(
    "marks missing receipt amounts as estimates (throws=%s)",
    async (throws) => {
      const port = makePort({
        allowance: vi.fn(async () => baseUnitAmount("999999999999")),
        v2LiquidityResult: vi.fn(async () => {
          if (throws) throw new Error("offline");
          return undefined;
        }),
      });
      const { service, scope } = makeHarness(port, true);
      const result = await service.removeLiquidity(scope, NETWORK, V2);
      expect(result.stage).toBe("confirmed");
      expect(result.amountsEstimated).toBe(true);
      expect(result.token0).toMatchObject({ amount: "640812" });
      expect(scope.warn).toHaveBeenCalled();
    },
  );
});

describe("remove-liquidity V3", () => {
  it("sends ONE transaction carrying the multicall, and approves nothing", async () => {
    const { service, scope, gateway } = makeHarness();

    const result = (await service.removeLiquidity(scope, NETWORK, V3)) as Record<string, unknown>;

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toEqual([MULTICALL]);
    expect(result).not.toHaveProperty("approvalTxIds");
  });

  it("never sends a bare decreaseLiquidity", async () => {
    const { service, scope, port } = makeHarness();

    await service.removeLiquidity(scope, NETWORK, V3);

    expect(port.v3RemovePayload).toHaveBeenCalledTimes(1);
  });

  it("treats --liquidity as the position's own units, not a token amount", async () => {
    const { service, scope, port } = makeHarness();

    await service.removeLiquidity(scope, NETWORK, { ...V3, dryRun: true });

    expect(port.v3AmountsForLiquidity).toHaveBeenCalledWith(
      expect.anything(),
      { tickLower: -8030, tickUpper: -6030 },
      "1000",
    );
  });

  it("refuses to burn more liquidity than the position holds", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V3, liquidity: "99999999999", dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("refuses a fractional liquidity, which the position cannot express", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V3, liquidity: "1.5", dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("refuses a position the account does not hold, naming the owner", async () => {
    const port = makePort({
      v3Position: vi.fn(async () => ({
        ...POSITION,
        owner: "TSomeoneElse11111111111111111111",
      })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V3, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("TSomeoneElse11111111111111111111"),
    });
  });

  it("reports an id that was never minted as position_not_found", async () => {
    const port = makePort({
      v3Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V3, dryRun: true }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  it("re-reads the owner immediately before sending", async () => {
    const { service, scope, port } = makeHarness();

    await service.removeLiquidity(scope, NETWORK, V3);

    expect((port.v3Position as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      2,
    );
  });

  it("floors both sides at zero, so the dry run says the transaction accepts anything", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V3,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0!.amountMinimum).toBe("0");
    expect(result.token1!.amountMinimum).toBe("0");
    expect(result.token0).toMatchObject({ acceptsAnyAmount: true });
    expect(result.token1).toMatchObject({ acceptsAnyAmount: true });
  });
});

describe("remove-liquidity V3 — the principal and fee split", () => {
  it("subtracts what was owed before from what arrived", async () => {
    const port = makePort();
    const { service, scope } = makeHarness(port, true);

    const result = (await service.removeLiquidity(scope, NETWORK, V3)) as Record<string, never>;

    expect(port.v3OwedFees).toHaveBeenCalledWith(
      NETWORK,
      expect.any(String),
      expect.any(String),
      OWNER,
      expect.anything(),
    );
    expect(result.token0).toMatchObject({ amount: "999999", feeAmount: "1200" });
    expect(result.token1).toMatchObject({ amount: "493088", feeAmount: "800" });
    expect(result.liquidityAfter).toBe(POSITION.liquidity);
  });

  it("reports the whole arrival as principal when the owed figure could not be read", async () => {
    const port = makePort({
      v3OwedFees: vi.fn(async () => {
        throw new Error("node unavailable");
      }) as never,
    });
    const { service, scope } = makeHarness(port, true);

    const result = (await service.removeLiquidity(scope, NETWORK, V3)) as Record<string, never>;

    expect(result.token0).toMatchObject({ amount: "1001199" });
    expect(result.token0).not.toHaveProperty("feeAmount");
  });

  it("leaves a submitted receipt alone — there is nothing on chain to read back", async () => {
    const { service, scope } = makeHarness(makePort(), false);

    const result = (await service.removeLiquidity(scope, NETWORK, V3)) as Record<string, unknown>;

    expect(result).not.toHaveProperty("liquidityAfter");
  });
});

describe("remove-liquidity V2 — the burned amount reads the same before and after", () => {
  it("publishes lpDecimals in every mode, not only in the plan", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = makeHarness(port);

    const planned = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      dryRun: true,
    })) as Record<string, unknown>;
    const sent = (await service.removeLiquidity(scope, NETWORK, V2)) as Record<string, unknown>;

    expect(planned.lpDecimals).toBe(6);
    expect(sent.lpDecimals).toBe(6);
    expect(sent.lpAmount).toBe(planned.lpAmount);
  });
});

const V4_MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
const POOL_ID = "0x" + "ab".repeat(32);
const DECREASE = "modifyLiquidities(bytes,uint256)";

const V4_POOL = {
  poolId: POOL_ID,
  exists: true,
  sqrtPriceX96: "55743275095956664623638036817",
  currentTick: -7032,
  liquidity: "9000000",
  currency0: USDT,
  currency1: WTRX,
  fee: 500,
  tickSpacing: 10,
  hooks: TRX,
  parameters: "0x000000000000000000000000000000000000000000000000000000000000000a",
};

const V4_POSITION = {
  tokenId: "12",
  owner: OWNER,
  poolId: POOL_ID,
  currency0: USDT,
  currency1: WTRX,
  fee: 500,
  tickSpacing: 10,
  hooks: TRX,
  tickLower: -8030,
  tickUpper: -6030,
  liquidity: "14398816",
  hasSubscriber: false,
};

const V4_WORTH = { amount0: "999999", amount1: "493088" };

function makeV4Port(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
  return makePort({
    v4Position: vi.fn(async () => V4_POSITION),
    v4PoolState: vi.fn(async () => V4_POOL),
    v4AmountsForLiquidity: vi.fn(() => V4_WORTH),
    v4AmountsForLiquidityCeiling: vi.fn(() => ({ amount0: "1000000", amount1: "493089" })),
    v4RemovePayload: vi.fn(() => ({ target: V4_MANAGER, method: DECREASE, parameters: [] })),
    v4CollectPayload: vi.fn(() => ({ target: V4_MANAGER, method: DECREASE, parameters: [] })),
    v4PositionManager: vi.fn(() => V4_MANAGER),
    ...overrides,
  } as unknown as Partial<LiquidityPort>);
}

const V4 = {
  protocol: "V4",
  positionId: "12",
  token0: USDT,
  token1: WTRX,
  liquidity: "1000",
};

function sentRequest(port: LiquidityPort): Record<string, never> {
  const call = (port.v4RemovePayload as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
  return call![1] as Record<string, never>;
}

describe("remove-liquidity V4 — what reaches the payload", () => {
  it("carries the pool key, the position, the liquidity, the floors, the recipient and the deadline", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);
    const at = Math.floor(Date.now() / 1000) + 600;

    await service.removeLiquidity(scope, NETWORK, {
      ...V4,
      min0: "0.5",
      deadline: at,
      dryRun: true,
    });

    const request = sentRequest(port);
    expect(request).toMatchObject({
      pool: {
        currency0: USDT,
        currency1: WTRX,
        hooks: V4_POOL.hooks,
        fee: 500,
        parameters: V4_POOL.parameters,
      },
      tokenId: "12",
      liquidity: "1000",
      amount0Min: "500000",
      amount1Min: "0",
      recipient: OWNER,
      deadline: at,
    });
  });

  it("uses the caller's deadline rather than the default", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);
    const at = Math.floor(Date.now() / 1000) + 900;

    await service.removeLiquidity(scope, NETWORK, { ...V4, deadline: at, dryRun: true });

    expect(sentRequest(port).deadline as never as number).toBe(at);
  });

  it("sizes with the rounding-down helper and never with the deposit's ceiling", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);

    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V4,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(port.v4AmountsForLiquidity).toHaveBeenCalledWith(
      V4_POOL,
      { tickLower: -8030, tickUpper: -6030 },
      "1000",
    );
    expect(port.v4AmountsForLiquidityCeiling).not.toHaveBeenCalled();
    expect(result.token0!.amount).toBe("999999");
    expect(result.token1!.amount).toBe("493088");
  });

  it("floors at zero when neither --min nor --slippage is given", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.removeLiquidity(scope, NETWORK, { ...V4, dryRun: true });

    expect(sentRequest(port)).toMatchObject({ amount0Min: "0", amount1Min: "0" });
  });

  it("applies --slippage downward from the estimate", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.removeLiquidity(scope, NETWORK, { ...V4, slippage: "0.005", dryRun: true });

    const request = sentRequest(port);
    expect(request).toMatchObject({ amount0Min: "994999", amount1Min: "490622" });
    expect(BigInt(request.amount0Min as never as string)).toBeLessThan(BigInt(V4_WORTH.amount0));
    expect(BigInt(request.amount1Min as never as string)).toBeLessThan(BigInt(V4_WORTH.amount1));
  });

  it("applies --slippage below an explicit --min, not instead of it", async () => {
    const port = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.removeLiquidity(scope, NETWORK, {
      ...V4,
      min0: "0.5",
      slippage: "0.005",
      dryRun: true,
    });

    const request = sentRequest(port);
    expect(request).toMatchObject({ amount0Min: "497500" });
    expect(BigInt(request.amount0Min as never as string)).toBeLessThan(500000n);
  });

  it("sends one transaction and never a collect beside it", async () => {
    const port = makeV4Port();
    const { service, scope, pipeline } = makeHarness(port);

    await service.removeLiquidity(scope, NETWORK, V4);

    expect(pipeline.runTron).toHaveBeenCalledTimes(1);
    expect(port.v4CollectPayload).not.toHaveBeenCalled();
    expect(port.approvalPayload).not.toHaveBeenCalled();
  });

  it("reads the position's remaining liquidity back after confirmation", async () => {
    const after = { ...V4_POSITION, liquidity: "14397816" };
    const v4Position = vi
      .fn()
      .mockResolvedValueOnce(V4_POSITION)
      .mockResolvedValueOnce(V4_POSITION)
      .mockResolvedValue(after);
    const { service, scope } = makeHarness(makeV4Port({ v4Position: v4Position as never }), true);

    const result = (await service.removeLiquidity(scope, NETWORK, V4)) as Record<string, unknown>;

    expect(result.liquidityAfter).toBe("14397816");
  });
});

describe("remove-liquidity V4 — native TRX stays native", () => {
  it("keeps TRX as the pool's currency and prices it at six decimals", async () => {
    const pool = { ...V4_POOL, currency0: TRX };
    const port = makeV4Port({
      v4PoolState: vi.fn(async () => pool) as never,
      v4Position: vi.fn(async () => ({ ...V4_POSITION, currency0: TRX })) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V4,
      token0: "TRX",
      slippage: "0.01",
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0).toMatchObject({ address: TRX, symbol: "TRX", decimals: 6 });
    expect(sentRequest(port)).toMatchObject({
      pool: { currency0: TRX },
      amount0Min: "989999",
    });
  });
});

describe("remove-liquidity V4 — the cross-checks", () => {
  it("refuses a pair that is not the one the position holds, naming both", async () => {
    const { service, scope } = makeHarness(makeV4Port());

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, token1: TRX, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining(TRX) as never,
    });
    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, token1: TRX, dryRun: true }),
    ).rejects.toMatchObject({ message: expect.stringContaining(WTRX) as never });
  });

  it.each([6, 18])(
    "refuses a reversed pair before sizing (second token decimals=%i)",
    async (decimals) => {
      const port = makeV4Port({
        tokenFacts: vi.fn(async (_n, address) => ({
          ...FACTS[address]!,
          decimals: address === WTRX ? decimals : 6,
        })),
      });
      const { service, scope, pipeline } = makeHarness(port);
      const result = service.removeLiquidity(scope, NETWORK, {
        ...V4,
        token0: WTRX,
        token1: USDT,
        min0: "0.5",
        dryRun: true,
      });
      await expect(result).rejects.toMatchObject({
        code: "invalid_value",
        message: expect.stringContaining(`token0 ${USDT} token1 ${WTRX}`),
      });
      await expect(result).rejects.toThrow("min0 / min1");
      expect(port.v4AmountsForLiquidity).not.toHaveBeenCalled();
      expect(port.v4RemovePayload).not.toHaveBeenCalled();
      expect(pipeline.runTron).not.toHaveBeenCalled();
    },
  );

  it("scales minimums by their assets when the pair is in position order", async () => {
    const port = makeV4Port({
      tokenFacts: vi.fn(async (_n, address) => ({
        ...FACTS[address]!,
        decimals: address === WTRX ? 18 : 6,
      })),
    });
    const { service, scope } = makeHarness(port);
    await service.removeLiquidity(scope, NETWORK, {
      ...V4,
      min0: "0.5",
      min1: "0.25",
      dryRun: true,
    });
    expect(sentRequest(port)).toMatchObject({
      amount0Min: "500000",
      amount1Min: "250000000000000000",
    });
  });

  it("refuses a --fee that disagrees with the position's tier", async () => {
    const { service, scope } = makeHarness(makeV4Port());

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, fee: 3000, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("refuses a position held by someone else", async () => {
    const port = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, owner: USDT })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("reports an id that was never minted as position_not_found", async () => {
    const port = makeV4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  it("refuses burning more liquidity than the position holds", async () => {
    const { service, scope } = makeHarness(makeV4Port());

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, liquidity: "99999999999", dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("refuses --recipient", async () => {
    const { service, scope } = makeHarness(makeV4Port());

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, recipient: USDT, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });

  it("refuses a pool that has never been initialised", async () => {
    const port = makeV4Port({
      v4PoolState: vi.fn(async () => ({ ...V4_POOL, exists: false })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.removeLiquidity(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "pool_not_found" });
  });
});

describe("remove-liquidity V4 — the fees that arrive with the principal", () => {
  it("reports them beside the principal rather than folding them in or dropping them", async () => {
    const port = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: "4821", amount1: "3132" })) as never,
    });
    const { service, scope } = makeHarness(port, true);

    const result = (await service.removeLiquidity(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).toMatchObject({ amount: V4_WORTH.amount0, feeAmount: "4821" });
    expect(result.token1).toMatchObject({ amount: V4_WORTH.amount1, feeAmount: "3132" });
  });

  it("publishes no feeAmount when the read failed, rather than a zero", async () => {
    const port = makeV4Port({ v4OwedFees: vi.fn(async () => undefined) as never });
    const { service, scope } = makeHarness(port, true);

    const result = (await service.removeLiquidity(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).not.toHaveProperty("feeAmount");
    expect(result.token1).not.toHaveProperty("feeAmount");
  });
});

describe("V4 confirmed receipt amounts", () => {
  it("uses actual principal and fees even when the pre-send estimates differ", async () => {
    const port = makeV4Port({
      v4OwedFees: vi.fn(async () => ({
        amount0: baseUnitAmount("1"),
        amount1: baseUnitAmount("2"),
      })),
      v4LiquidityResult: vi.fn(async () => ({
        tokenId: "12",
        liquidityDelta: "-1000",
        principal0: "1660",
        principal1: "602",
        fee0: "4821",
        fee1: "3132",
        balanceDelta0: "6481",
        balanceDelta1: "3734",
      })),
    });
    const { service, scope } = makeHarness(port, true);
    const result = await service.removeLiquidity(scope, NETWORK, V4);
    expect(result.token0).toMatchObject({
      amount: "1660",
      feeAmount: "4821",
      receivedAmount: "6481",
    });
    expect(result.token1).toMatchObject({
      amount: "602",
      feeAmount: "3132",
      receivedAmount: "3734",
    });
    expect(result.amountsEstimated).toBe(false);
  });
  it("warns and preserves estimates when the confirmed receipt is unavailable", async () => {
    const port = makeV4Port({ v4LiquidityResult: vi.fn(async () => undefined) });
    const { service, scope } = makeHarness(port, true);
    const result = await service.removeLiquidity(scope, NETWORK, V4);
    expect(result.amountsEstimated).toBe(true);
    expect(result.token0).toMatchObject({ receivedAmount: V4_WORTH.amount0 });
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_removal_amounts_mismatch" }),
    );
  });
});

function bookResolver(): SunSwapTokenResolver {
  const tokens = {
    official: () => [],
    effective: (_network: string, account: string) =>
      account === "wlt_main.0"
        ? [{ kind: "trc20", id: USDT, symbol: "MYUSD", decimals: 6, source: "user" }]
        : [],
  } as unknown as TokenRepository;
  return new SunSwapTokenResolver(tokens);
}

describe("remove-liquidity — symbols from the account's token book", () => {
  it("resolves a user-added symbol and publishes that it came from the book", async () => {
    const { service, scope } = makeHarness(makePort(), false, 0, bookResolver());
    Object.assign(scope, { activeAccount: "wlt_main.0" });
    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      token0: "MYUSD",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.token0).toMatchObject({ address: USDT });
    expect(result.fromTokenBook).toEqual([USDT]);
  });
});

describe("remove-liquidity — the contract's key", () => {
  it.each([
    ["dry run", { dryRun: true }],
    ["build", { buildOnly: true }],
    ["receipt", {}],
  ])("is positionManager on a V3 %s", async (_name, mode) => {
    const { service, scope } = makeHarness(makePort(), true);
    const result = await service.removeLiquidity(scope, NETWORK, { ...V3, ...mode });
    expect(result.positionManager).toBe(MANAGER);
    expect(result).not.toHaveProperty("router");
  });

  it.each([
    ["dry run", { dryRun: true }],
    ["build", { buildOnly: true }],
    ["receipt", {}],
  ])("is positionManager on a V4 %s", async (_name, mode) => {
    const { service, scope } = makeHarness(makeV4Port(), true);
    const result = await service.removeLiquidity(scope, NETWORK, { ...V4, ...mode });
    expect(result.positionManager).toBe(V4_MANAGER);
    expect(result).not.toHaveProperty("router");
  });

  it("stays router on V2", async () => {
    const { service, scope } = makeHarness();
    const result = await service.removeLiquidity(scope, NETWORK, { ...V2, dryRun: true });
    expect(result).toHaveProperty("router");
    expect(result).not.toHaveProperty("positionManager");
  });
});

describe("remove-liquidity — the risks the result states", () => {
  it("flags only the side whose floor is zero", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      min0: "0",
      dryRun: true,
    })) as Record<string, Record<string, unknown>>;
    expect(result.token0).toMatchObject({ amountMinimum: "0", acceptsAnyAmount: true });
    expect(result.token1).not.toHaveProperty("acceptsAnyAmount");
  });

  it("flags neither side when both have a floor", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      dryRun: true,
    })) as Record<string, Record<string, unknown>>;
    expect(result.token0).not.toHaveProperty("acceptsAnyAmount");
    expect(result.token1).not.toHaveProperty("acceptsAnyAmount");
  });

  it.each([
    ["V3 dry run", () => makePort(), { ...V3, dryRun: true }],
    ["V3 build", () => makePort(), { ...V3, buildOnly: true }],
    ["V3 receipt", () => makePort(), V3],
    ["V4 dry run", () => makeV4Port(), { ...V4, dryRun: true }],
    ["V4 receipt", () => makeV4Port(), V4],
  ])("says a %s also collects the position's fees", async (_name, port, input) => {
    const { service, scope } = makeHarness(port(), true);
    const result = await service.removeLiquidity(scope, NETWORK, input);
    expect(result.collectsFees).toBe(true);
  });

  it("does not say a V2 withdrawal collects fees", async () => {
    const { service, scope } = makeHarness();
    const result = await service.removeLiquidity(scope, NETWORK, { ...V2, dryRun: true });
    expect(result).not.toHaveProperty("collectsFees");
  });
});

describe("remove-liquidity — what reaches the recipient", () => {
  it("is the estimate on a dry run", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.removeLiquidity(scope, NETWORK, {
      ...V2,
      dryRun: true,
    })) as Record<string, Record<string, unknown>>;
    expect(result.token0).toMatchObject({ amount: "640812", receivedAmount: "640812" });
  });

  it("is the router's amount on a confirmed V2 receipt", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")),
      v2LiquidityResult: vi.fn(async () => ({
        amount0: baseUnitAmount("12"),
        amount1: baseUnitAmount("34"),
      })),
    });
    const { service, scope } = makeHarness(port, true);
    const result = await service.removeLiquidity(scope, NETWORK, V2);
    expect(result.token0).toMatchObject({ amount: "12", receivedAmount: "12" });
    expect(result.token1).toMatchObject({ amount: "34", receivedAmount: "34" });
  });

  it("is the whole Collect amount on a confirmed V3 receipt", async () => {
    const { service, scope } = makeHarness(makePort(), true);
    const result = await service.removeLiquidity(scope, NETWORK, V3);
    expect(result.token0).toMatchObject({ amount: "999999", receivedAmount: "1001199" });
    expect(result.token1).toMatchObject({ amount: "493088", receivedAmount: "493888" });
  });

  it("adds the owed fees to the principal estimate on a submitted V4 receipt", async () => {
    const port = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: "4821", amount1: "3132" })) as never,
    });
    const { service, scope } = makeHarness(port, false);
    const result = await service.removeLiquidity(scope, NETWORK, V4);
    expect(result.token0).toMatchObject({ feeAmount: "4821", receivedAmount: "1004820" });
    expect(result.token1).toMatchObject({ feeAmount: "3132", receivedAmount: "496220" });
  });
});
