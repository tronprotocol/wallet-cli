import { describe, expect, it, vi } from "vitest";
import { utils as tronUtils } from "tronweb";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LaunchpadPort } from "../../../ports/sunpump/launchpad.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import type { SunSwapTokenResolver } from "../../../services/sunswap-token-resolver.js";
import { LAUNCHPAD_STATE } from "../../../../domain/sunpump/curve.js";
import type { RouterPort, RouterRoute } from "../../../ports/sunswap/router.js";
import type { LiquidityPort } from "../../../ports/sunswap/liquidity.js";
import type { RouterExecutionPort } from "../../../ports/sunswap/router-execution.js";
import type { Permit2Port } from "../../../ports/sunswap/permit2.js";
import type { SignerResolver } from "../../../services/signer/index.js";
import { SunSwapSwapService } from "./swap-service.js";
import { LiquidityTransactions } from "./liquidity-transactions.js";

const UNIVERSAL_ROUTER = "TQqgNg13s2DjvXhW1ky4v6TsR8wZGvb7Y4";
const PERMIT2 = "TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9";
const NOW = Math.floor(Date.now() / 1000);
/** OWNER as the 20-byte EVM form the calldata carries. */
const OWNER_HEX = "27c5d3a60860342244436a07f15b3b3186225aec";
/**
 * The account private key 1 produces, and its EVM form.
 *
 * The send tests trade as this account because the signature has to RECOVER to it: the service
 * refuses a permit whose signer is not the account, and a fabricated signature recovers to nobody
 * in particular. So the test's signer signs for real, with this key, exactly as the software signer
 * does — and the owner check is exercised rather than stubbed out.
 */
const SIGNING_OWNER = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const SIGNING_OWNER_HEX = "7e5f4552091a69125d5dfcb7b8c2659029395bdf";
const SIGNING_KEY = `${"0".repeat(63)}1`;
/** The best fixture route's output, and the 0.5% floor the service must find in the calldata. */
const BEST_OUT = 34376047n;
const BEST_FLOOR = ((BEST_OUT * 9950n) / 10000n).toString();

/** The shape a mainnet planner returns, with the clock moved to now so the TTL bounds hold. */
function permitTypedData(): Record<string, unknown> {
  return {
    primaryType: "PermitSingle",
    domain: {
      name: "Permit2",
      chainId: 728126428,
      verifyingContract: "0xbe365314f2e77fd1257d60c346bb32dbda369403",
    },
    types: {
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
    },
    message: {
      details: {
        token: "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c",
        amount: "100000000",
        expiration: String(NOW + 3600),
        nonce: "0",
      },
      spender: "0xa31d689a84244bc01be56e07aeafb7686f56bb89",
      sigDeadline: String(NOW + 3600),
    },
  };
}

/** A router call carrying the figures the service will check: floor, amount, recipient, permit. */
function routerCall(callValue = "0", recipientHex = OWNER_HEX): Record<string, unknown> {
  const word = (value: string) => BigInt(value).toString(16).padStart(64, "0");
  return {
    target: UNIVERSAL_ROUTER,
    functionSelector: "execute(bytes,bytes[],uint256)",
    callValue,
    feeLimit: "100000000",
    parameters: [
      { type: "bytes", value: "0x1204" },
      {
        type: "bytes[]",
        value: [
          `0x${word("100000000")}${word(BEST_FLOOR)}${word(`0x${recipientHex}`)}${word(String(NOW + 3600))}`,
        ],
      },
      { type: "uint256", value: String(NOW + 1800) },
    ],
  };
}

const LAUNCHPAD = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";
const TRX = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";
const PURCHASE = "purchaseToken(address,uint256)";
const SALE = "saleToken(address,uint256,uint256)";
const APPROVE = "approve(address,uint256)";

const NETWORK = {
  id: "tron:728126428",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "728126428",
  sunpump: { launchpad: LAUNCHPAD },
} as unknown as NetworkDescriptor;

/** A token only the account's own book knows. */
const BOOKED = "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S";
const resolveFixture = (value: string) =>
  ({ TRX, USDT, JUSTIN: TOKEN, BOOKED })[value.toUpperCase()] ?? value;
const resolveToken = vi.fn((_n: NetworkDescriptor, value: string, _lookup: unknown) => ({
  address: resolveFixture(value),
  fromTokenBook: value.toUpperCase() === "BOOKED",
}));
const resolver = {
  resolve: (_n: NetworkDescriptor, value: string) => resolveFixture(value),
  resolveToken,
  resolveSymbol: (_n: NetworkDescriptor, value: string) => value,
  label: () => "tron",
} as unknown as SunSwapTokenResolver;

function makePort(overrides: Partial<LaunchpadPort> = {}): LaunchpadPort {
  return {
    tokenState: vi.fn(async () => LAUNCHPAD_STATE.TRADING),
    tokenFacts: vi.fn(async () => ({ address: TOKEN, decimals: 18, symbol: "Justin" })),
    balanceOf: vi.fn(async () => "99999999999999999999999999"),
    allowance: vi.fn(async () => "0"),
    approvalPayload: vi.fn((_n: NetworkDescriptor, token: string) => ({
      target: token,
      method: APPROVE,
      parameters: [],
    })),
    quoteBuy: vi.fn(async () => ({
      tokenAmount: "25125337148664452174594",
      feeSun: "10000",
    })),
    // The Nile sale's quote: 22728 SUN to the seller, net, and 10000 to the fee address beside it.
    quoteSell: vi.fn(async () => ({ trxAmountSun: "22728", feeSun: "10000" })),
    minimumSellAmount: vi.fn(async () => "507595914512855548755"),
    applyFloor: vi.fn((expected: string, bips: number) =>
      ((BigInt(expected) * BigInt(10000 - bips)) / 10000n).toString(),
    ),
    launchpadAddress: vi.fn(() => LAUNCHPAD),
    buyPayload: vi.fn(() => ({ target: LAUNCHPAD, method: PURCHASE, parameters: [] })),
    sellPayload: vi.fn(() => ({ target: LAUNCHPAD, method: SALE, parameters: [] })),
    ...overrides,
  } as unknown as LaunchpadPort;
}

interface PipelineParams {
  mode?: string;
  build: (from: string) => Promise<unknown>;
  estimate: (tx: unknown) => Promise<Record<string, unknown>>;
}

/** Measured on mainnet for 100 TRX to USDT: three candidates, unsorted by output. */
const routerRoutes: RouterRoute[] = [
  {
    amountInRaw: "100000000",
    amountOutRaw: "34344609",
    fee: "0.050000",
    priceImpactPercent: "0.000000",
    path: [
      { address: TRX, symbol: "TRX" },
      { address: USDT, symbol: "USDT" },
    ],
    protocols: ["V2", "V3"],
    poolFees: ["500", "0"],
    containsUnverifiedHook: false,
    source: {},
  },
  {
    amountInRaw: "100000000",
    amountOutRaw: "34376047",
    fee: "0.349846",
    priceImpactPercent: "-0.000078",
    path: [
      { address: TRX, symbol: "TRX" },
      { address: USDT, symbol: "USDT" },
    ],
    protocols: ["V1", "V4"],
    poolFees: ["3000", "0"],
    containsUnverifiedHook: false,
    source: {},
  },
];

function makeHarness(
  port: LaunchpadPort = makePort(),
  withAccount = true,
  owner = OWNER,
  account: Record<string, unknown> = { address: "41owner", balance: "1000000000" },
) {
  const gateway = {
    // An activated account holding 1000 TRX unless the test passes another record.
    getAccount: vi.fn(async (): Promise<Record<string, unknown>> => account),
    triggerSmartContract: vi.fn(async (_f, _t, method) => ({ txID: `built:${method}` })),
    estimateResources: vi.fn(async () => ({ feeModel: "tron-resource" as const, energy: 48395 })),
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
  const resolveAddress = vi.fn(() => {
    if (!withAccount) throw new Error("resolveAddress must not be called without an account");
    return owner;
  });
  const scope = {
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress,
    warn: vi.fn(),
  } as unknown as TransactionScope;
  // The router branch has its own tests; here it answers nothing, so every case in this file
  // exercises the curve or the decision that leads to it.
  const router = {
    routes: vi.fn(async () => routerRoutes),
  } as unknown as RouterPort;

  // Native TRX throws, as the chain does: the marker address is not a contract, so `decimals()`
  // on it is "Smart contract is not exist". Anything that asks this port about TRX is a defect,
  // and this fixture makes it a failure rather than a plausible 6.
  // Allowance is STATEFUL, because the service's order depends on it: an approval is planned only
  // when the allowance is short, and it is re-read afterwards to prove it landed. A mock that always
  // answered zero would loop, and one that always answered enough would skip the approval entirely.
  let granted = "0";
  const liquidity = {
    balanceOf: vi.fn(async () => "99999999999999999999999999"),
    allowance: vi.fn(async () => granted),
    approvalPayload: vi.fn(
      (_n: NetworkDescriptor, token: string, spender: string, amount: string) => {
        granted = amount;
        return {
          target: token,
          method: APPROVE,
          parameters: [{ type: "address", value: spender }],
        };
      },
    ),
    tokenFacts: vi.fn(async (_n: NetworkDescriptor, address: string) => {
      if (address === TRX)
        throw new Error("TRON triggerConstantContract failed: Smart contract is not exist.");
      return {
        address,
        decimals: address === USDT ? 6 : 18,
        symbol: address === USDT ? "USDT" : "Justin",
      };
    }),
  } as unknown as LiquidityPort;
  // The router's EXECUTION port, distinct from the pricing one: it plans the Permit2 grant and
  // encodes the call. Its answers here are the shapes measured on mainnet, so the guards in the
  // service are exercised rather than bypassed.
  // The permit planner is its own port now: the same planning serves a swap and a V4 deposit, and only
  // the spender differs. Its double is separate so a test can make the grant already-approved without
  // touching how the router call is built.
  const permits = {
    planPermit: vi.fn(async () => ({
      permit2: PERMIT2,
      spender: UNIVERSAL_ROUTER,
      typedData: permitTypedData(),
      grant: { details: { amount: "100000000" } },
      amount: "100000000",
      expiration: String(NOW + 3600),
      mode: "typed-data",
    })),
  } as unknown as Permit2Port;
  const routerExec = {
    routerAddress: vi.fn(() => UNIVERSAL_ROUTER),
    // The chain's clock, which the service uses for the deadline bound instead of its own. Fixed
    // here so the fixture's deadline of NOW + 1800 sits exactly on the boundary rather than near it.
    transactionTime: vi.fn(async () => NOW),
    buildSwapCall: vi.fn(async (_n: unknown, request: { permit?: unknown }) =>
      // TRX in travels as the call's value; a token in sends none and carries a permit instead.
      routerCall(
        request.permit === undefined ? "100000000" : "0",
        owner === SIGNING_OWNER ? SIGNING_OWNER_HEX : OWNER_HEX,
      ),
    ),
  } as unknown as RouterExecutionPort;
  // A REAL signer, not a stub returning plausible hex: the service recovers the address from the
  // signature and refuses one that is not the account's, so a fabricated signature would only prove
  // that the check fires. This one behaves as the software signer does, over whatever it is handed.
  const signTypedData = vi.fn(
    async (payload: { domain: never; types: never; message: never; primaryType?: string }) => {
      const td = tronUtils.typedData;
      return {
        signature: td.signTypedData(payload.domain, payload.types, payload.message, SIGNING_KEY),
        digest: td.TypedDataEncoder.hash(payload.domain, payload.types, payload.message),
        primaryType: payload.primaryType ?? td.TypedDataEncoder.from(payload.types).primaryType,
      };
    },
  );
  const signers = {
    resolve: vi.fn(() => ({ kind: "software", address: owner, signTypedData })),
  } as unknown as SignerResolver;
  const service = new SunSwapSwapService(
    port,
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
    resolver,
    router,
    liquidity,
    routerExec,
    permits,
    signers,
  );
  return {
    service,
    scope,
    pipeline,
    gateway,
    port,
    resolveAddress,
    router,
    liquidity,
    routerExec,
    permits,
    signers,
    signTypedData,
  };
}

/**
 * The routing decision, which is the whole of this command's risk.
 *
 * It is made once, from on-chain state, before anything is quoted — and identically in every
 * mode. A quote from one market and a fill on the other is how this command loses money.
 */
describe("choosing the market", () => {
  it.each([
    ["dry-run", { dryRun: true }],
    ["build-only", { buildOnly: true }],
    ["quote", { quote: true }],
    ["execute", {}],
  ])("reaches the curve for TRX against an unlaunched token in %s", async (_name, mode) => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      ...mode,
    })) as Record<string, unknown>;
    expect(result.market).toBe("sunpump");
  });

  // A pair with no native side cannot be a curve trade, so the curve is never asked about — which
  // also saves an ordinary TRC20 pair a launchpad read it does not need.
  it("does not consult the curve when neither side is TRX", async () => {
    const { service, scope, port } = makeHarness();
    await service
      .swap(scope, NETWORK, { tokenIn: USDT, tokenOut: TOKEN, amountIn: "1", quote: true })
      .catch(() => {});
    expect(port.tokenState).not.toHaveBeenCalled();
  });

  it.each([
    ["LAUNCHED", LAUNCHPAD_STATE.LAUNCHED],
    ["READY_TO_LAUNCH", LAUNCHPAD_STATE.READY_TO_LAUNCH],
    ["NOT_EXIST", LAUNCHPAD_STATE.NOT_EXIST],
  ])("routes a %s token to the router, not the curve", async (_name, state) => {
    const port = makePort({ tokenState: vi.fn(async () => state) as never });
    const { service, scope } = makeHarness(port);
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    })) as Record<string, unknown>;
    // Only TRADING trades on the curve; every other state is the router's business.
    expect(result.market).toBe("sunswap");
    expect(port.quoteBuy).not.toHaveBeenCalled();
  });

  /**
   * A failed probe is NOT evidence that the router is the right market. Falling back would put a
   * quote and a fill in different places, which is exactly what PM 5.1.2 forbids.
   */
  it("stops with provider_error when the curve's state cannot be read", async () => {
    const port = makePort({
      tokenState: vi.fn(async () => {
        throw new Error("node unavailable");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.swap(scope, NETWORK, {
        tokenIn: "TRX",
        tokenOut: TOKEN,
        amountIn: "1",
        quote: true,
      }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("never quotes after a failed probe", async () => {
    const port = makePort({
      tokenState: vi.fn(async () => {
        throw new Error("node unavailable");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await service
      .swap(scope, NETWORK, { tokenIn: "TRX", tokenOut: TOKEN, amountIn: "1", quote: true })
      .catch(() => {});
    expect(port.quoteBuy).not.toHaveBeenCalled();
    expect(port.quoteSell).not.toHaveBeenCalled();
  });

  it("refuses a swap of a token for itself", async () => {
    const { service, scope } = makeHarness();
    await expect(
      service.swap(scope, NETWORK, { tokenIn: "TRX", tokenOut: "TRX", amountIn: "1", quote: true }),
    ).rejects.toMatchObject({ code: "same_token" });
  });
});

describe("the curve branch", () => {
  it("buys when TRX goes in, and approves nothing", async () => {
    const { service, scope, gateway } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
    })) as Record<string, unknown>;
    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([PURCHASE]);
    expect(result).not.toHaveProperty("approvalTxIds");
  });

  it("sells when the token goes in, approving the launchpad without limit", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: TOKEN,
      tokenOut: "TRX",
      amountIn: "1000",
      dryRun: true,
    })) as { approvals: { spender: string; amount: string }[] };
    expect(result.approvals).toEqual([
      expect.objectContaining({ spender: LAUNCHPAD, amount: "unlimited" }),
    ]);
  });

  /**
   * Same curve, different command, different default. `sunpump buy` uses 5% because it is named
   * after a meme-token market; `swap` uses 0.5% (PM 5.1.3), and inheriting the wrong one is the
   * easy mistake. The figures below are PM 5.1.4's own, measured against the live curve.
   */
  it("floors at swap's 0.5%, not sunpump's 5%", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.slippage).toBe("0.005");
    expect(result.amountOutExpected).toBe("25125337148664452174594");
    expect(result.amountOutMinimum).toBe("24999710462921129913721");
  });

  /**
   * A quote is PLURAL and always an array (PM 5.1.4), even where one route is all there will ever
   * be. An agent then parses a quote the same way whether one candidate came back or five, and
   * `routesAvailable` says how many exist without asking for them.
   */
  it("publishes routes as an array with routesAvailable, not flat fields", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    })) as Record<string, never>;
    expect(Object.keys(result).sort()).toEqual([
      "kind",
      "market",
      "mode",
      "routes",
      "routesAvailable",
    ]);
    expect(result.routesAvailable).toBe(1);
    const routes = result.routes as unknown as Record<string, unknown>[];
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      amountIn: "1000000",
      amountOut: "25125337148664452174594",
      protocols: ["SUNPUMP"],
      poolFees: ["0", "0"],
      // SunPump's platform fee, not a pool fee.
      tradingFee: "10000",
    });
    // A curve has no pool to move against, so the key is absent rather than zero.
    expect(routes[0]).not.toHaveProperty("priceImpactPercent");
  });

  // Each hop carries its own scale. PM's path entries do not, and an amount whose scale lives
  // nowhere in the payload is the defect this codebase has shipped three times.
  it("gives every hop its decimals", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    })) as Record<string, never>;
    const path = (
      result.routes as unknown as { path: { symbol: string; decimals: number }[] }[]
    )[0]!.path;
    expect(path).toEqual([
      { address: TRX, symbol: "TRX", decimals: 6 },
      { address: TOKEN, symbol: "Justin", decimals: 18 },
    ]);
  });

  // The quote's TRX is already what the seller receives; the fee is paid beside it, not out of it.
  it("reports the TRX side as the curve quotes it when selling", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: TOKEN,
      tokenOut: "TRX",
      amountIn: "1000",
      quote: true,
    })) as { routes: { amountOut: string; tradingFee: string }[] };
    expect(result.routes[0]!.amountOut).toBe("22728");
    expect(result.routes[0]!.tradingFee).toBe("10000");
  });

  it("floors a sale on what the seller receives", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: TOKEN,
      tokenOut: "TRX",
      amountIn: "1000",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.amountOutExpected).toBe("22728");
    // floor(22728 x 0.995).
    expect(result.amountOutMinimum).toBe("22614");
  });

  // Nile: 320 tokens quoted (473, 10000), a sale the chain fills and pays 473 SUN for.
  it("lets a small sale through when it pays the seller anything", async () => {
    const port = makePort({
      quoteSell: vi.fn(async () => ({ trxAmountSun: "473", feeSun: "10000" })) as never,
    });
    const { service, scope } = makeHarness(port);
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: TOKEN,
      tokenOut: "TRX",
      amountIn: "320",
      quote: true,
    })) as { routes: { amountOut: string }[] };
    expect(result.routes[0]!.amountOut).toBe("473");
  });

  /**
   * Same curve, same refusal as `sunpump sell`: a sale too small to pay the seller is named as
   * such, with the threshold — never the node's raw revert.
   */
  it.each([
    [
      "the curve will not price it",
      vi.fn(async () => {
        throw new Error("TRON constant call reverted");
      }),
    ],
    [
      "it would pay the seller nothing",
      vi.fn(async () => ({ trxAmountSun: "0", feeSun: "10000" })),
    ],
  ])("refuses a sale too small to pay the seller: %s", async (because, quoteSell) => {
    const { service, scope } = makeHarness(makePort({ quoteSell: quoteSell as never }));
    await expect(
      service.swap(scope, NETWORK, {
        tokenIn: TOKEN,
        tokenOut: "TRX",
        amountIn: "1",
        quote: true,
      }),
    ).rejects.toMatchObject({
      code: "invalid_amount",
      message: `this sale is too small: ${because}. Sell at least 507595914512855548755 Justin in base units`,
    });
  });

  it("refuses a buy the account cannot fund", async () => {
    const { service, scope, port } = makeHarness(makePort(), true, OWNER, {
      address: "41owner",
      balance: "1",
    });
    await expect(
      service.swap(scope, NETWORK, {
        tokenIn: "TRX",
        tokenOut: TOKEN,
        amountIn: "1",
        dryRun: true,
      }),
    ).rejects.toMatchObject({
      code: "insufficient_balance",
      message: "this swap spends 1000000 SUN and the account holds 1",
    });
    expect(port.buyPayload).not.toHaveBeenCalled();
  });

  it.each([
    ["buy", "TRX", TOKEN],
    ["sell", TOKEN, "TRX"],
  ])(
    "refuses a %s from an account that is not activated as account_not_active",
    async (_side, tokenIn, tokenOut) => {
      const { service, scope, port } = makeHarness(makePort(), true, OWNER, {});
      await expect(
        service.swap(scope, NETWORK, { tokenIn, tokenOut, amountIn: "1000", dryRun: true }),
      ).rejects.toMatchObject({ code: "account_not_active" });
      expect(port.balanceOf).not.toHaveBeenCalled();
    },
  );

  it("refuses a sale the account cannot cover", async () => {
    const port = makePort({ balanceOf: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);
    await expect(
      service.swap(scope, NETWORK, {
        tokenIn: TOKEN,
        tokenOut: "TRX",
        amountIn: "1000",
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
  });
});

describe("the amount in", () => {
  /**
   * Zero is refused before any market is asked, because nothing a market says can make it valid.
   * Sent on, the route service answers "INVALID AMOUNT", which reached the caller as provider_error —
   * a service fault, exit 1 — for what is the caller's own input.
   */
  it.each(["0", "0.0", "000"])(
    "refuses %s as invalid_amount without asking either market",
    async (amountIn) => {
      const harness = makeHarness();
      await expect(
        harness.service.swap(harness.scope, NETWORK, {
          tokenIn: "TRX",
          tokenOut: "USDT",
          amountIn,
          quote: true,
        }),
      ).rejects.toMatchObject({ code: "invalid_amount" });
      expect(harness.port.tokenState).not.toHaveBeenCalled();
      expect(harness.router.routes).not.toHaveBeenCalled();
    },
  );
});

describe("--quote", () => {
  it("touches no account", async () => {
    const { service, scope, resolveAddress } = makeHarness(makePort(), false);
    await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    });
    expect(resolveAddress).not.toHaveBeenCalled();
  });

  // Same reasoning as the sunpump commands: `--quote` refuses --slippage, so a floor here would
  // come from a default the caller never chose and nothing would enforce it.
  it("publishes no slippage and no minimum, anywhere in the payload", async () => {
    const { service, scope } = makeHarness(makePort(), false);
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    })) as { routes: Record<string, unknown>[] };
    expect(result).not.toHaveProperty("slippage");
    expect(result).not.toHaveProperty("amountOutMinimum");
    // Including inside the route, where the router service offers one of its own.
    expect(result.routes[0]).not.toHaveProperty("amountOutMinimum");
    expect(result.routes[0]!.amountOut).toBe("25125337148664452174594");
  });

  it("still says which market answered", async () => {
    const { service, scope } = makeHarness(makePort(), false);
    const result = (await service.swap(scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
      quote: true,
    })) as Record<string, unknown>;
    expect(result.market).toBe("sunpump");
  });
});

/**
 * The router branch.
 *
 * Quoting is real and sending is refused, so what these tests hold is the shape of the quote —
 * and the two ways it has already been wrong: the best route is not the first one returned, and
 * native TRX has no contract to ask about its own scale.
 */
describe("the router branch", () => {
  const launched = () =>
    makeHarness(makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }));

  const quoteUsdt = async (harness: ReturnType<typeof makeHarness>, all = false) =>
    (await harness.service.swap(harness.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: "USDT",
      amountIn: "100",
      quote: true,
      ...(all ? { all: true } : {}),
    })) as { routes: Record<string, unknown>[]; routesAvailable: number };

  // TRX's six decimals are the chain's own definition of SUN. Asking the marker address for
  // `decimals()` gets "Smart contract is not exist", which is what this used to do.
  it("never asks a contract what native TRX is", async () => {
    const harness = launched();
    const result = await quoteUsdt(harness);
    expect(harness.liquidity.tokenFacts).not.toHaveBeenCalledWith(NETWORK, TRX);
    // And the scale still arrives: 100 TRX is 100000000 SUN.
    expect(result.routes[0]!.amountIn).toBe("100000000");
  });

  /**
   * Measured on mainnet: the route service returned the worst output first. Taking `route[0]` is
   * how a caller is quoted 34.344609 when 34.376047 was on offer.
   */
  it("shows the best route by output, not the first returned", async () => {
    const result = await quoteUsdt(launched());
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.amountOut).toBe("34376047");
    // How many exist, so a caller knows --all would add something.
    expect(result.routesAvailable).toBe(2);
  });

  it("lists every candidate under --all, in the order returned", async () => {
    const result = await quoteUsdt(launched(), true);
    expect(result.routes.map((route) => route.amountOut)).toEqual(["34344609", "34376047"]);
    expect(result.routesAvailable).toBe(2);
  });

  /**
   * The service sends the fee as a human decimal and has no raw field at all, so the raw figure is
   * derived — in the INPUT token's units, which is what the fee is charged in.
   */
  it("derives the trading fee in the input token's base units", async () => {
    const result = await quoteUsdt(launched(), true);
    expect(result.routes.map((route) => route.tradingFee)).toEqual(["50000", "349846"]);
  });

  // Negative is a real answer — the route paid better than the reference price — and clamping it
  // would be editing a measurement.
  it("publishes a negative price impact as measured", async () => {
    const result = await quoteUsdt(launched());
    expect(result.routes[0]!.priceImpactPercent).toBe("-0.000078");
  });

  /**
   * Scales come from POSITION, not from the ticker. Two different contracts sharing a symbol is
   * ordinary on TRON, and a symbol lookup would hand the intermediate the input's scale — which
   * is how a receipt prints 1,000,000 USDT for one dollar.
   */
  it("scales the two ends it resolved and leaves an intermediate unscaled", async () => {
    const harness = launched();
    vi.mocked(harness.router.routes).mockResolvedValueOnce([
      {
        amountInRaw: "100000000",
        amountOutRaw: "34343073",
        fee: "0.349846",
        priceImpactPercent: "0",
        path: [
          { address: TRX, symbol: "TRX" },
          // Same ticker as the input, a different contract. A symbol lookup would give it 6.
          { address: TOKEN, symbol: "TRX" },
          { address: USDT, symbol: "USDT" },
        ],
        protocols: ["V2", "V2"],
        poolFees: ["300", "300"],
        containsUnverifiedHook: false,
        source: {},
      },
    ]);
    const result = await quoteUsdt(harness);
    expect(result.routes[0]!.path).toEqual([
      { address: TRX, symbol: "TRX", decimals: 6 },
      { address: TOKEN, symbol: "TRX" },
      { address: USDT, symbol: "USDT", decimals: 6 },
    ]);
  });

  it("stops with no_matching_route when the router offers nothing", async () => {
    const harness = launched();
    vi.mocked(harness.router.routes).mockResolvedValueOnce([]);
    await expect(
      harness.service.swap(harness.scope, NETWORK, {
        tokenIn: "TRX",
        tokenOut: "USDT",
        amountIn: "100",
        quote: true,
      }),
    ).rejects.toMatchObject({ code: "no_matching_route" });
  });

  /**
   * A token-for-token swap cannot be built before its permit is signed, and `--build-only` exists
   * so a caller can sign elsewhere. Handing over a call built without the permit would revert.
   */
  it("refuses --build-only when the swap spends a token", async () => {
    const harness = launched();
    await expect(
      harness.service.swap(harness.scope, NETWORK, {
        tokenIn: "USDT",
        tokenOut: "TRX",
        amountIn: "100",
        buildOnly: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_option" });
  });

  // TRX in needs no permit at all, so that path builds like any other transaction.
  it("allows --build-only when the swap spends TRX", async () => {
    const harness = launched();
    const result = (await harness.service.swap(harness.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: "USDT",
      amountIn: "100",
      buildOnly: true,
    })) as Record<string, unknown>;
    expect(result.market).toBe("sunswap");
    expect(harness.permits.planPermit).not.toHaveBeenCalled();
  });
});

/**
 * Sending a router swap.
 *
 * The order is the design, so the order is what these hold: the allowance is exact and confirmed
 * before anything is signed, the grant is checked before a signature exists and its signer after,
 * and the encoded call is checked against the same figures the receipt publishes. Every step is
 * exercised with a real signature, so the owner check can fail rather than merely being present.
 */
describe("sending a router swap", () => {
  const sending = () =>
    makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      SIGNING_OWNER,
    );

  const sell = async (harness: ReturnType<typeof makeHarness>, extra = {}) =>
    (await harness.service.swap(harness.scope, NETWORK, {
      tokenIn: "USDT",
      tokenOut: "TRX",
      amountIn: "100",
      ...extra,
    })) as Record<string, unknown>;

  /**
   * Exactly the trade, to PERMIT2 — not to the router.
   *
   * The router never touches the token allowance; Permit2 does, and the router is only the spender
   * named inside the permit. An unlimited approval here is what the SDK's own swap planner does and
   * what PM 13.3 reserves for two named paths, neither of which is this one.
   */
  it("approves exactly the amount, to Permit2", async () => {
    const harness = sending();
    await sell(harness);
    expect(harness.permits.planPermit).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({ amount: "100000000", ttlSeconds: 3600 }),
    );
    // A fresh harness, because the first swap leaves the allowance standing and a sufficient one is
    // correctly not approved again.
    const approvals = (await sell(sending())).approvals as { spender: string; amount: string }[];
    expect(approvals).toEqual([expect.objectContaining({ spender: PERMIT2, amount: "100000000" })]);
  });

  // The allowance is exact, so a second swap of the same size needs no approval and a larger one
  // does. Nothing standing is reused beyond what it covers.
  it("does not approve again when the allowance already covers the trade", async () => {
    const harness = sending();
    await sell(harness);
    const second = await sell(harness);
    expect(second.approvals).toEqual([]);
    expect(second.approvalTxIds).toBeUndefined();
  });

  it("publishes the grant it authorized, not just that it authorized one", async () => {
    const result = await sell(sending());
    expect(result.permit).toEqual({
      permit2: PERMIT2,
      spender: UNIVERSAL_ROUTER,
      amount: "100000000",
      expiration: String(NOW + 3600),
    });
  });

  // The floor is the service's own, from the default 0.5%, and it is the number the calldata check
  // looks for. The route service's amountOutMinimum is never used: it equals amountOut.
  it("enforces its own floor and publishes it", async () => {
    const result = await sell(sending());
    expect(result.amountOutMinimum).toBe(BEST_FLOOR);
    expect(result.amountOutExpected).toBe(String(BEST_OUT));
    expect(result.slippage).toBe("0.005");
  });

  it("encodes the call only after the permit is signed", async () => {
    const harness = sending();
    await sell(harness);
    const signedAt = harness.signTypedData.mock.invocationCallOrder[0]!;
    const encodedAt = vi.mocked(harness.routerExec.buildSwapCall).mock.invocationCallOrder[0]!;
    expect(signedAt).toBeLessThan(encodedAt);
  });

  /**
   * A grant that is not the trade is refused before a signature exists. Unlimited is the case that
   * matters: it is what the SDK's swap planner produces, so this is not a hypothetical shape.
   */
  it("refuses to sign an unlimited grant", async () => {
    const harness = sending();
    const typedData = permitTypedData();
    (typedData.message as { details: { amount: string } }).details.amount = (
      2n ** 160n -
      1n
    ).toString();
    vi.mocked(harness.permits.planPermit).mockResolvedValueOnce({
      permit2: PERMIT2,
      spender: UNIVERSAL_ROUTER,
      typedData,
      grant: {},
      amount: (2n ** 160n - 1n).toString(),
      expiration: String(NOW + 3600),
      mode: "typed-data",
    });
    await expect(sell(harness)).rejects.toMatchObject({ code: "permit_mismatch" });
    expect(harness.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses to sign a grant that outlives the hour it asked for", async () => {
    const harness = sending();
    const typedData = permitTypedData();
    (typedData.message as { details: { expiration: string } }).details.expiration = String(
      NOW + 30 * 86400,
    );
    vi.mocked(harness.permits.planPermit).mockResolvedValueOnce({
      permit2: PERMIT2,
      spender: UNIVERSAL_ROUTER,
      typedData,
      grant: {},
      amount: "100000000",
      expiration: String(NOW + 30 * 86400),
      mode: "typed-data",
    });
    await expect(sell(harness)).rejects.toMatchObject({ code: "permit_mismatch" });
    expect(harness.signTypedData).not.toHaveBeenCalled();
  });

  /**
   * The owner check, which only a finished signature can answer. Here the account is somebody the
   * signing key is not, so the recovery must disagree — and the swap must not be encoded.
   */
  it("refuses a signature that recovers to another account", async () => {
    const harness = makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      OWNER,
    );
    await expect(sell(harness)).rejects.toMatchObject({ code: "signing_rejected" });
    expect(harness.routerExec.buildSwapCall).not.toHaveBeenCalled();
  });

  /** The floor lives in the calldata, so a call that does not carry ours is not sent. */
  it("refuses an encoded call whose floor is not the one published", async () => {
    const harness = sending();
    vi.mocked(harness.routerExec.buildSwapCall).mockResolvedValueOnce(
      routerCall("0", SIGNING_OWNER_HEX) as never,
    );
    // The stock call carries BEST_FLOOR; asking for a different slippage moves our expectation and
    // the containment check is what notices.
    await expect(sell(harness, { slippage: "0.01" })).rejects.toMatchObject({
      code: "router_call_mismatch",
    });
    /**
     * The APPROVAL has been sent by this point, and that is inherent rather than a defect: Permit2
     * cannot move the token until the allowance exists, so the approval necessarily precedes the
     * call that is then checked. What must not happen is the swap going out, so the assertion is
     * that exactly one transaction was built and it was the approval on the token.
     */
    expect(harness.gateway.triggerSmartContract).toHaveBeenCalledTimes(1);
    const [, target, method] = vi.mocked(harness.gateway.triggerSmartContract).mock.calls[0]!;
    expect([target, method]).toEqual([USDT, APPROVE]);
  });

  it("sends nothing when the encoded call is refused", async () => {
    const harness = sending();
    vi.mocked(harness.routerExec.buildSwapCall).mockResolvedValueOnce({
      ...routerCall("0", SIGNING_OWNER_HEX),
      target: USDT,
    } as never);
    await expect(sell(harness)).rejects.toMatchObject({ code: "router_call_mismatch" });
  });
});

/**
 * `--dry-run` on the router path.
 *
 * It cannot price the swap, and the reason is not caution: encoding the call needs the signature,
 * and a dry run does not sign. So it prices the approval for real and publishes the grant's terms,
 * which is what a caller came to check.
 */
describe("--dry-run on a router swap", () => {
  const dry = async (owner: string) => {
    const harness = makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      owner,
    );
    const result = (await harness.service.swap(harness.scope, NETWORK, {
      tokenIn: "USDT",
      tokenOut: "TRX",
      amountIn: "100",
      dryRun: true,
    })) as Record<string, unknown>;
    return { harness, result };
  };

  it("signs nothing", async () => {
    const { harness } = await dry(SIGNING_OWNER);
    expect(harness.signTypedData).not.toHaveBeenCalled();
  });

  it("does not encode the call it cannot price", async () => {
    const { harness } = await dry(SIGNING_OWNER);
    expect(harness.routerExec.buildSwapCall).not.toHaveBeenCalled();
  });

  it("says the fee covers the approval only", async () => {
    const { result } = await dry(SIGNING_OWNER);
    expect(result.mode).toBe("dry-run");
    expect(result.feeCovers).toBe("approvals");
  });

  it("publishes the grant it would ask for", async () => {
    const { result } = await dry(SIGNING_OWNER);
    expect(result.permit).toEqual(
      expect.objectContaining({ amount: "100000000", spender: UNIVERSAL_ROUTER }),
    );
  });
});

/**
 * A standing Permit2 grant that already covers the trade.
 *
 * Measured on Nile: the planner answers `already-approved` and produces no permit. For a DEPOSIT that
 * is fine — the call goes out bare. For a router SWAP it is not, because the permit travels inside the
 * router's own calldata, so there is nothing to send without one. Refused rather than guessed at.
 */
describe("when the grant already covers the trade", () => {
  it("refuses a router swap rather than sending a call with no permit", async () => {
    const harness = makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      SIGNING_OWNER,
    );
    vi.mocked(harness.permits.planPermit).mockResolvedValueOnce(undefined as never);
    await expect(
      harness.service.swap(harness.scope, NETWORK, {
        tokenIn: "USDT",
        tokenOut: "TRX",
        amountIn: "100",
      }),
    ).rejects.toMatchObject({ code: "permit_mismatch" });
    expect(harness.routerExec.buildSwapCall).not.toHaveBeenCalled();
  });

  // And the spender is NAMED on every call, never defaulted: the same planner also grants to the V4
  // position manager, and a grant to the wrong contract is the whole risk.
  it("names the Universal Router as the spender", async () => {
    const harness = makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      SIGNING_OWNER,
    );
    await harness.service.swap(harness.scope, NETWORK, {
      tokenIn: "USDT",
      tokenOut: "TRX",
      amountIn: "100",
    });
    expect(harness.permits.planPermit).toHaveBeenCalledWith(
      NETWORK,
      expect.objectContaining({ spender: UNIVERSAL_ROUTER, ttlSeconds: 3600 }),
    );
  });
});

describe("swap receipt output", () => {
  it.each(["sunpump", "sunswap"])("reads confirmed %s proceeds", async (market) => {
    const h = makeHarness(
      makePort({
        tokenState: vi.fn(async () =>
          market === "sunpump" ? LAUNCHPAD_STATE.TRADING : LAUNCHPAD_STATE.NOT_EXIST,
        ),
      }),
    );
    const receivedAmount = vi.fn(async () => "12345");
    Object.assign(h.gateway, { receivedAmount });
    const out = await h.service.swap(h.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: market === "sunpump" ? "1" : "100",
    });
    expect(out).toMatchObject({ amountOut: "12345", amountsEstimated: false });
    expect(receivedAmount).toHaveBeenCalledWith(expect.any(String), TOKEN, OWNER);
  });
  it("keeps the estimate with a warning when receipt evidence is missing", async () => {
    const h = makeHarness();
    Object.assign(h.gateway, { receivedAmount: vi.fn(async () => undefined) });
    const out = await h.service.swap(h.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: TOKEN,
      amountIn: "1",
    });
    expect(out.amountsEstimated).toBe(true);
    expect(out).not.toHaveProperty("amountOut");
    expect(h.scope.warn).toHaveBeenCalled();
  });
});

/**
 * The balance a router swap spends is checked before anything else is planned (PRD 13.1).
 *
 * In every mode, and before the approval: an execute that found the shortfall afterwards would
 * already have paid for a Permit2 approval it can never use.
 */
describe("balances on a router swap", () => {
  const harness = () =>
    makeHarness(
      makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }),
      true,
      SIGNING_OWNER,
    );
  const MODES = [
    ["dry-run", { dryRun: true }],
    ["execute", {}],
  ] as const;

  it.each(MODES)("refuses a short token balance in %s, approving nothing", async (_n, mode) => {
    const h = harness();
    vi.mocked(h.liquidity.balanceOf).mockResolvedValue("0");
    const withApprovals = vi.spyOn(LiquidityTransactions.prototype, "withApprovals");
    try {
      await expect(
        h.service.swap(h.scope, NETWORK, {
          tokenIn: "USDT",
          tokenOut: "TRX",
          amountIn: "1",
          ...mode,
        }),
      ).rejects.toMatchObject({
        code: "insufficient_token_balance",
        message: "this swap sells 1000000 of USDT in base units and the account holds 0",
      });
      expect(h.permits.planPermit).not.toHaveBeenCalled();
      expect(h.liquidity.allowance).not.toHaveBeenCalled();
      expect(withApprovals).not.toHaveBeenCalled();
      expect(h.pipeline.run).not.toHaveBeenCalled();
    } finally {
      withApprovals.mockRestore();
    }
  });

  it.each([...MODES, ["build-only", { buildOnly: true }]] as const)(
    "refuses a short TRX balance in %s",
    async (_n, mode) => {
      const h = harness();
      h.gateway.getAccount.mockResolvedValue({ address: SIGNING_OWNER, balance: "5" });
      await expect(
        h.service.swap(h.scope, NETWORK, {
          tokenIn: "TRX",
          tokenOut: "USDT",
          amountIn: "1",
          ...mode,
        }),
      ).rejects.toMatchObject({
        code: "insufficient_balance",
        message: "this swap spends 1000000 SUN and the account holds 5",
      });
      expect(h.routerExec.buildSwapCall).not.toHaveBeenCalled();
      expect(h.pipeline.run).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["TRX", "USDT"],
    ["USDT", "TRX"],
  ])("refuses an account that is not activated, spending %s", async (tokenIn, tokenOut) => {
    const h = harness();
    h.gateway.getAccount.mockResolvedValue({});
    await expect(
      h.service.swap(h.scope, NETWORK, { tokenIn, tokenOut, amountIn: "1", dryRun: true }),
    ).rejects.toMatchObject({ code: "account_not_active" });
    expect(h.permits.planPermit).not.toHaveBeenCalled();
    expect(h.pipeline.run).not.toHaveBeenCalled();
  });

  it("goes ahead when the balance covers the trade exactly", async () => {
    const h = harness();
    vi.mocked(h.liquidity.balanceOf).mockResolvedValue("100000000");
    const result = await h.service.swap(h.scope, NETWORK, {
      tokenIn: "USDT",
      tokenOut: "TRX",
      amountIn: "100",
      dryRun: true,
    });
    expect(result.mode).toBe("dry-run");
  });
});

describe("symbols from the account's token book", () => {
  const launched = () =>
    makeHarness(makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never }));

  it("resolves through the account the command uses, for a quote too", async () => {
    const h = launched();
    Object.assign(h.scope, { activeAccount: "wlt_main.0" });
    await h.service.swap(h.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: "USDT",
      amountIn: "1",
      quote: true,
    });
    expect(resolveToken).toHaveBeenCalledWith(NETWORK, "USDT", {
      caller: "swap",
      account: "wlt_main.0",
    });
  });

  it("publishes which address came from the book", async () => {
    const h = launched();
    const result = await h.service.swap(h.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: "BOOKED",
      amountIn: "1",
      quote: true,
    });
    expect(result.fromTokenBook).toEqual([BOOKED]);
  });

  it("adds no key when every side is official", async () => {
    const h = launched();
    const result = await h.service.swap(h.scope, NETWORK, {
      tokenIn: "TRX",
      tokenOut: "USDT",
      amountIn: "1",
      quote: true,
    });
    expect(result).not.toHaveProperty("fromTokenBook");
  });
});
