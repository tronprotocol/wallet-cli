import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { SunSwapLiquidityService } from "./liquidity-service.js";

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

  it("reports what the pool actually took, not what was requested", async () => {
    let pairReads = 0;
    const port = makePort({
      allowance: vi.fn(async () => "999999999999") as never,
      v2PairState: vi.fn(async () => {
        pairReads += 1;
        // After the deposit the reserves have grown — by less than the request, as a V2 pool
        // takes the two sides at its own ratio.
        return pairReads === 1
          ? PAIR
          : { ...PAIR, reserve0: "8971374880412", reserve1: "6154766561060" };
      }) as never,
      balanceOf: vi.fn(async (_n: NetworkDescriptor, token: string) =>
        token === PAIR.pairAddress ? (pairReads > 1 ? "780258" : "0") : "999999999999",
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
      token0: "8971374880412",
      token1: "6154766561060",
    });
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

    expect(result.txId).toBe(`tx:built:${ADD_LIQUIDITY}`);
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_liquidity_postread_unavailable" }),
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

  /**
   * Defensive restatements of what the command schema refuses at parse time. The use case is also
   * reachable directly, and each of these accepted-and-ignored would misstate what was sent — a
   * recipient the NFT never goes to, or a range a position cannot be given.
   */
  it.each([
    ["--recipient", { recipient: ROUTER }],
    ["--tick-lower", { tickLower: -120 }],
    ["--tick-upper", { tickUpper: 120 }],
    ["--pool", { pool: POOL_ID }],
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
