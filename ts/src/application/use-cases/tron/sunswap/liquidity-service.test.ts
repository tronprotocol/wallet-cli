import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { SunSwapLiquidityService } from "./liquidity-service.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";

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
  sunswap: { contracts: { v2Router: ROUTER, wtrx: WTRX, v3PositionManager: MANAGER } },
} as unknown as NetworkDescriptor;

/** The address the market API and this CLI use for native TRX. Not a TRC-20 contract. */
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

/** Symbols resolve through the shared resolver; here it is scripted rather than backed by a
 *  token repository, because what the service owes is using it at all. */
const resolver = {
  resolve: (_n: NetworkDescriptor, value: string) =>
    ({ USDT, WTRX, TRX })[value.toUpperCase()] ?? value,
  resolveSymbol: (_n: NetworkDescriptor, value: string) => value,
  label: () => "nile",
} as unknown as SunSwapTokenResolver;

const FACTS: Record<string, { address: string; decimals: number; symbol: string }> = {
  [USDT]: { address: USDT, decimals: 6, symbol: "USDT" },
  [WTRX]: { address: WTRX, decimals: 6, symbol: "WTRX" },
};

/** A funded pair, reserves already in the caller's token order (the adapter does that swap). */
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
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v2PairState: vi.fn(async () => PAIR),
    v2LiquidityResult: vi.fn(async () => undefined),
    balanceOf: vi.fn(async () => "999999999999"),
    nativeBalance: vi.fn(async () => "999999999999"),
    allowance: vi.fn(async () => "0"),
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
  /** the V4 collaborators, which most cases never reach — see `noV4Permits`. */
  permits: unknown = noV4Permits,
  signers: unknown = noV4Signers,
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
    resolver,
    permits as never,
    signers as never,
  );
  return { service, scope, gateway, pipeline, port, estimated, assertCanSign, callValues };
}

const BASE = { protocol: "V2", token0: USDT, token1: WTRX, amount0: "1" };

describe("SunSwapLiquidityService.addLiquidityV2 — planning", () => {
  it("derives the other side from the pool's reserves and floors both at 95%", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0).toMatchObject({ amount: "1000000", amountMinimum: "950000" });
    // 1 USDT against the live-shaped reserves, truncated toward leaving dust unspent.
    expect(result.token1).toMatchObject({ amount: "686044", amountMinimum: "651741" });
  });

  it("reports the LP tokens the deposit should mint", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    // The two sides disagree — 780259 from token0, 780258 from token1 — and the pair credits the
    // smaller. Verified against the arithmetic by hand, not against this function.
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
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
    const { service, scope } = makeHarness(port);

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...BASE,
      dryRun: true,
    })) as Record<string, unknown>;

    // Absent, not empty: an empty list reads as "an approval is coming" (PM 13.3).
    expect(result).not.toHaveProperty("approvals");
  });
});

describe("SunSwapLiquidityService.addLiquidityV2 — --dry-run", () => {
  it("resolves no signer, so a watch-only account can preview a deposit", async () => {
    const { service, scope, assertCanSign } = makeHarness();

    await service.addLiquidityV2(scope, NETWORK, { ...BASE, dryRun: true });

    expect(assertCanSign).not.toHaveBeenCalled();
  });

  it("prices the deposit for real once the allowances are in place", async () => {
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
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
    // Two approvals at 1000 energy each. The deposit is absent from the total, and absent from
    // the estimate log entirely: estimating it would return the energy burned reaching a revert.
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
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
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
  it("re-reads the allowance after each approval and refuses to deposit if it fell short", async () => {
    // The approval's receipt says it succeeded; the allowance it left behind says otherwise.
    const port = makePort({ allowance: vi.fn(async () => "0") as never });
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
    // Every approval lands: the re-read after it sees the full amount.
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

  // A symbol and its own address are the same token, and only the resolved form shows that.
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
  const NATIVE = { protocol: "V2", token0: "TRX", token1: USDT, amount1: "1" };

  it("deposits through addLiquidityETH, carrying the TRX as the call's value", async () => {
    const { service, scope, gateway, callValues } = makeHarness();

    const result = (await service.addLiquidityV2(scope, NETWORK, {
      ...NATIVE,
      buildOnly: true,
    })) as { token0: { amount: string } };

    const methods = gateway.triggerSmartContract.mock.calls.map((call) => call[2]);
    expect(methods).toContain(ADD_LIQUIDITY_ETH);
    expect(methods).not.toContain(ADD_LIQUIDITY);
    // The TRX amount reaches the builder as the call's VALUE and untouched: it is the one number
    // here that nothing may round, default or infer. Derived from the pool's ratio, so it is
    // compared against the plan rather than to a constant.
    const deposit = methods.indexOf(ADD_LIQUIDITY_ETH);
    expect(BigInt(result.token0.amount)).toBeGreaterThan(0n);
    expect(callValues[deposit]).toBe(result.token0.amount);
    // The approval before it carries no value at all.
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

    // The router wraps TRX, so the pair that exists is the WTRX one.
    expect(port.v2PairState).toHaveBeenCalledWith(NETWORK, WTRX, USDT);
    // ...but the receipt names what the caller deposited.
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
  /** A harness whose every transaction confirms. */
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
        amount0: "900000",
        amount1: "686044",
        lpAmount: "780258",
      })),
      allowance: vi.fn(async () => "999999999999") as never,
      v2PairState: vi.fn(async () => {
        pairReads += 1;
        // A concurrent swap also changes reserves; those deltas cannot price our deposit.
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

    // decimals travels with the amount. Without it a receipt prints base units beside a symbol —
    // "Deposited 1,000,000 USDT" for a 1 USDT deposit — which a live run caught and no assertion
    // on the amount alone would have.
    expect(result.token0).toMatchObject({ amount: "900000", symbol: "USDT", decimals: 6 });
    expect(result.token1).toMatchObject({ amount: "686044", symbol: "WTRX", decimals: 6 });
    expect(result.lpAmount).toBe("780258");
    expect(result.reservesAfter).toEqual({
      token0: "8971374980412",
      token1: "6154766461060",
    });
  });

  it("keeps estimates explicit when the router result is missing", async () => {
    const port = makePort({ allowance: vi.fn(async () => "999999999999") });
    const { service, scope } = confirming(port);
    const result = await service.addLiquidityV2(scope, NETWORK, BASE);
    expect(result.stage).toBe("confirmed");
    expect(result.amountsEstimated).toBe(true);
    expect(result).not.toHaveProperty("lpAmount");
    expect(scope.warn).toHaveBeenCalled();
  });

  it("leaves a submitted receipt alone — there is nothing on chain to read back", async () => {
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
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
    // The requested amount stands, under the name that means requested.
    expect(result.token0).toMatchObject({ amount: "1000000" });
  });

  it("warns rather than fails when the follow-up read is unavailable", async () => {
    let pairReads = 0;
    const port = makePort({
      v2LiquidityResult: vi.fn(async () => ({
        amount0: "900000",
        amount1: "686044",
        lpAmount: "780258",
      })),
      allowance: vi.fn(async () => "999999999999") as never,
      v2PairState: vi.fn(async () => {
        pairReads += 1;
        if (pairReads > 1) throw new Error("node unavailable");
        return PAIR;
      }) as never,
    });
    const { service, scope } = confirming(port);

    // The deposit is on chain; a follow-up read that fails must not turn it into an error.
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
  const MINT = { protocol: "V3", token0: USDT, token1: WTRX, fee: 500, amount0: "1" };

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
    // tick -7032 aligned to the 3000 tier's spacing of 60, then 100 spacings either side.
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

  // Silently rounding a boundary would move someone's position without telling them.
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
  });

  it("approves the position manager, not the V2 router", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.addLiquidity(scope, NETWORK, {
      ...MINT,
      dryRun: true,
    })) as { approvals: { spender: string }[] };

    expect(result.approvals.every((approval) => approval.spender === MANAGER)).toBe(true);
  });

  // A pool with no liquidity at all mints nothing; `mint` reverts on it, and the estimate's bare
  // "REVERT opcode executed" says nothing a caller could act on.
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
  const INCREASE = { protocol: "V3", positionId: "1846", amount0: "1" };

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
    // Nothing was defaulted: the position supplied all of it.
    expect(result).not.toHaveProperty("feeAuto");
    expect(result).not.toHaveProperty("tickRangeAuto");
  });

  // increaseLiquidity does not check the caller, so a mistyped id would fund a stranger's
  // position and the transaction would succeed.
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

  // An id that was never minted reverts the position read; that is the caller's id, not a fault.
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

  // A dry run can be minutes old by the time someone runs the real thing.
  it("re-reads the owner immediately before sending, not only in the dry run", async () => {
    const { service, scope, port } = makeHarness();
    (port.allowance as unknown as { mockResolvedValue: (v: string) => void }).mockResolvedValue(
      "999999999999",
    );

    await service.addLiquidity(scope, NETWORK, INCREASE);

    // Once while planning, once on the way to the node, once after it confirmed to read back
    // what the position actually gained.
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
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
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

  // The position exists on chain either way, so an unreadable log costs the id, not the deposit.
  it("warns rather than fails when the log cannot be read", async () => {
    const port = makePort({
      allowance: vi.fn(async () => "999999999999") as never,
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
    const port = makePort({ allowance: vi.fn(async () => "999999999999") as never });
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
      allowance: vi.fn(async () => "999999999999"),
      v3DepositedAmounts: vi.fn(async () => ({
        tokenId: "686",
        liquidity: "12345",
        amount0: "999000",
        amount1: "173000",
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

  // A V3 pool takes the amounts at its own price, so it credits a little less than the plan
  // predicted. A live Nile run found the receipt reporting the planned figure: two deposits of
  // 14,398,816 each read back as 28,793,272 on chain, not 28,797,632 — and that figure is what a
  // later remove-liquidity --liquidity has to be given.
  it("reads the position back rather than echoing what was planned", async () => {
    let reads = 0;
    const port = makePort({
      allowance: vi.fn(async () => "999999999999") as never,
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
          // before the deposit, then after it
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
      allowance: vi.fn(async () => "999999999999") as never,
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

/**
 * The V4 增倉 scenario: adding to a position that already exists (PM 6.1.3, V4 追加).
 *
 * The asymmetry with V3's increase is the thing under test. On V3 `--token0` / `--token1` are
 * REFUSED beside `--position-id`, because the position fixes the pair. On V4 PM REQUIRES them — and
 * they still select nothing, so what they are is a cross-check against the pair the position
 * reports. These cases pin both halves: the check refuses a mismatch, and the position's own pool
 * and range are what the call is built from either way.
 */
describe("SunSwapLiquidityService.addLiquidity — V4 increase", () => {
  const V4_MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
  const PERMIT2 = "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax";
  const MODIFY = "modifyLiquidities(bytes,uint256)";
  const POOL_ID = "2f8c".padEnd(64, "a");
  /** The pool's own `parameters` word — spacing 12, as a real Nile pool reports it. */
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
    // NOT the default band around the current tick: a position's range is its own, and a plan that
    // reported the default would be reporting a range this deposit does not land in.
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
      // The standing TRC20 allowance already covers it, so no approval transaction is planned and
      // these cases are about the deposit rather than about the approval sequence.
      allowance: vi.fn(async () => MAX_UINT256),
      ...overrides,
    } as Partial<LiquidityPort>);
  }

  /** Every grant already stands, so nothing needs signing and the call builds. */
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
    // Both the given pair and the held pair, so a caller can see which one they got wrong.
    await expect(result).rejects.toThrow(WTRX);
  });

  // The pool key's currency order is not the caller's, so the two sides the other way round name
  // the same pool and must be accepted.
  it("accepts the pair written the other way round", async () => {
    const { result } = run({ ...BASE_V4, token0: "WTRX", token1: "USDT", dryRun: true });
    await expect(result).resolves.toMatchObject({ nftTokenId: "12" });
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

  // An id that was never minted reverts the position read; that is the caller's id, not a fault.
  it("reports an id that was never minted as position_not_found", async () => {
    const port = v4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }) as never,
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "position_not_found" });
  });

  /**
   * Defensive restatements of what the command schema refuses at parse time. The use case is also
   * reachable directly, and each of these accepted-and-ignored would misstate what was sent — a
   * recipient the NFT never goes to, or a range a position cannot be given.
   */
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
      // The word for it, never the zero address — which on TRON is also native TRX's.
      hooks: "none",
      liquidity: SIZED.liquidity,
    });
  });

  // The range came from the position, so nothing here chose it and saying "(default)" would be a
  // lie about where it came from.
  it("does not mark the range as chosen by the CLI", async () => {
    await expect(run({ ...BASE_V4, dryRun: true }).result).resolves.not.toHaveProperty(
      "tickRangeAuto",
    );
  });

  /**
   * EVERY VALUE THIS PLAN SETS REACHES THE CALL.
   *
   * The request is asserted whole rather than field by field, so a value silently dropped on the way
   * to the port fails here — which is the one failure mode a mock port cannot otherwise catch.
   */
  it("builds the increase from the position's own pool key, verbatim", async () => {
    const port = v4Port();
    const { result } = run({ ...BASE_V4, deadline: 1790240000 }, port);
    await result;
    expect(port.v4IncreasePayload).toHaveBeenCalledWith(NETWORK, {
      pool: {
        currency0: USDT,
        currency1: WTRX,
        hooks: TRX,
        fee: 500,
        // VERBATIM from the pool, never re-encoded from the tick spacing.
        parameters: PARAMETERS,
      },
      tokenId: "12",
      liquidity: SIZED.liquidity,
      // The CEILING, and with no --slippage it is EXACTLY the computed amounts — PM 6.1.3's default,
      // measured to work on Nile.
      amount0Max: SIZED.amount0,
      amount1Max: SIZED.amount1,
      owner: OWNER,
      // Set on both pairs, though it only bites on a native one.
      sweepRecipient: OWNER,
      deadline: 1790240000,
      permits: [],
    });
  });

  /** A tolerance raises the ceiling UPWARD. A deposit is bounded from above; lowering it would
   *  revert every deposit it was meant to protect. */
  it("widens the ceiling upward when --slippage is given", async () => {
    const port = v4Port();
    await run({ ...BASE_V4, slippage: "0.01", deadline: 1790240000 }, port).result;
    const request = (port.v4IncreasePayload as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as { amount0Max: string; amount1Max: string };
    expect(BigInt(request.amount0Max)).toBeGreaterThan(BigInt(SIZED.amount0));
    expect(BigInt(request.amount1Max)).toBeGreaterThan(BigInt(SIZED.amount1));
  });

  // And the plan says so only then: a ceiling row equal to the deposit above it teaches a reader to
  // skip the section.
  it("publishes the ceiling only when a tolerance moved it", async () => {
    await expect(run({ ...BASE_V4, dryRun: true }).result).resolves.not.toHaveProperty(
      "amount0Max",
    );
    await expect(
      run({ ...BASE_V4, slippage: "0.01", dryRun: true }).result,
    ).resolves.toHaveProperty("amount0Max");
  });

  /**
   * ON A NATIVE PAIR THE ACCOUNT MUST HOLD THE CEILING, not the deposit.
   *
   * The ceiling is sent as the call's value and the remainder is swept back, so an account holding
   * exactly the deposit cannot send it. Measured on the mint, and an increase is a deposit.
   */
  it("checks the native balance against the ceiling", async () => {
    const port = v4Port({
      v4Position: vi.fn(async () => ({ ...POSITION, currency0: TRX })),
      v4PoolState: vi.fn(async () => ({ ...POOL, currency0: TRX })),
      // 1% above the 1000000 deposit is 1010000; the account holds only the deposit.
      nativeBalance: vi.fn(async () => SIZED.amount0),
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, token0: "TRX", slippage: "0.01", dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  // The holder is read AGAIN immediately before sending: a dry run can be minutes old, and a
  // position that changed hands in between must not be added to on this account's behalf.
  it("re-reads the holder before sending", async () => {
    const port = v4Port();
    await run(BASE_V4, port).result;
    expect(port.v4Position).toHaveBeenCalledTimes(3);
  });
});

/**
 * The V4 collaborators, which these cases do not exercise.
 *
 * They THROW rather than returning a plausible nothing: a double that quietly answers is how a test
 * passes while the path it names is broken, which is the mistake the TRX token-facts fixture taught.
 * Anything here reaching them is a test that has escaped its own subject.
 */
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

/**
 * The V4 MINT scenario: a deposit into a pool named by its parts.
 *
 * `--pool`, a 32-byte id, used to be the only way to name a V4 pool here — a value PM never
 * specified and this CLI published nowhere. The pool is named by what it is made of now:
 * `--token0`, `--token1`, `--fee` and `--tick-spacing`, plus `--hooks` when there is one. The id is
 * derived from those, by the same hash the pool manager uses.
 */
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
    protocol: "V4",
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
    const port = v4Port({ allowance: vi.fn(async () => "0") });
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
  it("uses an existing finite allowance when it covers the deposit ceiling", async () => {
    const port = v4Port({ allowance: vi.fn(async () => "4000000") });
    const out = await run({ ...BASE_V4, dryRun: true }, port).result;
    expect(out.approvals ?? []).toEqual([]);
  });
  it("compares finite allowance to the ceiling, and grants unlimited only to the short side", async () => {
    const port = v4Port({
      allowance: vi.fn(async (_n, token) => (token === USDT ? "1000000" : "4000000")),
    });
    const out = await run({ ...BASE_V4, slippage: "0.01", dryRun: true }, port).result;
    expect(out.approvals).toEqual([
      expect.objectContaining({ token: USDT, amount: "unlimited", currentAllowance: "1000000" }),
    ]);
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

  /**
   * The grant's expiry in the preview is the grant's, not the transaction's.
   *
   * The signed grant lasts `V4_PERMIT_TTL_SECONDS` (an hour); the transaction deadline is thirty
   * minutes. An earlier version printed the deadline as the grant's `expiration`, so the preview said
   * the authorisation lapsed half an hour before it actually did.
   */
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

  /**
   * A V4 deposit publishes NO minimum, because it has none.
   *
   * It is bounded from above. The shared plan type keeps a minimum for V2 and V3, which need one
   * when they send, and V4's placeholder `"0"` used to leak into the JSON — telling an agent the
   * deposit accepted any amount, when a ceiling caps it.
   */
  it("publishes no amountMinimum on either side of a V4 deposit", async () => {
    const out = (await run({ ...BASE_V4, dryRun: true }).result) as {
      token0: Record<string, unknown>;
      token1: Record<string, unknown>;
    };
    expect(out.token0).not.toHaveProperty("amountMinimum");
    expect(out.token1).not.toHaveProperty("amountMinimum");
    // The amount itself is still there; only the meaningless floor is gone.
    expect(out.token0).toHaveProperty("amount");
  });

  /**
   * A confirmed V4 mint reports the position it created.
   *
   * It is the one figure a caller needs afterwards — every later command names the position by it —
   * and on Nile `position-list` cannot recover it. An earlier version returned `{}` from the mint
   * branch, so a real Nile mint (position 178) confirmed with no id anywhere but a raw log.
   */
  it("publishes the new position's id once the mint confirms", async () => {
    const port = v4Port();
    await expect(run({ ...BASE_V4 }, port).result).resolves.toMatchObject({
      nftTokenId: "31",
      newPosition: true,
    });
    expect(port.v4MintedPositionId).toHaveBeenCalledTimes(1);
  });

  // Nothing has been minted on a dry run, so there is nothing to look for.
  it("does not look for a minted id on a dry run", async () => {
    const port = v4Port();
    const out = await run({ ...BASE_V4, dryRun: true }, port).result;
    expect(out).not.toHaveProperty("nftTokenId");
    expect(port.v4MintedPositionId).not.toHaveBeenCalled();
  });

  /**
   * An id we could not read is ABSENT and WARNED, never guessed.
   *
   * The deposit is already on chain by then, so failing the command would misreport a success; but
   * inventing an id would send the caller to act on a position that is not theirs.
   */
  it("warns and omits the id when the log cannot be read", async () => {
    const port = v4Port({ v4MintedPositionId: vi.fn(async () => undefined) as never });
    const h = run({ ...BASE_V4 }, port);
    const out = await h.result;
    expect(out).not.toHaveProperty("nftTokenId");
    expect(h.scope.warn).toHaveBeenCalled();
  });

  /** The four flags become a key, the key becomes an id, and the id is what the pool is read by. */
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
      // Defaulted, and to the zero address rather than to nothing: it is part of the key either way.
      hooks: TRX,
    });
    expect(idsAsked).toEqual([POOL_ID]);
  });

  /**
   * SYMBOLS RESOLVE ON EVERY PATH.
   *
   * `--token0 TRX --create-pool` used to fail with `invalid --pool: Invalid checksum` — the pair
   * ordering ran on the symbol, in the schema, before anything had resolved it. The key the port is
   * asked for must hold ADDRESSES whichever path built it.
   */
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

  /**
   * CREATING A POOL THAT EXISTS IS REFUSED.
   *
   * The creating path sizes the deposit at the caller's `--sqrt-price`, not the pool's, so on a pool
   * that is already live it planned amounts for a price the pool does not have and published
   * `poolCreated: true` for a pool nobody created. Measured on Nile: TRX/USDT at fee 500, spacing 10.
   */
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

  /**
   * A key that hashes to no pool says so — and points at the spacing.
   *
   * The equivalent used to be `provider_error: a V4 pool's parameters decoded to a tick spacing of
   * 0`, an internal detail of decoding an empty answer. A wrong `--tick-spacing` is the likeliest
   * cause of an id nothing has initialised, because it is the one part of the key that cannot be
   * guessed from the pair and the tier.
   */
  it("says a pool does not exist, and names the flag most likely to be wrong", async () => {
    const port = v4Port({
      v4PoolState: vi.fn(async () => ({ ...POOL, exists: false, sqrtPriceX96: "0" })),
    } as Partial<LiquidityPort>);
    const { result } = run({ ...BASE_V4, dryRun: true }, port);
    await expect(result).rejects.toMatchObject({ code: "pool_not_found" });
    await expect(result).rejects.toThrow(/--tick-spacing/);
    await expect(result).rejects.toThrow(/tick spacing 12/);
    // The hook is named as the word, never as the zero address that also means TRX.
    await expect(result).rejects.toThrow(/hooks none/);
    await expect(result).rejects.toThrow(POOL_ID);
  });

  // The spacing has no default, on either path: a V4 pool at one fee tier may have any of several.
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
      allowance: vi.fn(async () => "999999999999"),
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
        amount0: "1000000",
        amount1: "493089",
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
