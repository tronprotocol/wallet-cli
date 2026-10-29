import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { SunSwapLiquidityService } from "./liquidity-service.js";
import { SunSwapRemoveLiquidityService } from "./remove-liquidity-service.js";
import { SunSwapCollectFeesService } from "./collect-fees-service.js";
import { SigningService } from "../../../services/signing/signing-service.js";

const ROUTER = "TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy";
const MANAGER = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
const PAIR_ADDRESS = "TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

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

function port(): LiquidityPort {
  return {
    contracts: vi.fn(() => ({ v2Router: ROUTER, v3PositionManager: MANAGER, wtrx: WTRX })),
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v2PairState: vi.fn(async () => ({
      pairAddress: PAIR_ADDRESS,
      reserve0: "8971373980412",
      reserve1: "6154765875016",
      totalSupply: "7000000000000",
      lpDecimals: 6,
      exists: true,
    })),
    balanceOf: vi.fn(async () => "999999999999"),
    nativeBalance: vi.fn(async () => "999999999999"),
    allowance: vi.fn(async () => "999999999999"),
    approvalPayload: vi.fn(() => ({ target: USDT, method: "approve", parameters: [] })),
    v2AddLiquidityPayload: vi.fn(() => ({ target: ROUTER, method: "add", parameters: [] })),
    v2AddLiquidityEthPayload: vi.fn(() => ({ target: ROUTER, method: "addEth", parameters: [] })),
    v2RemoveLiquidityPayload: vi.fn(() => ({ target: ROUTER, method: "remove", parameters: [] })),
    v2RemoveLiquidityEthPayload: vi.fn(() => ({
      target: ROUTER,
      method: "removeEth",
      parameters: [],
    })),
    v3PoolState: vi.fn(async () => ({
      poolAddress: "Tpool",
      exists: true,
      sqrtPriceX96: "55743275095956664623638036817",
      currentTick: -7032,
      fee: 500,
      token0: USDT,
    })),
    v3Position: vi.fn(async () => POSITION),
    v3Amounts: vi.fn(() => ({ amount0: "1000000", amount1: "493089", liquidity: "14398816" })),
    v3AmountsForLiquidity: vi.fn(() => ({ amount0: "999999", amount1: "493088" })),
    v3MintPayload: vi.fn(() => ({ target: MANAGER, method: "mint", parameters: [] })),
    v3IncreasePayload: vi.fn(() => ({ target: MANAGER, method: "increase", parameters: [] })),
    v3RemovePayload: vi.fn(() => ({ target: MANAGER, method: "multicall", parameters: [] })),
    v3CollectFeesPayload: vi.fn(() => ({ target: MANAGER, method: "collect", parameters: [] })),
    v3OwedFees: vi.fn(async () => ({ amount0: "1200", amount1: "800" })),
    v3CollectedAmounts: vi.fn(async () => ({ amount0: "1001199", amount1: "493888" })),
    v3MintedPositionId: vi.fn(async () => "686"),
  } as unknown as LiquidityPort;
}

interface PipelineParams {
  mode?: string;
  build: (from: string) => Promise<unknown>;
  estimate: (tx: unknown) => Promise<Record<string, unknown>>;
}

const resolver = {
  resolvePair: (_n: NetworkDescriptor, input: object) => ({ input, resolved: [] }),
  resolve: (_n: NetworkDescriptor, value: string) => ({ USDT, WTRX })[value.toUpperCase()] ?? value,
  resolveSymbol: (_n: NetworkDescriptor, value: string) => value,
  label: () => "nile",
} as unknown as SunSwapTokenResolver;

function services() {
  const shared = port();
  const gateway = {
    triggerSmartContract: vi.fn(async (_f, _t, method) => ({ txID: `built:${method}` })),
    estimateResources: vi.fn(async () => ({ feeModel: "tron-resource" as const, energy: 1000 })),
  };
  const pipeline = {
    assertCanSign: vi.fn(),
    run: vi.fn(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      const fee = await p.estimate(tx);
      if (p.mode === "dry-run") return { stage: "plan", tx, fee };
      if (p.mode === "build-only") return { stage: "built", tx, hex: "0abc", fee };
      return { stage: "confirmed", txId: `tx:${tx.txID}`, blockNumber: 1, fee };
    }),
  } as unknown as TxPipeline;
  const gateways = { get: () => gateway } as unknown as ChainGatewayProvider;
  const scope = {
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress: () => OWNER,
    warn: vi.fn(),
  } as unknown as TransactionScope;
  return {
    scope,
    add: new SunSwapLiquidityService(
      shared,
      gateways,
      pipeline,
      resolver,
      noV4Permits,
      noV4Signers,
      new SigningService({} as never),
    ),
    remove: new SunSwapRemoveLiquidityService(shared, gateways, pipeline, resolver),
    collect: new SunSwapCollectFeesService(shared, gateways, pipeline, resolver),
  };
}

const SCALED: Record<string, string> = {
  amount: "decimals",
  amountMinimum: "decimals",
  feeAmount: "decimals",
  lpAmount: "lpDecimals",
  lpAmountExpected: "lpDecimals",
};

// Position liquidity is unscaled and must not require token decimals.
function unscaled(value: unknown, path = "data"): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => unscaled(entry, `${path}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const [key, scale] of Object.entries(SCALED)) {
    if (record[key] === undefined) continue;
    if (record[scale] === undefined) problems.push(`${path}.${key} has no ${scale} beside it`);
  }
  for (const [key, entry] of Object.entries(record)) {
    if (key in SCALED) continue;
    problems.push(...unscaled(entry, `${path}.${key}`));
  }
  return problems;
}

const MODES = [
  ["dry-run", { dryRun: true }],
  ["build-only", { buildOnly: true }],
  ["confirmed", {}],
] as const;

describe("every amount in a liquidity receipt carries its scale", () => {
  it.each(MODES)("add-liquidity V2, %s", async (_name, mode) => {
    const { add, scope } = services();
    const result = await add.addLiquidity(scope, NETWORK, {
      protocol: "V2",
      token0: USDT,
      token1: WTRX,
      amount0: "1",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });

  it.each(MODES)("add-liquidity V3 mint, %s", async (_name, mode) => {
    const { add, scope } = services();
    const result = await add.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      token0: USDT,
      token1: WTRX,
      fee: 500,
      amount0: "1",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });

  it.each(MODES)("add-liquidity V3 increase, %s", async (_name, mode) => {
    const { add, scope } = services();
    const result = await add.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      positionId: "686",
      amount0: "1",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });

  it.each(MODES)("remove-liquidity V2, %s", async (_name, mode) => {
    const { remove, scope } = services();
    const result = await remove.removeLiquidity(scope, NETWORK, {
      protocol: "V2",
      token0: USDT,
      token1: WTRX,
      liquidity: "0.5",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });

  it.each(MODES)("remove-liquidity V3, %s", async (_name, mode) => {
    const { remove, scope } = services();
    const result = await remove.removeLiquidity(scope, NETWORK, {
      protocol: "V3",
      positionId: "686",
      liquidity: "1000",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });

  it.each(MODES)("collect-fees V3, %s", async (_name, mode) => {
    const { collect, scope } = services();
    const result = await collect.collectFees(scope, NETWORK, {
      protocol: "V3",
      positionId: "686",
      ...mode,
    });
    expect(unscaled(result)).toEqual([]);
  });
});

describe("the walker itself", () => {
  it("catches an amount whose decimals were dropped", () => {
    expect(unscaled({ token0: { symbol: "USDT", amount: "1000000" } })).toEqual([
      "data.token0.amount has no decimals beside it",
    ]);
    expect(unscaled({ lpAmount: "766634" })).toEqual(["data.lpAmount has no lpDecimals beside it"]);
  });

  it("does not demand a scale for a position's liquidity, which has none", () => {
    expect(unscaled({ liquidity: "14398816", liquidityAfter: "28792272" })).toEqual([]);
  });
});

const noV4Permits = {
  planPermit: () => {
    throw new Error("V4 Permit2 planning is not part of this test");
  },
} as never;
const noV4Signers = {
  resolve: () => {
    throw new Error("V4 permit signing is not part of this test");
  },
} as never;
