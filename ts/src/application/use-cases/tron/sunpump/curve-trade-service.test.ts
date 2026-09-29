import { UsageError } from "../../../../domain/errors/index.js";
import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../../ports/chain/gateway-provider.js";
import type { LaunchpadPort } from "../../../ports/sunpump/launchpad.js";
import type { TxPipeline } from "../../../services/pipeline/index.js";
import { LAUNCHPAD_STATE } from "../../../../domain/sunpump/curve.js";
import { SunPumpCurveTradeService } from "./curve-trade-service.js";

const LAUNCHPAD = "TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw";
const TOKEN = "TBCjrpTjwjF61J8pYY6DKa8JvevbmBah1E";
const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";
const PURCHASE = "purchaseToken(address,uint256)";
const SALE = "saleToken(address,uint256,uint256)";
const APPROVE = "approve(address,uint256)";
const UNLIMITED = (2n ** 256n - 1n).toString();

const NETWORK = {
  id: "tron:728126428",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "728126428",
  sunpump: { launchpad: LAUNCHPAD },
} as unknown as NetworkDescriptor;

/** The live mainnet quote for 1 TRX of the token PM's own example uses. */
const BUY_QUOTE = { tokenAmount: "25125337148664452174594", feeSun: "10000" };
/** 1000 tokens: gross 29401 SUN, of which 10000 is the platform fee. */
const SELL_QUOTE = { trxAmountSun: "29401", feeSun: "10000" };

function makePort(overrides: Partial<LaunchpadPort> = {}): LaunchpadPort {
  return {
    tokenState: vi.fn(async () => LAUNCHPAD_STATE.TRADING),
    tokenFacts: vi.fn(async () => ({ address: TOKEN, decimals: 18, symbol: "Justin" })),
    balanceOf: vi.fn(async () => "99999999999999999999999999"),
    nativeBalance: vi.fn(async () => "1000000000"),
    allowance: vi.fn(async () => "0"),
    approvalPayload: vi.fn((_n: NetworkDescriptor, token: string) => ({
      target: token,
      method: APPROVE,
      parameters: [],
    })),
    quoteBuy: vi.fn(async () => BUY_QUOTE),
    quoteSell: vi.fn(async () => SELL_QUOTE),
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

function makeHarness(port: LaunchpadPort = makePort(), withAccount = true) {
  const gateway = {
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
    return OWNER;
  });
  const scope = {
    activeAccount: {},
    wait: false,
    waitTimeoutMs: 1_000,
    resolveAddress,
    warn: vi.fn(),
  } as unknown as TransactionScope;
  const service = new SunPumpCurveTradeService(
    port,
    { get: () => gateway } as unknown as ChainGatewayProvider,
    pipeline,
  );
  return { service, scope, gateway, port, resolveAddress };
}

describe("the curve state gate", () => {
  it("lets a TRADING token through", async () => {
    const { service, scope } = makeHarness();
    await expect(
      service.buy(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }),
    ).resolves.toMatchObject({ kind: "sunpump-buy" });
  });

  it("refuses an address that is not a SunPump token", async () => {
    const port = makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.NOT_EXIST) as never });
    const { service, scope } = makeHarness(port);
    await expect(
      service.buy(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }),
    ).rejects.toMatchObject({ code: "launchpad_token_not_found" });
  });

  // Two closed states, two different things a reader needs: one is a wait, the other a redirect.
  it("tells a READY_TO_LAUNCH token it is awaiting launch", async () => {
    const port = makePort({
      tokenState: vi.fn(async () => LAUNCHPAD_STATE.READY_TO_LAUNCH) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.buy(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }),
    ).rejects.toMatchObject({
      code: "launchpad_trading_closed",
      message: expect.stringContaining("awaiting launch"),
    });
  });

  it("points a LAUNCHED token at the command that serves its new market", async () => {
    const port = makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "1000", quote: true }),
    ).rejects.toMatchObject({
      code: "launchpad_trading_closed",
      message: expect.stringContaining("sunswap swap"),
    });
  });

  // The state is the FIRST thing asked, before a quote is even attempted: quoting a token that
  // cannot trade wastes a round trip and invites a transaction that must revert.
  it("is checked before anything is quoted", async () => {
    const port = makePort({ tokenState: vi.fn(async () => LAUNCHPAD_STATE.LAUNCHED) as never });
    const { service, scope } = makeHarness(port);
    await service.buy(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }).catch(() => {});
    expect(port.quoteBuy).not.toHaveBeenCalled();
  });
});

describe("--quote", () => {
  // PM 2.11: no account, no password, no transaction. The harness throws if an address is
  // resolved, so this asserts the absence rather than trusting the code path.
  it("touches no account at all", async () => {
    const { service, scope, resolveAddress } = makeHarness(makePort(), false);
    const result = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "1",
      quote: true,
    })) as Record<string, unknown>;
    expect(resolveAddress).not.toHaveBeenCalled();
    expect(result.mode).toBe("quote");
  });

  /**
   * A quote publishes NO floor.
   *
   * `--quote` refuses `--slippage`, so a minimum here would be derived from a default the caller
   * never chose — and nothing would ever enforce it, because a quote produces no transaction. An
   * agent reading `tokensOutMinimum` from a quote would believe it had protection it does not
   * have. Same reasoning as refusing to publish a fee that cannot be honestly measured.
   */
  it.each([
    ["buy", "tokensOutMinimum"],
    ["sell", "trxOutMinimum"],
  ])("publishes neither slippage nor %s on a %s", async (command, minimumKey) => {
    const { service, scope } = makeHarness(makePort(), false);
    const result = (await (command === "buy"
      ? service.buy(scope, NETWORK, { token: TOKEN, amount: "1", quote: true })
      : service.sell(scope, NETWORK, { token: TOKEN, amount: "1000", quote: true }))) as Record<
      string,
      unknown
    >;
    expect(result).not.toHaveProperty("slippage");
    expect(result).not.toHaveProperty(minimumKey);
  });

  // The scale stays: it is what makes the estimate beside it readable, and the receipt guard is
  // what put it there.
  it("keeps the scale of the amount it does publish", async () => {
    const { service, scope } = makeHarness(makePort(), false);
    const result = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "1",
      quote: true,
    })) as Record<string, unknown>;
    expect(result.tokensOutExpected).toBe("25125337148664452174594");
    expect(result.tokenDecimals).toBe(18);
  });

  it("carries no stage, txId or approvals", async () => {
    const { service, scope } = makeHarness(makePort(), false);
    const result = (await service.sell(scope, NETWORK, {
      token: TOKEN,
      amount: "1000",
      quote: true,
    })) as Record<string, unknown>;
    expect(result).not.toHaveProperty("stage");
    expect(result).not.toHaveProperty("txId");
    expect(result).not.toHaveProperty("approvals");
  });
});

describe("buy", () => {
  it("prices from the curve and floors at the default 5%", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "1",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.trxIn).toBe("1000000");
    expect(result.tokensOutExpected).toBe("25125337148664452174594");
    expect(result.tokensOutMinimum).toBe("23869070291231229565864");
    expect(result.slippage).toBe("0.05");
  });

  // The fee is inside the TRX named, not added to it — which is what makes the floor bite on a
  // small buy: 0.01 TRX of 0.1 TRX is ten percent.
  it("reports the fee rate only when the floor pushed it above one percent", async () => {
    const { service, scope } = makeHarness();
    const small = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "0.1",
      quote: true,
    })) as Record<string, unknown>;
    expect(small.platformFeePercent).toBe("10");

    const ordinary = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "1",
      quote: true,
    })) as Record<string, unknown>;
    expect(ordinary).not.toHaveProperty("platformFeePercent");
  });

  it("takes an explicit --min-out over a slippage it was not given", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.buy(scope, NETWORK, {
      token: TOKEN,
      amount: "1",
      minOut: "1",
      dryRun: true,
    })) as Record<string, unknown>;
    expect(result.tokensOutMinimum).toBe("1");
    // No slippage is reported, because none was given and inventing one would be a number we made up.
    expect(result).not.toHaveProperty("slippage");
  });

  it("approves nothing: the TRX travels as the call's value", async () => {
    const { service, scope, gateway } = makeHarness();
    const result = (await service.buy(scope, NETWORK, { token: TOKEN, amount: "1" })) as Record<
      string,
      unknown
    >;
    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([PURCHASE]);
    expect(result).not.toHaveProperty("approvalTxIds");
  });

  it("refuses a buy the account cannot fund", async () => {
    const port = makePort({ nativeBalance: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);
    await expect(
      service.buy(scope, NETWORK, { token: TOKEN, amount: "1", dryRun: true }),
    ).rejects.toMatchObject({ code: "insufficient_balance" });
  });
});

describe("sell", () => {
  it("reports what the caller receives, which is the gross less the fee", async () => {
    const { service, scope } = makeHarness();
    const result = (await service.sell(scope, NETWORK, {
      token: TOKEN,
      amount: "1000",
      dryRun: true,
    })) as Record<string, unknown>;
    // 29401 gross - 10000 fee.
    expect(result.trxOutExpected).toBe("19401");
    // The floor applies to what arrives, not to the gross.
    expect(result.trxOutMinimum).toBe("18430");
  });

  /**
   * The one place in this codebase where an unbounded approval is correct: the curve pulls on
   * every sale and its contract is an upgradeable proxy that expects a standing allowance. The
   * receipt says `unlimited` rather than printing 2^256-1, which nobody reads as a number.
   */
  it("approves the launchpad without limit, and says so in words", async () => {
    const { service, scope, port } = makeHarness();
    const result = (await service.sell(scope, NETWORK, {
      token: TOKEN,
      amount: "1000",
      dryRun: true,
    })) as { approvals: { spender: string; amount: string }[] };
    expect(port.allowance).toHaveBeenCalledWith(NETWORK, TOKEN, OWNER, LAUNCHPAD);
    expect(result.approvals).toEqual([
      expect.objectContaining({ spender: LAUNCHPAD, amount: "unlimited" }),
    ]);
  });

  it("sends no approval when one already stands", async () => {
    const port = makePort({ allowance: vi.fn(async () => UNLIMITED) as never });
    const { service, scope, gateway } = makeHarness(port);
    const result = (await service.sell(scope, NETWORK, {
      token: TOKEN,
      amount: "1000",
    })) as Record<string, unknown>;
    expect(gateway.triggerSmartContract.mock.calls.map((call) => call[2])).toEqual([SALE]);
    expect(result).not.toHaveProperty("approvalTxIds");
  });

  it("refuses a sale the account cannot cover", async () => {
    const port = makePort({ balanceOf: vi.fn(async () => "1") as never });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "1000", dryRun: true }),
    ).rejects.toMatchObject({ code: "insufficient_token_balance" });
  });
});

/**
 * Two distinct conditions, both measured on a live mainnet curve: one token reverts in the quote,
 * three hundred prices and is then eaten by the fee. Each says what happened, and both end with
 * the one thing a caller can act on.
 */
describe("a sale that is too small", () => {
  it("names the threshold when the curve will not price it", async () => {
    const port = makePort({
      quoteSell: vi.fn(async () => {
        throw new Error("TRON constant call reverted");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }),
    ).rejects.toMatchObject({
      code: "invalid_amount",
      message: expect.stringContaining("Sell at least 507595914512855548755 Justin"),
    });
  });

  it("names the threshold when the fee consumes the proceeds", async () => {
    const port = makePort({
      quoteSell: vi.fn(async () => ({ trxAmountSun: "1820", feeSun: "10000" })) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "300", quote: true }),
    ).rejects.toMatchObject({
      code: "invalid_amount",
      message: expect.stringContaining("1820 SUN of proceeds would not cover the 10000 SUN"),
    });
  });

  /**
   * The condition is checked, not assumed. A revert from an amount ABOVE the threshold was
   * something else entirely, and relabelling it would hide the real failure.
   */
  it("lets an unrelated revert speak for itself", async () => {
    const port = makePort({
      quoteSell: vi.fn(async () => {
        throw new Error("node exploded");
      }) as never,
      minimumSellAmount: vi.fn(async () => "1") as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "1000", quote: true }),
    ).rejects.toThrow(/node exploded/);
  });

  it("lets the original error stand when the threshold cannot be read", async () => {
    const port = makePort({
      quoteSell: vi.fn(async () => {
        throw new Error("TRON constant call reverted");
      }) as never,
      minimumSellAmount: vi.fn(async () => {
        throw new Error("node unavailable");
      }) as never,
    });
    const { service, scope } = makeHarness(port);
    await expect(
      service.sell(scope, NETWORK, { token: TOKEN, amount: "1", quote: true }),
    ).rejects.toThrow(/constant call reverted/);
  });
});

describe("confirmed output and early account validation", () => {
  it.each(["buy", "sell"] as const)(
    "publishes the actual %s output from the transaction",
    async (direction) => {
      const h = makeHarness(makePort({ allowance: vi.fn(async () => UNLIMITED) }));
      Object.assign(h.gateway, { receivedAmount: vi.fn(async () => "12345") });
      const out = await h.service[direction](h.scope, NETWORK, {
        token: TOKEN,
        amount: direction === "buy" ? "1" : "1000",
      });
      expect(out).toMatchObject({
        [direction === "buy" ? "tokensOut" : "trxOut"]: "12345",
        amountsEstimated: false,
      });
    },
  );
  it("refuses an incompatible account before asking the curve", async () => {
    const h = makeHarness();
    h.resolveAddress.mockImplementation(() => {
      throw new UsageError("family_mismatch", "switch to an evm network");
    });
    await expect(
      h.service.buy(h.scope, NETWORK, { token: TOKEN, amount: "1" }),
    ).rejects.toMatchObject({
      code: "family_mismatch",
      message: expect.stringContaining("--account"),
    });
    expect(h.port.tokenState).not.toHaveBeenCalled();
  });
});
