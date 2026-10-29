import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import type { TokenRepository } from "../../../ports/token-repository.js";
import { SunSwapLiquidityService } from "./liquidity-service.js";
import {
  ChainError,
  UsageError,
  errorMessage,
  classifyError,
} from "../../../../domain/errors/index.js";
import { SigningService } from "../../../services/signing/signing-service.js";
import { baseUnitAmount, sunAmount } from "../../../../domain/amounts/index.js";

const ROUTER = "TMn1qrmYUMSTXo9babrJLzepKZoPC7M6Sy";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";

const ADD_LIQUIDITY =
  "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)";
const ADD_LIQUIDITY_ETH = "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)";
const MANAGER = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
const V3_MINT =
  "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))";
const V3_INCREASE = "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))";
const APPROVE = "approve(address,uint256)";

const NETWORK = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "3448148188",
  sunswap: { liquidity: true },
} as unknown as NetworkDescriptor;

const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const resolver = {
  resolvePair: (_n: NetworkDescriptor, input: object) => ({ input, resolved: [] }),
  resolve: (_n: NetworkDescriptor, value: string) =>
    ({ USDT, WTRX, TRX })[value.toUpperCase()] ?? value,
  resolveSymbol: (_n: NetworkDescriptor, value: string) => value,
  label: () => "nile",
} as unknown as SunSwapTokenResolver;

const FACTS: Record<string, { address: string; decimals: number; symbol: string }> = {
  [USDT]: { address: USDT, decimals: 6, symbol: "USDT" },
  [WTRX]: { address: WTRX, decimals: 6, symbol: "WTRX" },
};

// Reserves are in caller token order, as returned by the adapter.
const PAIR = {
  pairAddress: "TKioHQsGLkaEWwBwkUB2T4Rm6nwGATtJyh",
  reserve0: "8971373980412",
  reserve1: "6154765875016",
  totalSupply: "7000000000000",
  lpDecimals: 6,
  exists: true,
};

function makePort(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
  return {
    contracts: vi.fn(() => ({ v2Router: ROUTER, v3PositionManager: MANAGER, wtrx: WTRX })),
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v2PairState: vi.fn(async () => PAIR),
    v2LiquidityResult: vi.fn(async () => undefined),
    balanceOf: vi.fn(async () => "999999999999"),
    nativeBalance: vi.fn(async () => "999999999999"),
    allowance: vi.fn(async () => baseUnitAmount("0")),
    approvalPayload: vi.fn(
      (_n: NetworkDescriptor, token: string, spender: string, amount: string) => ({
        target: token,
        method: APPROVE,
        parameters: [
          { type: "address", value: spender },
          { type: "uint256", value: amount },
        ],
      }),
    ),
    v2AddLiquidityPayload: vi.fn(() => ({
      target: ROUTER,
      method: ADD_LIQUIDITY,
      parameters: [],
    })),
    v3PoolState: vi.fn(async (_n: NetworkDescriptor, token0: string, _t1: string, fee: number) => ({
      poolAddress: "TJwPHibREbzr54re3WrsGMvhcgGvW56d3D",
      exists: true,
      sqrtPriceX96: "55743275095956664623638036817",
      currentTick: -7032,
      fee,
      token0,
    })),
    v3Position: vi.fn(async (_n: NetworkDescriptor, tokenId: string) => ({
      tokenId,
      owner: OWNER,
      token0: USDT,
      token1: WTRX,
      fee: 500,
      tickLower: -8030,
      tickUpper: -6030,
      liquidity: "5662890812",
    })),
    v3Amounts: vi.fn(() => ({ amount0: "1000000", amount1: "493089", liquidity: "14398816" })),
    v3MintedPositionId: vi.fn(async () => "1846"),
    v3MintPayload: vi.fn(() => ({ target: MANAGER, method: V3_MINT, parameters: [] })),
    v3IncreasePayload: vi.fn(() => ({ target: MANAGER, method: V3_INCREASE, parameters: [] })),
    v2AddLiquidityEthPayload: vi.fn(
      (_n: NetworkDescriptor, request: { amountNativeDesired: string }) => ({
        target: ROUTER,
        method: ADD_LIQUIDITY_ETH,
        parameters: [],
        callValueSun: request.amountNativeDesired,
      }),
    ),
    ...overrides,
  } as unknown as LiquidityPort;
}

interface PipelineParams {
  mode?: string;
  dryRun?: boolean;
  buildOnly?: boolean;
  build: (from: string) => Promise<unknown>;
  estimate: (tx: unknown) => Promise<Record<string, unknown>>;
}

function makeHarness(
  port: LiquidityPort = makePort(),
  permits: unknown = noV4Permits,
  signers: unknown = noV4Signers,
  tokens: SunSwapTokenResolver = resolver,
) {
  const estimated: { method: string }[] = [];
  const callValues: (string | undefined)[] = [];
  const gateway = {
    triggerSmartContract: vi.fn(
      async (_from, target, method, _params, opts: { callValue?: string }) => {
        callValues.push(opts?.callValue);
        return { txID: `built:${method}`, target };
      },
    ),
    estimateResources: vi.fn(async (_from: string, _target: string, method: string) => {
      estimated.push({ method });
      return { feeModel: "tron-resource" as const, energy: 1000, energyPriceSun: "420" };
    }),
  };
  const assertCanSign = vi.fn();
  const pipeline = {
    assertCanSign,
    run: vi.fn(async (p: PipelineParams) => {
      const tx = await p.build(OWNER);
      const fee = await p.estimate(tx);
      if (p.mode === "dry-run") return { stage: "plan", tx, fee };
      if (p.mode === "build-only") return { stage: "built", tx, hex: "0abc", fee };
      return { stage: "confirmed", txId: `tx:${String((tx as { txID: string }).txID)}`, fee };
    }),
  } as unknown as TxPipeline;
  const warn = vi.fn();
  const scope = {
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress: () => OWNER,
    warn,
  } as unknown as TransactionScope;
  const service = new SunSwapLiquidityService(
    port,
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
    tokens,
    permits as never,
    signers as never,
    new SigningService({} as never),
  );
  return { service, scope, gateway, pipeline, port, estimated, assertCanSign, callValues };
}

const BASE = { protocol: "V2" as const, token0: USDT, token1: WTRX, amount0: "1" };

describe("SunSwapLiquidityService.addLiquidity — protocol", () => {
  it.each(["V5", "v3 ", "", "V2V3"])(
    "rejects %j from a non-CLI caller before any deposit path",
    async (protocol) => {
      const port = makePort();
      const { service, scope, gateway } = makeHarness(port);

      await expect(
        service.addLiquidity(scope, NETWORK, {
          ...BASE,
          protocol: protocol as never,
          dryRun: true,
        }),
      ).rejects.toMatchObject({ code: "invalid_value" });
      expect(port.v2PairState).not.toHaveBeenCalled();
      expect(gateway.triggerSmartContract).not.toHaveBeenCalled();
    },
  );

  it("accepts a lowercase protocol", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidity(scope, NETWORK, { ...BASE, protocol: "v2" as never, dryRun: true }),
    ).resolves.toMatchObject({ protocol: "V2" });
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — planning", () => {
  it("derives the other side from the pool's reserves and floors both at 95%", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0).toMatchObject({ amount: "1000000", amountMinimum: "950000" });
    expect(result.token1).toMatchObject({ amount: "686044", amountMinimum: "651741" });
    expect(result.token0).not.toHaveProperty("acceptsAnyAmount");
    expect(result.token1).not.toHaveProperty("acceptsAnyAmount");
  });

  it("flags only the side given a zero floor as accepting any amount", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      min1: "0",
      dryRun: true,
    })) as Record<string, Record<string, unknown>>;

    expect(result.token0).not.toHaveProperty("acceptsAnyAmount");
    expect(result.token1).toMatchObject({ amountMinimum: "0", acceptsAnyAmount: true });
  });

  it("reports the LP tokens the deposit should mint", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    // The two sides yield 780259 and 780258 LP units; minting uses the smaller.
    expect(result.lpAmountExpected).toBe("780258");
  });

  it("refuses a pair whose two sides are the same token", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidityV2(scope, NETWORK, { ...BASE, token1: USDT, dryRun: true }),
    ).rejects.toMatchObject({ code: "same_token" });
  });

  it("refuses a one-sided deposit into a pool that holds nothing", async () => {
    const port = makePort({
      v2PairState: vi.fn(async () => ({ ...PAIR, totalSupply: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidityV2(scope, NETWORK, { ...BASE, dryRun: true }),
    ).rejects.toMatchObject({ code: "pool_not_found" });
  });

  it("refuses a deposit the account cannot cover", async () => {
    const port = makePort({ balanceOf: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidityV2(scope, NETWORK, { ...BASE, dryRun: true }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
  });

  it("requires at least one amount", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidityV2(scope, NETWORK, {
        protocol: "V2",
        token0: USDT,
        token1: WTRX,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "missing_option" });
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — the approval decision", () => {
  it("plans one approval per short side, for exactly the amount, to the router", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as { approvals: { token: string; spender: string; amount: string }[] };

    expect(result.approvals).toEqual([
      expect.objectContaining({ token: USDT, spender: ROUTER, amount: "1000000" }),
      expect.objectContaining({ token: WTRX, spender: ROUTER, amount: "686044" }),
    ]);
  });

  it("plans no approval at all when the allowances already suffice", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty("approvals");
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — --dry-run", () => {
  it("resolves no signer, so a watch-only account can preview a deposit", async () => {
    const { service, scope, assertCanSign } = makeHarness();

    await service.addLiquidityV2(scope, NETWORK, { ...BASE, dryRun: true });

    expect(assertCanSign).not.toHaveBeenCalled();
  });

  it("names its contract router", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.router).toBe(ROUTER);
    expect(result).not.toHaveProperty("positionManager");
  });

  it("prices the deposit for real once the allowances are in place", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope, estimated } = makeHarness(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as { fee: Record<string, unknown>; feeCovers: string };

    expect(result.feeCovers).toBe("all");
    expect(result.fee).toMatchObject({ energy: 1000 });
    expect(estimated.map((call) => call.method)).toEqual([ADD_LIQUIDITY]);
  });

  it("prices the approvals only, and never estimates the deposit, while an approval is pending", async () => {
    const { service, scope, estimated } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as { fee: Record<string, unknown>; feeCovers: string };

    expect(result.feeCovers).toBe("approvals");
    expect(result.fee).toMatchObject({ energy: 2000 });
    expect(estimated.map((call) => call.method)).toEqual([APPROVE, APPROVE]);
  });

  it("always carries a fee key, because a missing one reads as free", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result).toHaveProperty("fee");
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — --build-only", () => {
  it("emits the approvals and the deposit in execution order", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      buildOnly: true,
    })) as { transactions: { purpose: string; tx: unknown }[]; feeCovers: string };

    expect(result.transactions.map((entry) => entry.purpose)).toEqual([
      "approval",
      "approval",
      "main",
    ]);
    expect(result.transactions.every((entry) => entry.tx !== undefined)).toBe(true);
    expect(result.feeCovers).toBe("approvals");
  });

  it("does not estimate the deposit either — the gate is on the payload, not the mode", async () => {
    const { service, scope, estimated } = makeHarness();

    await service.addLiquidityV2(scope, NETWORK, { ...BASE, buildOnly: true });

    expect(estimated.map((call) => call.method)).toEqual([APPROVE, APPROVE]);
  });

  it("keeps the ordinary single-transaction shape when nothing needs approving", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      buildOnly: true,
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty("transactions");
    expect(result.mode).toBe("build-only");
    expect(result.hex).toBe("0abc");
    expect(result.feeCovers).toBe("all");
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — broadcasting", () => {
  it("retains the deposit ID and confirmed approval IDs when submission times out", async () => {
    const port = makePort({
      allowance: vi
        .fn()
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce("0")
        .mockResolvedValue("999999999999"),
    });
    const { service, scope, pipeline } = makeHarness(port);
    const original = new ChainError("timeout", errorMessage`node: ${"untrusted\nvalue"}`, {
      txId: "deposit-tx",
      nodeCode: "fixture",
    });
    vi.mocked(pipeline.run)
      .mockResolvedValueOnce({ stage: "confirmed", txId: "approval-1" })
      .mockResolvedValueOnce({ stage: "confirmed", txId: "approval-2" })
      .mockRejectedValueOnce(original);
    const error = classifyError(await service.addLiquidityV2(scope, NETWORK, BASE).catch((e) => e));
    expect(error.code).toBe("timeout");
    expect(error.details).toEqual({
      txId: "deposit-tx",
      nodeCode: "fixture",
      approvalTxIds: ["approval-1", "approval-2"],
    });
    expect(error.textMessage).toBe(
      `${original.textMessage}; approval transactions already submitted: approval-1, approval-2`,
    );
  });

  it("re-reads the allowance after each approval and refuses to deposit if it fell short", async () => {
    const port = makePort({ allowance: vi.fn(async () => baseUnitAmount("0")) as never });
    const { service, scope } = makeHarness(port);

    await expect(service.addLiquidityV2(scope, NETWORK, BASE)).rejects.toMatchObject({
      code: "execution_reverted",
    });
  });

  it("sends each approval, confirms it, then the deposit — never together", async () => {
    let allowance = "0";
    const port = makePort({
      allowance: vi.fn(async () => allowance) as never,
    });
    const { service, scope, gateway, pipeline } = makeHarness(port);
    (pipeline.run as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      async (p: PipelineParams) => {
        const tx = (await p.build(OWNER)) as { txID: string };
        const fee = await p.estimate(tx);
        allowance = "999999999999";
        return { stage: "confirmed", txId: `tx:${tx.txID}`, fee };
      },
    );

    const result = (await service.addLiquidityV2(scope, NETWORK, BASE)) as {
      approvalTxIds: string[];
      txId: string;
      kind: string;
    };

    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([
      APPROVE,
      APPROVE,
      ADD_LIQUIDITY,
    ]);
    expect(result.approvalTxIds).toHaveLength(2);
    expect(result.txId).toBe(`tx:built:${ADD_LIQUIDITY}`);
    expect(result.kind).toBe("sunswap-add-liquidity");
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — symbols", () => {
  it("resolves a symbol to an address before anything asks the chain about it", async () => {
    const { service, scope, port } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      protocol: "V2",
      token0: "USDT",
      token1: "WTRX",
      amount0: "1",
      dryRun: true,
    })) as { token0: { address: string }; token1: { address: string } };

    expect(port.tokenFacts).toHaveBeenCalledWith(NETWORK, USDT);
    expect(result.token0.address).toBe(USDT);
    expect(result.token1.address).toBe(WTRX);
  });

  it("refuses a symbol paired with its own address", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidityV2(scope, NETWORK, {
        protocol: "V2",
        token0: "USDT",
        token1: USDT,
        amount0: "1",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "same_token" });
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — native TRX", () => {
  const NATIVE = { protocol: "V2" as const, token0: "TRX", token1: USDT, amount1: "1" };

  it("deposits through addLiquidityETH, carrying the TRX as the call's value", async () => {
    const { service, scope, gateway, callValues } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...NATIVE,
      buildOnly: true,
    })) as { token0: { amount: string } };

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toContain(ADD_LIQUIDITY_ETH);
    expect(methods).not.toContain(ADD_LIQUIDITY);
    const deposit = methods.indexOf(ADD_LIQUIDITY_ETH);
    expect(BigInt(result.token0.amount)).toBeGreaterThan(0n);
    expect(callValues[deposit]).toBe(result.token0.amount);
    expect(callValues[methods.indexOf(APPROVE)]).toBe("0");
  });

  it("approves only the TRC20 side — native TRX has no allowance to grant", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...NATIVE,
      dryRun: true,
    })) as { approvals: { token: string }[] };

    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]!.token).toBe(USDT);
  });

  it("finds the pool through WTRX while still naming the side TRX", async () => {
    const { service, scope, port } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...NATIVE,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(port.v2PairState).toHaveBeenCalledWith(NETWORK, WTRX, USDT);
    expect(result.token0).toMatchObject({ address: TRX, symbol: "TRX" });
  });

  it("checks the native balance against the account, not against a contract", async () => {
    const port = makePort({ nativeBalance: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidityV2(scope, NETWORK, { ...NATIVE, dryRun: true }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
    expect(port.nativeBalance).toHaveBeenCalled();
  });

  it("keeps WTRX a plain TRC20 — naming it is how a caller chooses the wrapped pool", async () => {
    const { service, scope, gateway } = makeHarness();

    await service.addLiquidityV2(scope, NETWORK, {
      protocol: "V2",
      token0: "WTRX",
      token1: USDT,
      amount1: "1",
      buildOnly: true,
    });

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toContain(ADD_LIQUIDITY);
    expect(methods).not.toContain(ADD_LIQUIDITY_ETH);
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — the confirmed receipt", () => {
  function confirming(port: LiquidityPort) {
    const harness = makeHarness(port);
    (
      harness.pipeline.run as unknown as { mockImplementation: (fn: unknown) => void }
    ).mockImplementation(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      const fee = await p.estimate(tx);
      return { stage: "confirmed", txId: `tx:${tx.txID}`, blockNumber: 57884231, fee };
    });
    return harness;
  }

  it("isolates this deposit from concurrent swaps and LP transfers", async () => {
    let pairReads = 0;
    const port = makePort({
      v2LiquidityResult: vi.fn(async () => ({
        amount0: baseUnitAmount("900000"),
        amount1: baseUnitAmount("686044"),
        lpAmount: baseUnitAmount("780258"),
      })),
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
      v2PairState: vi.fn(async () => {
        pairReads += 1;
        return pairReads === 1
          ? PAIR
          : { ...PAIR, reserve0: "8971374980412", reserve1: "6154766461060" };
      }) as never,
      balanceOf: vi.fn(async (_n: NetworkDescriptor, token: string) =>
        token === PAIR.pairAddress ? (pairReads > 1 ? "880258" : "0") : "999999999999",
      ) as never,
    });
    const { service, scope } = confirming(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, BASE)) as Record<string, never>;

    expect(result.token0).toMatchObject({ amount: "900000", symbol: "USDT", decimals: 6 });
    expect(result.token1).toMatchObject({ amount: "686044", symbol: "WTRX", decimals: 6 });
    expect(result.lpAmount).toBe("780258");
    expect(result.reservesAfter).toEqual({
      token0: "8971374980412",
      token1: "6154766461060",
    });
  });

  it("keeps estimates explicit when the router result is missing", async () => {
    const port = makePort({ allowance: vi.fn(async () => baseUnitAmount("999999999999")) });
    const { service, scope } = confirming(port);
    const result = await service.addLiquidityV2(scope, NETWORK, BASE);
    expect(result.stage).toBe("confirmed");
    expect(result.amountsEstimated).toBe(true);
    expect(result).not.toHaveProperty("lpAmount");
    expect(scope.warn).toHaveBeenCalled();
  });

  it("leaves a submitted receipt alone — there is nothing on chain to read back", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope, pipeline } = makeHarness(port);
    (pipeline.run as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      async (p: PipelineParams) => {
        const tx = (await p.build(OWNER)) as { txID: string };
        return { stage: "submitted", txId: `tx:${tx.txID}`, fee: await p.estimate(tx) };
      },
    );

    const result = (await service.addLiquidityV2(scope, NETWORK, BASE)) as Record<string, unknown>;

    expect(result).not.toHaveProperty("lpAmount");
    expect(result).not.toHaveProperty("reservesAfter");
    expect(result.token0).toMatchObject({ amount: "1000000" });
  });

  it("warns rather than fails when the follow-up read is unavailable", async () => {
    let pairReads = 0;
    const port = makePort({
      v2LiquidityResult: vi.fn(async () => ({
        amount0: baseUnitAmount("900000"),
        amount1: baseUnitAmount("686044"),
        lpAmount: baseUnitAmount("780258"),
      })),
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
      v2PairState: vi.fn(async () => {
        pairReads += 1;
        if (pairReads > 1) throw new Error("node unavailable");
        return PAIR;
      }) as never,
    });
    const { service, scope } = confirming(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, BASE)) as Record<string, unknown>;

    expect(result.token0).toMatchObject({ amount: "900000" });
    expect(result.lpAmount).toBe("780258");
    expect(result.lpDecimals).toBe(6);
    expect(result.amountsEstimated).toBe(false);
    expect(result.txId).toBe(`tx:built:${ADD_LIQUIDITY}`);
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_liquidity_reserves_unavailable" }),
    );
  });
});

describe("SunSwapLiquidityService.addLiquidity — V3 mint", () => {
  const MINT = { protocol: "V3" as const, token0: USDT, token1: WTRX, fee: 500, amount0: "1" };

  it("defaults the tier to 3000 and the range to the current tick, and says it chose them", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      token0: USDT,
      token1: WTRX,
      amount0: "1",
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.feeTier).toBe(3000);
    expect(result.tickLower).toBe(-13020);
    expect(result.tickUpper).toBe(-1020);
    expect(result.feeAuto).toBe(true);
    expect(result.tickRangeAuto).toBe(true);
  });

  it("marks a caller's own tier and range as theirs, not defaults", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...MINT,
      tickLower: -8030,
      tickUpper: -6030,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty("feeAuto");
    expect(result).not.toHaveProperty("tickRangeAuto");
  });

  it("refuses a tick off the tier's grid rather than rounding it on", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidity(scope, NETWORK, {
        ...MINT,
        tickLower: -8033,
        tickUpper: -6030,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("refuses a fee tier that does not exist", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.addLiquidity(scope, NETWORK, { ...MINT, fee: 250, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("floors both sides at zero, unlike V2's 95%", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...MINT,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0!.amountMinimum).toBe("0");
    expect(result.token1!.amountMinimum).toBe("0");
    expect(result.token0).toMatchObject({ acceptsAnyAmount: true });
    expect(result.token1).toMatchObject({ acceptsAnyAmount: true });
  });

  it.each([
    ["a dry run", { dryRun: true }],
    ["a build", { buildOnly: true }],
  ])("publishes positionManager and liquidityExpected on %s", async (_name, mode) => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, { ...MINT, ...mode })) as Record<
      string,
      unknown
    >;

    expect(result.positionManager).toBe(MANAGER);
    expect(result.liquidityExpected).toBe("14398816");
    expect(result).not.toHaveProperty("router");
    expect(result).not.toHaveProperty("liquidity");
  });

  it("keeps liquidity, not liquidityExpected, on the confirmed receipt", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.addLiquidity(scope, NETWORK, MINT)) as Record<string, unknown>;

    expect(result.positionManager).toBe(MANAGER);
    expect(result).toHaveProperty("liquidity");
    expect(result).not.toHaveProperty("liquidityExpected");
    expect(result).not.toHaveProperty("router");
  });

  it("approves the position manager, not the V2 router", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...MINT,
      dryRun: true,
    })) as { approvals: { spender: string }[] };

    expect(result.approvals.every((approval) => approval.spender === MANAGER)).toBe(true);
  });

  it("refuses a deposit that would hold no liquidity, naming the reason", async () => {
    const port = makePort({
      v3Amounts: vi.fn(() => ({ amount0: "0", amount1: "0", liquidity: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidity(scope, NETWORK, { ...MINT, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("says so when the pool was initialised and never traded", async () => {
    const port = makePort({
      v3PoolState: vi.fn(async () => ({
        poolAddress: "Tpool",
        exists: true,
        sqrtPriceX96: "4295128740",
        currentTick: -887272,
        fee: 3000,
        token0: USDT,
      })) as never,
      v3Amounts: vi.fn(() => ({ amount0: "0", amount1: "0", liquidity: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidity(scope, NETWORK, { ...MINT, dryRun: true }),
    ).rejects.toMatchObject({ message: expect.stringContaining("never traded") });
  });

  it("mints rather than increases, and reports the position as new", async () => {
    const { service, scope, gateway } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...MINT,
      buildOnly: true,
    })) as Record<string, unknown>;

    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toContain(V3_MINT);
    expect(result.newPosition).toBe(true);
  });
});

describe("SunSwapLiquidityService.addLiquidity — V3 increase", () => {
  const INCREASE = { protocol: "V3" as const, positionId: "1846", amount0: "1" };

  it("reads the pair, the tier and the range off the position", async () => {
    const { service, scope, port } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...INCREASE,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(port.v3Position).toHaveBeenCalledWith(NETWORK, "1846");
    expect(result.feeTier).toBe(500);
    expect(result.tickLower).toBe(-8030);
    expect(result.tickUpper).toBe(-6030);
    expect(result.nftTokenId).toBe("1846");
    expect(result.newPosition).toBe(false);
    expect(result).not.toHaveProperty("feeAuto");
    expect(result).not.toHaveProperty("tickRangeAuto");
  });

  it("refuses a position the account does not hold, naming the owner", async () => {
    const port = makePort({
      v3Position: vi.fn(async (_n: NetworkDescriptor, tokenId: string) => ({
        tokenId,
        owner: "TSomeoneElse1111111111111111111111",
        token0: USDT,
        token1: WTRX,
        fee: 500,
        tickLower: -8030,
        tickUpper: -6030,
        liquidity: "1",
      })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.addLiquidity(scope, NETWORK, { ...INCREASE, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("TSomeoneElse1111111111111111111111"),
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
      service.addLiquidity(scope, NETWORK, { ...INCREASE, dryRun: true }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  it("re-reads the owner immediately before sending, not only in the dry run", async () => {
    const { service, scope, port } = makeHarness();
    (port.allowance as unknown as { mockResolvedValue: (v: string) => void }).mockResolvedValue(
      "999999999999",
    );

    await service.addLiquidity(scope, NETWORK, INCREASE);

    // Planning, pre-send ownership check, then post-confirmation liquidity read.
    expect((port.v3Position as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      3,
    );
  });

  it("calls increaseLiquidity, never mint", async () => {
    const { service, scope, gateway } = makeHarness();

    await service.addLiquidity(scope, NETWORK, { ...INCREASE, buildOnly: true });

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toContain(V3_INCREASE);
    expect(methods).not.toContain(V3_MINT);
  });
});

describe("SunSwapLiquidityService — the minted position's id", () => {
  function confirmingHarness(port = makePort()) {
    const harness = makeHarness(port);
    (
      harness.pipeline.run as unknown as { mockImplementation: (fn: unknown) => void }
    ).mockImplementation(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      return { stage: "confirmed", txId: `tx:${tx.txID}`, fee: await p.estimate(tx) };
    });
    return harness;
  }

  it("reads it from the confirmed transaction's own log", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = confirmingHarness(port);

    const result = (await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      token0: USDT,
      token1: WTRX,
      fee: 500,
      amount0: "1",
    })) as Record<string, unknown>;

    expect(result.nftTokenId).toBe("1846");
    expect(result.newPosition).toBe(true);
  });

  it("warns rather than fails when the log cannot be read", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
      v3MintedPositionId: vi.fn(async () => undefined) as never,
    });
    const { service, scope } = confirmingHarness(port);

    const result = (await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      token0: USDT,
      token1: WTRX,
      fee: 500,
      amount0: "1",
    })) as Record<string, unknown>;

    expect(result).not.toHaveProperty("nftTokenId");
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_position_id_mismatch" }),
    );
  });

  it("does not look for one when adding to a position that already exists", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
    });
    const { service, scope } = confirmingHarness(port);

    await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      positionId: "1846",
      amount0: "1",
    });

    expect(port.v3MintedPositionId).not.toHaveBeenCalled();
  });
});

describe("SunSwapLiquidityService — the liquidity a V3 deposit actually gained", () => {
  function confirmingHarness(port: LiquidityPort) {
    const harness = makeHarness(port);
    (
      harness.pipeline.run as unknown as { mockImplementation: (fn: unknown) => void }
    ).mockImplementation(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      return { stage: "confirmed", txId: `tx:${tx.txID}`, fee: await p.estimate(tx) };
    });
    return harness;
  }

  it("uses the V3 IncreaseLiquidity receipt even if later position state has changed", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")),
      v3DepositedAmounts: vi.fn(async () => ({
        tokenId: "686",
        liquidity: "12345",
        amount0: baseUnitAmount("999000"),
        amount1: baseUnitAmount("173000"),
      })),
    });
    const { service, scope } = confirmingHarness(port);
    await expect(
      service.addLiquidity(scope, NETWORK, {
        protocol: "V3",
        positionId: "686",
        amount0: "1",
      }),
    ).resolves.toMatchObject({
      liquidity: "12345",
      token0: { amount: "999000" },
      token1: { amount: "173000" },
      amountsEstimated: false,
    });
  });

  it("reads the position back rather than echoing what was planned", async () => {
    let reads = 0;
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
      v3Position: vi.fn(async (_n: NetworkDescriptor, tokenId: string) => {
        reads += 1;
        return {
          tokenId,
          owner: OWNER,
          token0: USDT,
          token1: WTRX,
          fee: 500,
          tickLower: -8030,
          tickUpper: -6030,
          liquidity: reads <= 2 ? "14398816" : "28793272",
        };
      }) as never,
    });
    const { service, scope } = confirmingHarness(port);

    const result = (await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      positionId: "686",
      amount0: "1",
    })) as Record<string, unknown>;

    expect(result.liquidity).toBe("14394456");
    expect(result.liquidityAfter).toBe("28793272");
  });

  it("counts a new position's whole liquidity as what this call added", async () => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")) as never,
      v3Position: vi.fn(async (_n: NetworkDescriptor, tokenId: string) => ({
        tokenId,
        owner: OWNER,
        token0: USDT,
        token1: WTRX,
        fee: 500,
        tickLower: -8030,
        tickUpper: -6030,
        liquidity: "14394456",
      })) as never,
    });
    const { service, scope } = confirmingHarness(port);

    const result = (await service.addLiquidity(scope, NETWORK, {
      protocol: "V3",
      token0: USDT,
      token1: WTRX,
      fee: 500,
      amount0: "1",
    })) as Record<string, unknown>;

    expect(result.liquidity).toBe("14394456");
    expect(result.liquidityAfter).toBe("14394456");
  });
});

describe("SunSwapLiquidityService.addLiquidity — V4 increase", () => {
  const V4_MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const PERMIT2 = "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax";
  const MODIFY = "modifyLiquidities(bytes,uint256)";
  const POOL_ID = "2f8c".padEnd(64, "a");
  const PARAMETERS = `0x${"0".repeat(58)}0c0000`;

  const POOL = {
    poolId: POOL_ID,
    exists: true,
    sqrtPriceX96: "79228162514264337593543950336",
    currentTick: -35,
    liquidity: "1000000",
    currency0: USDT,
    currency1: WTRX,
    fee: 500,
    tickSpacing: 12,
    hooks: TRX,
    parameters: PARAMETERS,
  };
  const POSITION = {
    tokenId: "12",
    owner: OWNER,
    poolId: POOL_ID,
    currency0: USDT,
    currency1: WTRX,
    fee: 500,
    tickSpacing: 12,
    hooks: TRX,
    // Use a nondefault range to detect accidental replacement with the pool default.
    tickLower: -1284,
    tickUpper: 1116,
    liquidity: "5000000",
    hasSubscriber: false,
  };
  const SIZED = { amount0: "1000000", amount1: "173468", liquidity: "97941773" };
  const MAX_UINT256 = (2n ** 256n - 1n).toString();

  function v4Port(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
    return makePort({
      v4Position: vi.fn(async () => POSITION),
      v4PoolState: vi.fn(async () => POOL),
      v4Amounts: vi.fn(() => SIZED),
      permit2Address: vi.fn(() => PERMIT2),
      v4PositionManager: vi.fn(() => V4_MANAGER),
      v4IncreasePayload: vi.fn(() => ({ target: V4_MANAGER, method: MODIFY, parameters: [] })),
      v4DepositPayload: vi.fn(() => {
        throw new Error("an increase must not build a mint");
      }),
      allowance: vi.fn(async () => MAX_UINT256),
      ...overrides,
    } as Partial<LiquidityPort>);
  }

  const standingGrants = { planPermit: vi.fn(async () => undefined) };
  const signers = { resolve: vi.fn(() => ({})) };

  const BASE_V4 = {
    protocol: "V4",
    positionId: "12",
    token0: "USDT",
    token1: "WTRX",
    amount0: "1",
  };

  function run(input: Record<string, unknown>, port = v4Port()) {
    const h = makeHarness(port, standingGrants, signers);
    return { ...h, result: h.service.addLiquidity(h.scope, NETWORK, input as never) };
  }

  it("builds unsigned approvals before the V4 deposit without checking that they landed", async () => {
    const port = v4Port({ allowance: vi.fn(async () => baseUnitAmount("0")) });
    const { result, estimated, pipeline } = run({ ...BASE_V4, buildOnly: true }, port);
    await expect(result).resolves.toMatchObject({
      mode: "build-only",
      liquidityExpected: SIZED.liquidity,
      transactions: [
        { purpose: "approval", hex: "0abc" },
        { purpose: "approval", hex: "0abc" },
        { purpose: "main", hex: "0abc" },
      ],
      feeCovers: "approvals",
    });
    expect(port.allowance).toHaveBeenCalledTimes(2);
    expect(estimated.map((entry) => entry.method)).toEqual([APPROVE, APPROVE]);
    expect(
      vi.mocked(pipeline.run).mock.calls.every(([options]) => options.mode === "build-only"),
    ).toBe(true);
  });

  it("builds a single V4 transaction when both allowance layers already suffice", async () => {
    const { result } = run({ ...BASE_V4, buildOnly: true });
    await expect(result).resolves.toMatchObject({
      mode: "build-only",
      hex: "0abc",
      feeCovers: "all",
    });
    await expect(result).resolves.not.toHaveProperty("transactions");
  });

  it("uses receipt settlement amounts and liquidity instead of planning and later position deltas", async () => {
    const port = v4Port({
      v4LiquidityResult: vi.fn(async () => ({
        tokenId: "12",
        liquidityDelta: "12345",
        principal0: "-999000",
        principal1: "-173000",
        fee0: "100",
        fee1: "20",
        balanceDelta0: "-998900",
        balanceDelta1: "-172980",
      })),
    });
    await expect(run(BASE_V4, port).result).resolves.toMatchObject({
      token0: { amount: "998900" },
      token1: { amount: "172980" },
      liquidity: "12345",
      amountsEstimated: false,
    });
  });

  it("refuses a pair that is not the one the position holds, naming both", async () => {
    const { result } = run({ ...BASE_V4, token1: USDT, dryRun: true });
    await expect(result).rejects.toMatchObject({ code: "invalid_value" });
    await expect(result).rejects.toThrow(POSITION.tokenId);
    await expect(result).rejects.toThrow(WTRX);
  });

  it.each([6, 18])(
    "refuses a reversed pair before sizing (second token decimals=%i)",
    async (decimals) => {
      const port = v4Port({
        tokenFacts: vi.fn(async (_n, address) => ({
          ...FACTS[address]!,
          decimals: address === WTRX ? decimals : 6,
        })),
      });
      const { result, pipeline } = run(
        { ...BASE_V4, token0: "WTRX", token1: "USDT", amount0: "1", dryRun: true },
        port,
      );
      await expect(result).rejects.toMatchObject({
        code: "invalid_value",
        message: expect.stringContaining(`--token0 ${USDT} --token1 ${WTRX}`),
      });
      await expect(result).rejects.toThrow("--amount0 / --amount1");
      expect(port.v4Amounts).not.toHaveBeenCalled();
      expect(port.v4IncreasePayload).not.toHaveBeenCalled();
      expect(pipeline.run).not.toHaveBeenCalled();
    },
  );

  it("scales amounts by their assets when the pair is in position order", async () => {
    const port = v4Port({
      tokenFacts: vi.fn(async (_n, address) => ({
        ...FACTS[address]!,
        decimals: address === WTRX ? 18 : 6,
      })),
    });
    await run({ ...BASE_V4, amount0: "1", amount1: "2", dryRun: true }, port).result;
    expect(port.v4Amounts).toHaveBeenCalledWith(POOL, expect.anything(), {
      amount0: "1000000",
      amount1: "2000000000000000000",
    });
  });

  it("refuses a --fee that is not the tier the position's pool is in", async () => {
    const { result } = run({ ...BASE_V4, fee: 3000, dryRun: true });
    await expect(result).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("refuses a position this account does not hold", async () => {
    const port = v4Port({
      v4Position: vi.fn(async () => ({ ...POSITION, owner: ROUTER })),
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("reports an id that was never minted as position_not_found", async () => {
    const port = v4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }) as never,
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "position_not_found" });
  });

  it.each([
    ["--recipient", { recipient: ROUTER }],
    ["--tick-lower", { tickLower: -120 }],
    ["--tick-upper", { tickUpper: 120 }],
    ["--create-pool", { createPool: true }],
  ])("refuses %s even when the schema is bypassed", async (_flag, extra) => {
    const { result } = run({ ...BASE_V4, ...extra, dryRun: true });
    await expect(result).rejects.toMatchObject({ code: "invalid_option" });
  });

  it("requires the pair, which is the only guard on the position id", async () => {
    const { result } = run({ protocol: "V4", positionId: "12", amount0: "1", dryRun: true });
    await expect(result).rejects.toMatchObject({ code: "missing_option" });
  });

  it("reports the position's own range and pool, not a default band", async () => {
    const { result } = run({ ...BASE_V4, dryRun: true });
    await expect(result).resolves.toMatchObject({
      protocol: "V4",
      nftTokenId: "12",
      newPosition: false,
      poolId: POOL_ID,
      tickLower: -1284,
      tickUpper: 1116,
      feeTier: 500,
      tickSpacing: 12,
      hooks: "none",
      liquidityExpected: SIZED.liquidity,
    });
  });

  it.each([
    ["a dry run", { dryRun: true }],
    ["a build", { buildOnly: true }],
  ])("publishes positionManager and liquidityExpected on %s", async (_name, mode) => {
    const result = (await run({ ...BASE_V4, ...mode }).result) as Record<string, unknown>;
    expect(result.positionManager).toBe(V4_MANAGER);
    expect(result.liquidityExpected).toBe(SIZED.liquidity);
    expect(result).not.toHaveProperty("router");
    expect(result).not.toHaveProperty("liquidity");
  });

  it("publishes positionManager and liquidity on the confirmed receipt", async () => {
    const result = (await run(BASE_V4).result) as Record<string, unknown>;
    expect(result.positionManager).toBe(V4_MANAGER);
    expect(result).toHaveProperty("liquidity");
    expect(result).not.toHaveProperty("liquidityExpected");
    expect(result).not.toHaveProperty("router");
  });

  it("does not mark the range as chosen by the CLI", async () => {
    await expect(run({ ...BASE_V4, dryRun: true }).result).resolves.not.toHaveProperty(
      "tickRangeAuto",
    );
  });

  it("builds the increase from the position's own pool key, verbatim", async () => {
    const port = v4Port();
    const { result } = run({ ...BASE_V4, deadline: 4102444800 }, port);
    await result;
    expect(port.v4IncreasePayload).toHaveBeenCalledWith(NETWORK, {
      pool: {
        currency0: USDT,
        currency1: WTRX,
        hooks: TRX,
        fee: 500,
        parameters: PARAMETERS,
      },
      tokenId: "12",
      liquidity: SIZED.liquidity,
      amount0Max: SIZED.amount0,
      amount1Max: SIZED.amount1,
      owner: OWNER,
      sweepRecipient: OWNER,
      deadline: 4102444800,
      permits: [],
    });
  });

  it.each([1, 4102444800.5])(
    "refuses --deadline %s before building the increase",
    async (deadline) => {
      const port = v4Port();
      await expect(run({ ...BASE_V4, deadline }, port).result).rejects.toMatchObject({
        code: "invalid_value",
      });
      expect(port.v4IncreasePayload).not.toHaveBeenCalled();
    },
  );

  it("widens the ceiling upward when --slippage is given", async () => {
    const port = v4Port();
    await run({ ...BASE_V4, slippage: "0.01", deadline: 4102444800 }, port).result;
    const request = (port.v4IncreasePayload as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as { amount0Max: string; amount1Max: string };
    expect(BigInt(request.amount0Max)).toBeGreaterThan(BigInt(SIZED.amount0));
    expect(BigInt(request.amount1Max)).toBeGreaterThan(BigInt(SIZED.amount1));
  });

  it("publishes the ceiling only when a tolerance moved it", async () => {
    await expect(run({ ...BASE_V4, dryRun: true }).result).resolves.not.toHaveProperty(
      "amount0Max",
    );
    await expect(
      run({ ...BASE_V4, slippage: "0.01", dryRun: true }).result,
    ).resolves.toHaveProperty("amount0Max");
  });

  it("checks the native balance against the ceiling", async () => {
    const port = v4Port({
      v4Position: vi.fn(async () => ({ ...POSITION, currency0: TRX })),
      v4PoolState: vi.fn(async () => ({ ...POOL, currency0: TRX })),
      nativeBalance: vi.fn(async () => sunAmount(SIZED.amount0)),
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, token0: "TRX", slippage: "0.01", dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("re-reads the holder before sending", async () => {
    const port = v4Port();
    await run(BASE_V4, port).result;
    expect(port.v4Position).toHaveBeenCalledTimes(3);
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

describe("SunSwapLiquidityService.addLiquidity — V4 mint", () => {
  const V4_MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const PERMIT2 = "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax";
  const POOL_ID = "2f8c".padEnd(64, "a");
  const PARAMETERS = `0x${"0".repeat(58)}0c0000`;
  const MAX_UINT256 = (2n ** 256n - 1n).toString();

  const POOL = {
    poolId: POOL_ID,
    exists: true,
    sqrtPriceX96: "79228162514264337593543950336",
    currentTick: -35,
    liquidity: "1000000",
    currency0: USDT,
    currency1: WTRX,
    fee: 500,
    tickSpacing: 12,
    hooks: TRX,
    parameters: PARAMETERS,
  };

  const keysAsked: unknown[] = [];
  const idsAsked: string[] = [];

  function v4Port(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
    return makePort({
      v4PoolIdOf: vi.fn((_n: NetworkDescriptor, key: unknown) => {
        keysAsked.push(key);
        return POOL_ID;
      }),
      v4PoolState: vi.fn(async (_n: NetworkDescriptor, id: string) => {
        idsAsked.push(id);
        return POOL;
      }),
      tickAtSqrtPrice: vi.fn((price: string) => (price === "263961795081773446554" ? -390416 : 0)),
      v4ParametersFor: vi.fn(() => PARAMETERS),
      v4Amounts: vi.fn(() => ({
        amount0: "1000000",
        amount1: "173468",
        liquidity: "97941773",
      })),
      permit2Address: vi.fn(() => PERMIT2),
      v4PositionManager: vi.fn(() => V4_MANAGER),
      v4MintedPositionId: vi.fn(async () => "31"),
      v4DepositPayload: vi.fn(() => ({
        target: V4_MANAGER,
        method: "modifyLiquidities(bytes,uint256)",
        parameters: [],
      })),
      allowance: vi.fn(async () => MAX_UINT256),
      ...overrides,
    } as Partial<LiquidityPort>);
  }

  const standingGrants = { planPermit: vi.fn(async () => undefined) };
  const signers = { resolve: vi.fn(() => ({})) };

  const BASE_V4 = {
    protocol: "V4" as const,
    token0: "USDT",
    token1: "WTRX",
    fee: 500,
    tickSpacing: 12,
    amount0: "1",
  };

  function run(input: Record<string, unknown>, port = v4Port()) {
    const h = makeHarness(port, standingGrants, signers);
    return { ...h, result: h.service.addLiquidity(h.scope, NETWORK, input as never) };
  }

  it("publishes unlimited approvals and explains an unsigned Permit2 fee", async () => {
    const port = v4Port({ allowance: vi.fn(async () => baseUnitAmount("0")) });
    const h = makeHarness(port, { planPermit: async () => ({}) }, signers);
    const out = await h.service.addLiquidity(h.scope, NETWORK, { ...BASE_V4, dryRun: true });
    expect(out.approvals).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: "unlimited" })]),
    );
    const coveredTrc20 = makeHarness(v4Port(), { planPermit: async () => ({}) }, signers);
    const noApprovals = await coveredTrc20.service.addLiquidity(coveredTrc20.scope, NETWORK, {
      ...BASE_V4,
      dryRun: true,
    });
    expect(noApprovals.approvals ?? []).toEqual([]);
    expect(noApprovals).toMatchObject({
      feeCovers: "none",
      fee: { note: expect.stringContaining("Permit2") },
    });
  });
  it("omits covered Permit2 grants and builds without signing", async () => {
    const preview = await run({ ...BASE_V4, dryRun: true }).result;
    expect(preview.permits ?? []).toEqual([]);
    expect(preview.feeCovers).toBe("all");
    await expect(run({ ...BASE_V4, buildOnly: true }).result).resolves.toBeDefined();
  });
  it.each([1, 4102444800.5])("refuses --deadline %s before building the mint", async (deadline) => {
    const port = v4Port();
    await expect(run({ ...BASE_V4, deadline }, port).result).rejects.toMatchObject({
      code: "invalid_value",
    });
    expect(port.v4DepositPayload).not.toHaveBeenCalled();
  });
  it.each([undefined, ROUTER])(
    "separates the depositor from mint recipient %s",
    async (recipient) => {
      const port = v4Port();
      const out = await run({ ...BASE_V4, recipient }, port).result;
      expect(out.recipient).toBe(recipient ?? OWNER);
      expect(port.v4DepositPayload).toHaveBeenCalledWith(
        NETWORK,
        expect.objectContaining({
          recipient: recipient ?? OWNER,
          permitOwner: OWNER,
          sweepRecipient: OWNER,
        }),
      );
    },
  );
  it("uses an existing finite allowance when it covers the deposit ceiling", async () => {
    const port = v4Port({ allowance: vi.fn(async () => baseUnitAmount("4000000")) });
    const out = await run({ ...BASE_V4, dryRun: true }, port).result;
    expect(out.approvals ?? []).toEqual([]);
  });

  it("refuses a TRC20 side the account cannot cover in a dry run", async () => {
    const port = v4Port({
      balanceOf: vi.fn(async (_n: NetworkDescriptor, token: string) =>
        baseUnitAmount(token === WTRX ? "173467" : "999999999999"),
      ),
    } as Partial<LiquidityPort>);
    await expect(run({ ...BASE_V4, dryRun: true }, port).result).rejects.toMatchObject({
      code: "insufficient_token_balance",
    });
  });
  it("refuses an uncovered TRC20 side before any approval or Permit2 signature", async () => {
    const port = v4Port({
      allowance: vi.fn(async () => baseUnitAmount("0")),
      balanceOf: vi.fn(async () => baseUnitAmount("1")),
    } as Partial<LiquidityPort>);
    const permits = { planPermit: vi.fn(async () => ({})) };
    const resolve = vi.fn(() => ({}));
    const h = makeHarness(port, permits, { resolve });
    await expect(h.service.addLiquidity(h.scope, NETWORK, BASE_V4)).rejects.toMatchObject({
      code: "insufficient_token_balance",
    });
    expect(h.pipeline.run).not.toHaveBeenCalled();
    expect(permits.planPermit).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
  it("checks a TRC20 side against the ceiling, not the deposit", async () => {
    const port = v4Port({
      balanceOf: vi.fn(async (_n: NetworkDescriptor, token: string) =>
        baseUnitAmount(token === USDT ? "1000000" : "999999999999"),
      ),
    } as Partial<LiquidityPort>);
    await expect(
      run({ ...BASE_V4, slippage: "0.01", dryRun: true }, port).result,
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
  });
  it("compares finite allowance to the ceiling, and grants unlimited only to the short side", async () => {
    const port = v4Port({
      allowance: vi.fn(async (_n, token) => baseUnitAmount(token === USDT ? "1000000" : "4000000")),
    });
    const out = await run({ ...BASE_V4, slippage: "0.01", dryRun: true }, port).result;
    expect(out.approvals).toEqual([
      expect.objectContaining({
        token: USDT,
        amount: "unlimited",
        isUnlimited: true,
        currentAllowance: "1000000",
      }),
    ]);
    expect(out.token0).not.toHaveProperty("acceptsAnyAmount");
    expect(out.token1).not.toHaveProperty("acceptsAnyAmount");
  });
  it("keeps confirmed approvals when Permit2 preparation later fails", async () => {
    const port = v4Port({
      allowance: vi
        .fn()
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce("0")
        .mockResolvedValue(MAX_UINT256),
    });
    const permits = {
      planPermit: vi.fn(async () => {
        throw new ChainError("signing_rejected", "rejected");
      }),
    };
    const h = makeHarness(port, permits, signers);
    await expect(h.service.addLiquidity(h.scope, NETWORK, BASE_V4)).rejects.toMatchObject({
      code: "signing_rejected",
      details: { approvalTxIds: [`tx:built:${APPROVE}`, `tx:built:${APPROVE}`] },
    });
  });

  it("carries initialization into the main transaction and centers defaults at its price", async () => {
    const port = v4Port({
      v4PoolState: vi.fn(async () => ({ ...POOL, exists: false, sqrtPriceX96: "0" })),
    });
    const out = await run(
      { ...BASE_V4, tickSpacing: 60, createPool: true, sqrtPrice: "263961795081773446554" },
      port,
    ).result;
    expect(port.tickAtSqrtPrice).toHaveBeenCalledWith("263961795081773446554");
    expect(port.v4Amounts).toHaveBeenCalledWith(
      expect.objectContaining({ currentTick: -390416, sqrtPriceX96: "263961795081773446554" }),
      { tickLower: -396420, tickUpper: -384420 },
      expect.anything(),
    );
    expect(port.v4DepositPayload).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({
        initialSqrtPriceX96: "263961795081773446554",
        tickLower: -396420,
        tickUpper: -384420,
      }),
    );
    expect(out).toMatchObject({ initialSqrtPriceX96: "263961795081773446554", poolCreated: true });
  });

  it("refuses a pool initialized during permit preparation", async () => {
    const port = v4Port({
      v4PoolState: vi
        .fn()
        .mockResolvedValueOnce({ ...POOL, exists: false, sqrtPriceX96: "0" })
        .mockResolvedValue(POOL),
    });
    const h = run(
      { ...BASE_V4, createPool: true, sqrtPrice: "79228162514264337593543950336" },
      port,
    );
    await expect(h.result).rejects.toMatchObject({ code: "pool_already_exists" });
    expect(port.v4DepositPayload).not.toHaveBeenCalled();
    expect(h.pipeline.run).not.toHaveBeenCalled();
  });

  it("preserves an explicit creation range and publishes its initial price in dry-run", async () => {
    const port = v4Port({
      v4PoolState: vi.fn(async () => ({ ...POOL, exists: false, sqrtPriceX96: "0" })),
    });
    const h = run(
      {
        ...BASE_V4,
        createPool: true,
        sqrtPrice: "263961795081773446554",
        tickSpacing: 60,
        tickLower: -396000,
        tickUpper: -384000,
        dryRun: true,
      },
      port,
    );
    await expect(h.result).resolves.toMatchObject({
      initialSqrtPriceX96: "263961795081773446554",
      tickLower: -396000,
      tickUpper: -384000,
    });
    expect(port.v4DepositPayload).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({ initialSqrtPriceX96: "263961795081773446554", permits: [] }),
    );
    expect(h.pipeline.run).toHaveBeenCalledWith(expect.objectContaining({ mode: "dry-run" }));
    expect(port.v4Amounts).toHaveBeenCalledWith(
      expect.anything(),
      { tickLower: -396000, tickUpper: -384000 },
      expect.anything(),
    );
  });

  it("rejects an invalid initial price before any approval or permit", async () => {
    const port = v4Port({
      tickAtSqrtPrice: vi.fn(() => {
        throw new Error("invalid --sqrt-price");
      }),
    });
    const h = run({ ...BASE_V4, createPool: true, sqrtPrice: "1" }, port);
    await expect(h.result).rejects.toThrow("--sqrt-price");
    expect(port.allowance).not.toHaveBeenCalled();
    expect(h.pipeline.run).not.toHaveBeenCalled();
  });

  it("does not initialize an existing pool", async () => {
    const port = v4Port();
    await run(BASE_V4, port).result;
    expect(port.tickAtSqrtPrice).not.toHaveBeenCalled();
    expect(vi.mocked(port.v4DepositPayload).mock.calls[0]![1]).not.toHaveProperty(
      "initialSqrtPriceX96",
    );
  });

  it("previews each grant expiring an hour out, not at the transaction deadline", async () => {
    const before = Math.floor(Date.now() / 1000);
    const h = makeHarness(v4Port(), { planPermit: async () => ({}) }, signers);
    const out = (await h.service.addLiquidity(h.scope, NETWORK, { ...BASE_V4, dryRun: true })) as {
      deadline: number;
      permits: { expiration: string }[];
    };
    expect(out.permits.length).toBeGreaterThan(0);
    for (const permit of out.permits) {
      const expiration = Number(permit.expiration);
      expect(expiration).toBeGreaterThanOrEqual(before + 3600);
      expect(expiration).toBeLessThanOrEqual(before + 3600 + 5);
      expect(expiration).not.toBe(out.deadline);
    }
  });

  it("publishes no amountMinimum on either side of a V4 deposit", async () => {
    const out = (await run({ ...BASE_V4, dryRun: true }).result) as {
      token0: Record<string, unknown>;
      token1: Record<string, unknown>;
    };
    expect(out.token0).not.toHaveProperty("amountMinimum");
    expect(out.token1).not.toHaveProperty("amountMinimum");
    expect(out.token0).toHaveProperty("amount");
  });

  it("publishes the new position's id once the mint confirms", async () => {
    const port = v4Port();
    await expect(run({ ...BASE_V4 }, port).result).resolves.toMatchObject({
      nftTokenId: "31",
      newPosition: true,
    });
    expect(port.v4MintedPositionId).toHaveBeenCalledTimes(1);
  });

  it("does not look for a minted id on a dry run", async () => {
    const port = v4Port();
    const out = await run({ ...BASE_V4, dryRun: true }, port).result;
    expect(out).not.toHaveProperty("nftTokenId");
    expect(port.v4MintedPositionId).not.toHaveBeenCalled();
  });

  it("warns and omits the id when the log cannot be read", async () => {
    const port = v4Port({ v4MintedPositionId: vi.fn(async () => undefined) as never });
    const h = run({ ...BASE_V4 }, port);
    const out = await h.result;
    expect(out).not.toHaveProperty("nftTokenId");
    expect(h.scope.warn).toHaveBeenCalled();
  });

  it("derives the pool id from the parts and reads that pool", async () => {
    keysAsked.length = 0;
    idsAsked.length = 0;
    await expect(run({ ...BASE_V4, dryRun: true }).result).resolves.toMatchObject({
      poolId: POOL_ID,
      tickSpacing: 12,
    });
    expect(keysAsked[0]).toMatchObject({
      token0: USDT,
      token1: WTRX,
      fee: 500,
      tickSpacing: 12,
      hooks: TRX,
    });
    expect(idsAsked).toEqual([POOL_ID]);
  });

  it("resolves symbols on the creating path too", async () => {
    keysAsked.length = 0;
    await run(
      {
        ...BASE_V4,
        createPool: true,
        sqrtPrice: "79228162514264337593543950336",
        amount1: "1",
        dryRun: true,
      },
      v4Port({
        v4PoolState: vi.fn(async () => ({ ...POOL, exists: false, sqrtPriceX96: "0" })),
      } as Partial<LiquidityPort>),
    ).result;
    expect(keysAsked[0]).toMatchObject({ token0: USDT, token1: WTRX });
  });

  it("refuses --create-pool on a key that already names a live pool", async () => {
    const { result } = run({
      ...BASE_V4,
      createPool: true,
      sqrtPrice: "79228162514264337593543950336",
      amount1: "1",
      dryRun: true,
    });
    await expect(result).rejects.toMatchObject({ code: "pool_already_exists" });
    await expect(result).rejects.toThrow(POOL_ID);
    await expect(result).rejects.toThrow(/without --create-pool/);
  });

  it("says a pool does not exist, and names the flag most likely to be wrong", async () => {
    const port = v4Port({
      v4PoolState: vi.fn(async () => ({ ...POOL, exists: false, sqrtPriceX96: "0" })),
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "pool_not_found" });
    await expect(result).rejects.toThrow(/--tick-spacing/);
    await expect(result).rejects.toThrow(/tick spacing 12/);
    await expect(result).rejects.toThrow(/hooks none/);
    await expect(result).rejects.toThrow(POOL_ID);
  });

  it.each([
    ["--tick-spacing", { tickSpacing: undefined }],
    ["--fee", { fee: undefined }],
  ])("requires %s", async (flag, missing) => {
    const { result } = run({ ...BASE_V4, ...missing, dryRun: true });
    await expect(result).rejects.toMatchObject({ code: "missing_option" });
    await expect(result).rejects.toThrow(flag);
  });
});

describe("Ledger report regressions — V3 ordering and approval progress", () => {
  it.each(
    [false, true].flatMap((reversed) =>
      ["confirmed", "dry-run", "build-only", "increase"].map((mode) => ({ reversed, mode })),
    ),
  )("publishes pool-order amounts for $mode (reversed=$reversed)", async ({ reversed, mode }) => {
    const port = makePort({
      allowance: vi.fn(async () => baseUnitAmount("999999999999")),
      v3PoolState: vi.fn(async () => ({
        poolAddress: MANAGER,
        liquidity: "1000000",
        exists: true,
        sqrtPriceX96: "55743275095956664623638036817",
        currentTick: -7032,
        fee: 500,
        token0: USDT,
      })),
      v3DepositedAmounts: vi.fn(async () => ({
        amount0: baseUnitAmount("1000000"),
        amount1: baseUnitAmount("493089"),
        liquidity: "123",
        tokenId: "1846",
      })),
    });
    const h = makeHarness(port);
    const result = await h.service.addLiquidity(h.scope, NETWORK, {
      protocol: "V3",
      ...(mode === "increase"
        ? { positionId: "1846" }
        : { token0: reversed ? WTRX : USDT, token1: reversed ? USDT : WTRX }),
      ...(mode === "dry-run" ? { dryRun: true } : mode === "build-only" ? { buildOnly: true } : {}),
      amount0: "1",
      fee: 500,
    });
    expect(result).toMatchObject({
      ...(mode === "confirmed" || mode === "increase" ? { amountsEstimated: false } : {}),
      token0: { address: USDT, amount: "1000000" },
      token1: { address: WTRX, amount: "493089" },
    });
  });
  it("translates a pool-order missing-side error into the caller's flag", async () => {
    const port = makePort({
      v3PoolState: vi.fn(async () => ({
        poolAddress: MANAGER,
        liquidity: "1000000",
        exists: true,
        sqrtPriceX96: "55743275095956664623638036817",
        currentTick: -7032,
        fee: 500,
        token0: USDT,
      })),
      v3Amounts: vi.fn(() => {
        throw new UsageError(
          "invalid_value",
          "the price is below this range, so the position takes only token0; give --amount0",
          { requiredAmount: "amount0" },
        );
      }),
    });
    const h = makeHarness(port);
    await expect(
      h.service.addLiquidity(h.scope, NETWORK, {
        protocol: "V3",
        token0: WTRX,
        token1: USDT,
        amount0: "1",
        fee: 500,
      }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("give --amount1"),
    });
  });
  it("retains an approval ID when the allowance re-read fails", async () => {
    const h = makeHarness();
    await expect(h.service.addLiquidityV2(h.scope, NETWORK, BASE)).rejects.toMatchObject({
      code: "execution_reverted",
      details: { approvalTxIds: [`tx:built:${APPROVE}`] },
    });
  });
  it.each([undefined, 120_000])(
    "uses the offline batch lifetime, respecting an explicit %s",
    async (expiration) => {
      const h = makeHarness();
      await h.service.addLiquidityV2(h.scope, NETWORK, {
        ...BASE,
        buildOnly: true,
        ...(expiration === undefined ? {} : { expiration }),
      });
      for (const [p] of vi.mocked(h.pipeline.run).mock.calls)
        expect(p.expiration).toBe(expiration ?? 3_600_000);
    },
  );
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

describe("add-liquidity — symbols from the account's token book", () => {
  it("resolves a user-added symbol and publishes that it came from the book", async () => {
    const { service, scope } = makeHarness(makePort(), noV4Permits, noV4Signers, bookResolver());
    Object.assign(scope, { activeAccount: "wlt_main.0" });
    const result = (await service.addLiquidity(scope, NETWORK, {
      ...BASE,
      token0: "MYUSD",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.token0).toMatchObject({ address: USDT });
    expect(result.fromTokenBook).toEqual([USDT]);
  });

  it("refuses the symbol for another account, with the liquidity hint", async () => {
    const { service, scope } = makeHarness(makePort(), noV4Permits, noV4Signers, bookResolver());
    Object.assign(scope, { activeAccount: "wlt_other.0" });
    await expect(
      service.addLiquidity(scope, NETWORK, { ...BASE, token0: "MYUSD", dryRun: true }),
    ).rejects.toMatchObject({
      code: "unsupported_token",
      message: expect.stringContaining(
        "with --token0/--token1, or add it with 'wallet-cli token add'",
      ),
    });
  });
});
