import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { SunSwapCollectFeesService } from "./collect-fees-service.js";
import { ChainError } from "../../../../domain/errors/index.js";

/** Symbols the V4 cross-check resolves; anything already an address passes through. */
const SYMBOLS: Record<string, string> = {
  USDT: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  TRX: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
};
const RESOLVER = {
  // The entry's one-time resolution is a pass-through here; `resolve` below does the mapping.
  resolvePair: (_n: NetworkDescriptor, input: object) => ({ input, resolved: [] }),
  resolve: (_n: NetworkDescriptor, value: string) => SYMBOLS[value.toUpperCase()] ?? value,
} as unknown as SunSwapTokenResolver;

const MANAGER = "TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R";
const USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const WTRX = "TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a";
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
const ELSEWHERE = "TM56HhEWoaw2UevQh86k9AUjJqj9QVvmFC";
const COLLECT = "collect((uint256,address,uint128,uint128))";

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

function makePort(overrides: Partial<LiquidityPort> = {}): LiquidityPort {
  return {
    contracts: vi.fn(() => ({ v3PositionManager: MANAGER })),
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v3Position: vi.fn(async () => POSITION),
    v3OwedFees: vi.fn(async () => ({ amount0: "1200", amount1: "800" })),
    v3CollectFeesPayload: vi.fn(() => ({ target: MANAGER, method: COLLECT, parameters: [] })),
    v3CollectedAmounts: vi.fn(async () => ({ amount0: "1250", amount1: "830" })),
    ...overrides,
  } as unknown as LiquidityPort;
}

interface PipelineParams {
  mode?: string;
  build: (from: string) => Promise<unknown>;
  estimate: (tx: unknown) => Promise<Record<string, unknown>>;
}

function makeHarness(port: LiquidityPort = makePort(), confirmed = true) {
  const gateway = {
    triggerSmartContract: vi.fn(async (_f, _t, method) => ({ txID: `built:${method}` })),
    estimateResources: vi.fn(async () => ({ feeModel: "tron-resource" as const, energy: 1000 })),
  };
  const assertCanSign = vi.fn();
  const pipeline = {
    assertCanSign,
    run: vi.fn(async (p: PipelineParams) => {
      const tx = (await p.build(OWNER)) as { txID: string };
      const fee = await p.estimate(tx);
      if (p.mode === "dry-run") return { stage: "plan", tx, fee };
      if (p.mode === "build-only") return { stage: "built", tx, hex: "0abc", fee };
      return confirmed
        ? { stage: "confirmed", txId: `tx:${tx.txID}`, blockNumber: 1, fee }
        : { stage: "submitted", txId: `tx:${tx.txID}`, fee };
    }),
  } as unknown as TxPipeline;
  const scope = {
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress: () => OWNER,
    warn: vi.fn(),
  } as unknown as TransactionScope;
  const service = new SunSwapCollectFeesService(
    port,
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
    RESOLVER,
  );
  return { service, scope, gateway, port, assertCanSign };
}

const V3 = { protocol: "V3", positionId: "686" };

describe("collect-fees", () => {
  // Not "unknown protocol": V2's fees are real, they are simply not separable. Telling a caller
  // they mistyped would send them looking for a spelling error instead of explaining the pool.
  it("refuses V2 by explaining that its fees are not separable", async () => {
    const { service, scope } = makeHarness();

    await expect(
      service.collectFees(scope, NETWORK, { protocol: "V2", positionId: "686", dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("accrue into the LP token"),
    });
  });

  it("sends one collect call and approves nothing", async () => {
    const { service, scope, gateway } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, V3)) as Record<string, unknown>;

    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([COLLECT]);
    expect(result).not.toHaveProperty("approvalTxIds");
    expect(result).not.toHaveProperty("approvals");
  });

  it("shows what the contract says is owed, so the dry run promises what the receipt reports", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, {
      ...V3,
      dryRun: true,
    })) as Record<string, Record<string, string>>;

    expect(result.token0).toMatchObject({ symbol: "USDT", decimals: 6, amount: "1200" });
    expect(result.token1).toMatchObject({ symbol: "WTRX", decimals: 6, amount: "800" });
  });

  it("resolves no signer on a dry run, so a watch-only account can preview a collection", async () => {
    const { service, scope, assertCanSign } = makeHarness();

    await service.collectFees(scope, NETWORK, { ...V3, dryRun: true });

    expect(assertCanSign).not.toHaveBeenCalled();
  });

  // This command routinely sends money somewhere other than the account that signed, so where it
  // went is the fact a script has to read — never a placeholder.
  it("echoes the resolved recipient, and asks the contract about that address", async () => {
    const { service, scope, port } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, {
      ...V3,
      recipient: ELSEWHERE,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.recipient).toBe(ELSEWHERE);
    expect(port.v3OwedFees).toHaveBeenCalledWith(NETWORK, "686", ELSEWHERE);
  });

  it("defaults the recipient to the account, resolved rather than left absent", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, {
      ...V3,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.recipient).toBe(OWNER);
  });

  it("marks the pair as read from the position, never named by the caller", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, {
      ...V3,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.tokensAuto).toBe(true);
  });

  it("refuses a position the account does not hold, naming the owner", async () => {
    const port = makePort({
      v3Position: vi.fn(async () => ({ ...POSITION, owner: ELSEWHERE })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V3, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value", message: expect.stringContaining(ELSEWHERE) });
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
      service.collectFees(scope, NETWORK, { ...V3, dryRun: true }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  it("re-reads the owner immediately before sending", async () => {
    const { service, scope, port } = makeHarness();

    await service.collectFees(scope, NETWORK, V3);

    expect((port.v3Position as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      2,
    );
  });
});

describe("collect-fees — what actually arrived", () => {
  // The owed figure was read a moment before sending; a trade in between changes it. The event
  // is what the contract recorded paying out.
  it("reports the Collect event's amounts, not the ones quoted beforehand", async () => {
    const { service, scope } = makeHarness();

    const result = (await service.collectFees(scope, NETWORK, V3)) as Record<
      string,
      Record<string, string>
    >;

    expect(result.token0).toMatchObject({ amount: "1250", decimals: 6 });
    expect(result.token1).toMatchObject({ amount: "830", decimals: 6 });
  });

  it("warns rather than fails when the event cannot be read", async () => {
    const port = makePort({ v3CollectedAmounts: vi.fn(async () => undefined) as never });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V3)) as Record<string, unknown>;

    expect(result.txId).toBe(`tx:built:${COLLECT}`);
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_collected_postread_mismatch" }),
    );
  });

  it("leaves a submitted receipt alone — there is nothing on chain to read back", async () => {
    const { service, scope } = makeHarness(makePort(), false);

    const result = (await service.collectFees(scope, NETWORK, V3)) as Record<
      string,
      Record<string, string>
    >;

    // Still the owed figure, under a name that does not claim to be more.
    expect(result.token0).toMatchObject({ amount: "1200" });
  });
});

describe("collect-fees — a collection of nothing", () => {
  const nothing = () =>
    makePort({ v3OwedFees: vi.fn(async () => ({ amount0: "0", amount1: "0" })) as never });

  /**
   * Measured on Nile (da9df393…): the contract accepts a collect of zero, emits a Collect of
   * zero, charges 8.08 TRX, and the receipt reads "✅ Fees collected". A transaction that looks
   * like success and leaves the caller poorer is exactly what this CLI exists to catch.
   */
  it("is refused before the node rather than sent", async () => {
    const { service, scope, gateway } = makeHarness(nothing());

    await expect(service.collectFees(scope, NETWORK, V3)).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("spend a fee to receive nothing"),
    });
    expect(gateway.triggerSmartContract).not.toHaveBeenCalled();
  });

  // Every mode answers alike: a dry run that succeeds where the execute refuses would preview a
  // transaction that can never be sent. The message carries the zero the caller came to check.
  it.each([
    ["a dry run", { dryRun: true }],
    ["a build", { buildOnly: true }],
  ])("is refused on %s too, before anything is estimated", async (_name, mode) => {
    const { service, scope, gateway } = makeHarness(nothing());

    await expect(service.collectFees(scope, NETWORK, { ...V3, ...mode })).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("position 686 has no fees to collect"),
    });
    expect(gateway.triggerSmartContract).not.toHaveBeenCalled();
    expect(gateway.estimateResources).not.toHaveBeenCalled();
  });
});

describe("collect-fees — a collection of nearly nothing", () => {
  /**
   * Only BOTH sides being zero is nothing. A position owed dust on one token and nothing on the
   * other is a real collection, and refusing it would be us deciding a small payout is not worth
   * having — which is the caller's call, not ours.
   */
  it.each([
    ["token0 only", "1", "0"],
    ["token1 only", "0", "1"],
  ])("sends a collection owed on %s", async (_name, amount0, amount1) => {
    const port = makePort({
      v3OwedFees: vi.fn(async () => ({ amount0, amount1 })) as never,
      v3CollectedAmounts: vi.fn(async () => ({ amount0, amount1 })) as never,
    });
    const { service, scope, gateway } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V3)) as Record<string, unknown>;

    expect(gateway.triggerSmartContract).toHaveBeenCalled();
    expect(result.txId).toBe(`tx:built:${COLLECT}`);
  });
});

// ── V4 ────────────────────────────────────────────────────────────────────────

const V4_MANAGER = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
const NATIVE = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const POOL_ID = "0x2f8c".padEnd(66, "a");
const V4_COLLECT = "modifyLiquidities(bytes,uint256)";

/**
 * The pool's own key, as the pool manager reports it.
 *
 * `parameters` deliberately does NOT encode `tickSpacing` 12 the way our own encoder would: if
 * anything on this path rebuilt the word from the spacing, the value reaching the payload would
 * differ from this one and the tests below would fail rather than pass by coincidence.
 */
const V4_POOL = {
  poolId: POOL_ID,
  exists: true,
  sqrtPriceX96: "79228162514264337593543950336",
  currentTick: 0,
  liquidity: "1000000",
  currency0: NATIVE,
  currency1: USDT,
  fee: 500,
  tickSpacing: 12,
  hooks: NATIVE,
  parameters: "0xfeed000000000000000000000000000000000000000000000000000000000c00",
};

const V4_POSITION = {
  tokenId: "1",
  owner: OWNER,
  poolId: POOL_ID,
  currency0: NATIVE,
  currency1: USDT,
  fee: 500,
  tickSpacing: 12,
  hooks: NATIVE,
  tickLower: -1284,
  tickUpper: 1116,
  liquidity: "5000",
  hasSubscriber: false,
};

interface V4CollectRequest {
  pool: { currency0: string; currency1: string; hooks: string; fee: number; parameters: string };
  tokenId: string;
  recipient: string;
  deadline: number;
}

function makeV4Port(overrides: Partial<LiquidityPort> = {}) {
  const requests: V4CollectRequest[] = [];
  const port = {
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => FACTS[address]!),
    v4Position: vi.fn(async () => V4_POSITION),
    v4PoolState: vi.fn(async () => V4_POOL),
    v4PositionManager: vi.fn(() => V4_MANAGER),
    // PM 6.3.4's own figures, so the receipt's published example is what these cases reproduce.
    v4OwedFees: vi.fn(async () => ({ amount0: "13974", amount1: "4108" })),
    v4CollectPayload: vi.fn((_n: NetworkDescriptor, request: V4CollectRequest) => {
      requests.push(request);
      return { target: V4_MANAGER, method: V4_COLLECT, parameters: [] };
    }),
    ...overrides,
  } as unknown as LiquidityPort;
  return { port, requests };
}

const V4 = { protocol: "V4", positionId: "1" };

describe("collect-fees — V4", () => {
  it("sends one collect call, approves nothing and signs no permit", async () => {
    const { port } = makeV4Port();
    const { service, scope, gateway } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<string, unknown>;

    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([V4_COLLECT]);
    expect(result).not.toHaveProperty("approvals");
    expect(result).not.toHaveProperty("approvalTxIds");
    expect(result).not.toHaveProperty("permits");
  });

  /**
   * The key is the pool's own, verbatim.
   *
   * A key that differs by one bit names a different pool, and `parameters` is the field most
   * easily rebuilt from something we already have (the tick spacing). This fails if anything on
   * the path re-encodes it, because the fixture's word is not what our encoder would produce.
   */
  it("carries the pool's own parameters word rather than one re-encoded from the tick spacing", async () => {
    const { port, requests } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    expect(requests[0]!.pool).toEqual({
      currency0: NATIVE,
      currency1: USDT,
      hooks: NATIVE,
      fee: 500,
      parameters: V4_POOL.parameters,
    });
  });

  it("reads the key from the pool the position names, not from one the caller supplied", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, { ...V4, token0: "TRX", token1: "USDT" });

    expect(port.v4PoolState).toHaveBeenCalledWith(NETWORK, POOL_ID);
  });

  it("puts the position and the signing account in the call", async () => {
    const { port, requests } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    expect(requests[0]!.tokenId).toBe("1");
    expect(requests[0]!.recipient).toBe(OWNER);
  });

  it("puts the deadline the caller gave in the call", async () => {
    const { port, requests } = makeV4Port();
    const { service, scope } = makeHarness(port);
    const deadline = Math.floor(Date.now() / 1000) + 3_600;

    await service.collectFees(scope, NETWORK, { ...V4, deadline });

    expect(requests[0]!.deadline).toBe(deadline);
  });

  it("defaults the deadline to half an hour out when none is given", async () => {
    const { port, requests } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    const now = Math.floor(Date.now() / 1000);
    expect(requests[0]!.deadline).toBeGreaterThanOrEqual(now + 29 * 60);
    expect(requests[0]!.deadline).toBeLessThanOrEqual(now + 30 * 60 + 5);
  });

  it("reports the pool it collected from, by id and by key", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<string, unknown>;

    expect(result).toMatchObject({
      protocol: "V4",
      positionManager: V4_MANAGER,
      nftTokenId: "1",
      tokensAuto: true,
      recipient: OWNER,
      poolId: POOL_ID,
      feeTier: 500,
      tickSpacing: 12,
      // The word, never the zero address — which on TRON is also native TRX's.
      hooks: "none",
    });
  });

  /**
   * (b) The read answered, and the receipt carries what it said — with the scale beside it.
   *
   * This fails if `v4OwedFees`'s result is dropped anywhere on the path: the amounts are the
   * port's own figures and nothing else on this path could produce them.
   */
  it("publishes what the fee read reported, with each side's scale", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).toEqual({
      address: NATIVE,
      symbol: "TRX",
      decimals: 6,
      amount: "13974",
    });
    expect(result.token1).toEqual({
      address: USDT,
      symbol: "USDT",
      decimals: 6,
      amount: "4108",
    });
  });

  /** The read is asked about the position's own pool and range, not about anything reconstructed. */
  it("asks for the fees of this position's pool and range", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    expect((port.v4OwedFees as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([
      NETWORK,
      { tokenId: "1", poolId: POOL_ID, tickLower: -1284, tickUpper: 1116 },
    ]);
  });

  /** An amount past 2^53: carried as a decimal string, never through a double. */
  it("carries an amount larger than a double can hold, exactly", async () => {
    const huge = "123456789012345678901234567890";
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: huge, amount1: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).toEqual({ address: NATIVE, symbol: "TRX", decimals: 6, amount: huge });
  });

  /**
   * (a) The read answered ZERO. That is a measurement, and it is published as one.
   *
   * The distinction this whole path exists for: a zero that came from the chain is a fact about
   * the position, and it is published without a warning.
   */
  /**
   * A zero that came from the chain is refused in EVERY mode, not only on execute.
   *
   * On V4 this is more than consistency: the collect call is a zero-delta `decreaseLiquidity`, and
   * on an empty position the estimate reverts with `CannotUpdateEmptyPosition` (0xaefeb924). So a
   * dry run that reached the estimate failed as `execution_reverted` while the execute refused as
   * `invalid_value` — two answers to one question. Refusing before the estimate gives one.
   */
  it.each([
    ["a dry run", { dryRun: true }],
    ["a build", { buildOnly: true }],
  ])("refuses %s when the read measured nothing owed, before estimating", async (_name, mode) => {
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: "0", amount1: "0" })) as never,
    });
    const { service, scope, gateway } = makeHarness(port);

    await expect(service.collectFees(scope, NETWORK, { ...V4, ...mode })).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("position 1 has no fees to collect"),
    });
    expect(gateway.triggerSmartContract).not.toHaveBeenCalled();
    expect(gateway.estimateResources).not.toHaveBeenCalled();
  });

  /**
   * An EMPTY position is refused even when the fee read failed.
   *
   * The contract refuses any modification of a position with no liquidity
   * (`CannotUpdateEmptyPosition`), so the collect could never be sent; previewing it would only
   * surface that revert as `execution_reverted` instead of the refusal the execute gives.
   */
  it("refuses a dry run on an empty position even when the fee read failed", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, liquidity: "0" })) as never,
      v4OwedFees: vi.fn(async () => undefined) as never,
    });
    const { service, scope, gateway } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("no fees to collect"),
    });
    expect(gateway.estimateResources).not.toHaveBeenCalled();
  });

  // A position that still holds liquidity but has earned nothing is the same nothing.
  it("refuses a dry run on a funded position that has earned nothing", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, liquidity: "148506" })) as never,
      v4OwedFees: vi.fn(async () => ({ amount0: "0", amount1: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("no fees to collect"),
    });
  });

  /**
   * A collection of nothing is not a small collection.
   *
   * Measured on Nile for V3: the contract accepts it, charges 8.08 TRX and the receipt reads
   * "Fees collected" — success that leaves the caller poorer. V4 gets the same refusal now that the
   * fee read makes the figure available.
   */
  it("refuses to send when the read measured nothing owed", async () => {
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => ({ amount0: "0", amount1: "0" })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(service.collectFees(scope, NETWORK, V4)).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("no fees to collect"),
    });
  });

  /**
   * And the distinction that makes that refusal safe: an UNREADABLE amount is not a zero.
   *
   * Refusing on a failed read would stop a caller collecting real fees because we could not measure
   * them — trading one silent loss for a louder one.
   */
  it("still sends when the read failed, rather than reading absence as nothing", async () => {
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => undefined) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<string, unknown>;

    expect(result.txId).toBeDefined();
    expect((result.token0 as Record<string, unknown>).amount).toBeUndefined();
  });

  /**
   * (c) The read FAILED. No amount at all, and a warning — never a zero.
   *
   * A zero here would tell a caller their position had earned nothing, on the strength of a
   * question nobody managed to ask.
   */
  it("publishes no amount when the fee read fails, and says so", async () => {
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => {
        throw new Error("node unreachable");
      }) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).toEqual({ address: NATIVE, symbol: "TRX", decimals: 6 });
    expect(result.token0).not.toHaveProperty("amount");
    expect(result.token1).not.toHaveProperty("amount");
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_v4_owed_fees_unavailable" }),
    );
  });

  /** (c) again, through the other door: the read answered, in a shape it could not decode. */
  it("publishes no amount when the fee read cannot be decoded, and says so", async () => {
    const { port } = makeV4Port({
      v4OwedFees: vi.fn(async () => undefined) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, V4)) as Record<
      string,
      Record<string, unknown>
    >;

    expect(result.token0).not.toHaveProperty("amount");
    expect(result.token1).not.toHaveProperty("amount");
    expect(scope.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sunswap_v4_owed_fees_undecodable" }),
    );
  });

  /**
   * A dry run that cannot reach the fee helper still previews the call.
   *
   * The whole point of a dry run is to be available before committing to anything, including
   * against a node that is briefly unreachable. An unread fee is a missing figure, not a failure.
   */
  it("still previews when the fee read fails", async () => {
    const { port, requests } = makeV4Port({
      v4OwedFees: vi.fn(async () => {
        throw new Error("node unreachable");
      }) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, {
      ...V4,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.mode).toBe("dry-run");
    expect(requests).toHaveLength(1);
    expect(result.token0).not.toHaveProperty("amount");
  });

  // Native TRX is not a contract, and V4 keys carry it unwrapped — asking it for decimals would
  // fail rather than answer 6.
  it("does not ask the chain what native TRX is", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    expect((port.tokenFacts as unknown as { mock: { calls: unknown[][] } }).mock.calls).toEqual([
      [NETWORK, USDT],
    ]);
  });

  it("refuses a position the account does not hold, naming the owner", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, owner: ELSEWHERE })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_value", message: expect.stringContaining(ELSEWHERE) });
  });

  // An id that was never minted reverts the position read; that is the caller's id, not a fault.
  it("reports an id that was never minted as position_not_found", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => {
        throw new ChainError("execution_reverted", "TRON constant call reverted");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.collectFees(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "position_not_found" });
  });

  it("re-reads the owner immediately before sending", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await service.collectFees(scope, NETWORK, V4);

    expect((port.v4Position as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
      2,
    );
  });

  it("refuses an uninitialised pool rather than building a key for it", async () => {
    const { port, requests } = makeV4Port({
      v4PoolState: vi.fn(async () => ({ ...V4_POOL, exists: false })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, dryRun: true }),
    ).rejects.toMatchObject({ code: "pool_not_found" });
    expect(requests).toEqual([]);
  });

  it("previews without a signer, so a watch-only account can check the pool first", async () => {
    const { port } = makeV4Port();
    const { service, scope, assertCanSign } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, {
      ...V4,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.mode).toBe("dry-run");
    expect(assertCanSign).not.toHaveBeenCalled();
  });
});

describe("collect-fees — V4's cross-checks", () => {
  it("refuses --recipient rather than dropping it", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, recipient: ELSEWHERE, dryRun: true }),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });

  it("refuses a pair the position does not hold, naming both", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, token0: WTRX, token1: USDT, dryRun: true }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining(WTRX),
    });
  });

  // V4's currency order belongs to the pool key, not to the caller: the other way round names the
  // same pool, and the mistake this catches is caught either way round.
  it("accepts the pair the other way round", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, {
      ...V4,
      token0: "USDT",
      token1: "TRX",
      fee: 500,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.mode).toBe("dry-run");
  });

  it("refuses a tier that disagrees with the position's", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, {
        ...V4,
        token0: "TRX",
        token1: "USDT",
        fee: 3000,
        dryRun: true,
      }),
    ).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("3000"),
    });
  });

  /**
   * PM 6.3.3 gives `--fee` a default of 500 and this version drops it, deliberately.
   *
   * On V4 the position names its own pool, so the flag selects nothing and can only agree or
   * disagree. A default that can only disagree is a refusal waiting for everyone whose position is
   * not in the 500 tier, over a value they never typed. So a 3000-tier position with the pair named
   * and no `--fee` is collected from, not refused.
   */
  it("collects from a position in another tier when no --fee is given", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, fee: 3000 })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, token0: "TRX", token1: "USDT", dryRun: true }),
    ).resolves.toBeDefined();
  });

  // Given explicitly, it still has to agree — that is the only thing it can do.
  it("still refuses an explicit --fee that the position contradicts", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, fee: 3000 })) as never,
    });
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, {
        ...V4,
        token0: "TRX",
        token1: "USDT",
        fee: 500,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });

  // With no pair named there is nothing to default against, so the position's own tier stands.
  it("leaves a position in another tier alone when no pair is named", async () => {
    const { port } = makeV4Port({
      v4Position: vi.fn(async () => ({ ...V4_POSITION, fee: 3000 })) as never,
      v4PoolState: vi.fn(async () => ({ ...V4_POOL, fee: 3000 })) as never,
    });
    const { service, scope } = makeHarness(port);

    const result = (await service.collectFees(scope, NETWORK, {
      ...V4,
      dryRun: true,
    })) as Record<string, unknown>;

    expect(result.feeTier).toBe(3000);
  });

  it.each([
    ["token0", { token0: "TRX" }],
    ["token1", { token1: "USDT" }],
  ])("refuses a half-named pair: --%s alone", async (_name, half) => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, ...half, dryRun: true }),
    ).rejects.toMatchObject({ code: "missing_option" });
  });

  it("refuses --fee without the pair, which would check nothing", async () => {
    const { port } = makeV4Port();
    const { service, scope } = makeHarness(port);

    await expect(
      service.collectFees(scope, NETWORK, { ...V4, fee: 500, dryRun: true }),
    ).rejects.toMatchObject({ code: "missing_option" });
  });
});

it("reports V4 fees from the confirmed receipt rather than the pre-send owed estimate", async () => {
  const { port } = makeV4Port({
    v4LiquidityResult: vi.fn(async () => ({
      tokenId: "1",
      liquidityDelta: "0",
      principal0: "0",
      principal1: "0",
      fee0: "14000",
      fee1: "4200",
      balanceDelta0: "14000",
      balanceDelta1: "4200",
    })),
  });
  const { service, scope } = makeHarness(port);
  const result = await service.collectFees(scope, NETWORK, V4);
  expect(result.token0).toMatchObject({ amount: "14000" });
  expect(result.token1).toMatchObject({ amount: "4200" });
  expect(result.amountsEstimated).toBe(false);
});
