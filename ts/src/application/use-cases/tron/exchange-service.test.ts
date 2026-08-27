import { describe, expect, it, vi } from "vitest";
import { TronExchangeService } from "./exchange-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAsset, TronExchange, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";

const NET: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const OTHER = "TMWXhuxiT1KczhBxCseCDDsrhmpYGUcoA9";
const TRX = 1_000_000n;

const warnings: string[] = [];
const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: (m: string) => {
    warnings.push(m);
  },
};

/** TRX:MyToken, 10,000 TRX / 500,000 tokens at precision 6 — the spec's §4.4 pool. */
function pool(over: Partial<TronExchange> = {}): TronExchange {
  return {
    exchangeId: 12,
    creatorAddress: OWNER,
    createTime: 1_700_000_000_000,
    firstTokenId: "_",
    firstTokenBalance: String(10_000n * TRX),
    secondTokenId: "1000123",
    secondTokenBalance: String(500_000n * 1_000_000n),
    ...over,
  };
}

const MYTOKEN: TronAsset = {
  id: "1000123",
  name: "MyToken",
  precision: 6,
  owner_address: "4174472e7d35395a6b5add427eecb7f4b62ad2b071",
  total_supply: "1000000000000000",
  trx_num: 1,
  num: 100,
  start_time: 0,
  end_time: 0,
};

function service(gateway: Partial<TronGateway>, pipeline?: Partial<TxPipeline>) {
  return new TronExchangeService(
    {
      get: () => ({ getAssetById: async () => MYTOKEN, ...gateway }) as unknown as TronGateway,
    } as unknown as ChainGatewayProvider,
    {
      assertCanSign: () => {},
      run: async () => ({ stage: "submitted", txId: "txid" }),
      ...pipeline,
    } as unknown as TxPipeline,
  );
}

/** capture what the service asked the gateway to build. */
function capturing(gateway: Partial<TronGateway>) {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => {
    calls.push(args);
    return {} as never;
  };
  const svc = service(
    {
      buildExchangeCreate: record,
      buildExchangeInject: record,
      buildExchangeWithdraw: record,
      buildExchangeTrade: record,
      ...gateway,
    } as Partial<TronGateway>,
    {
      run: async (p: { build: (o: string) => Promise<unknown> }) => {
        await p.build(OWNER);
        return { stage: "submitted", txId: "txid" } as never;
      },
    },
  );
  return { svc, calls };
}

describe("exchange create", () => {
  it("keeps the pair in the order the user typed", async () => {
    const { svc, calls } = capturing({});
    await svc.create(scope, NET, { pair: "TRX:1000123", amounts: "10000:500000" });
    // owner, firstTokenId, firstBalance, secondTokenId, secondBalance
    expect(calls[0]).toEqual([
      OWNER,
      "_",
      String(10_000n * TRX),
      "1000123",
      String(500_000n * 1_000_000n),
    ]);

    const reversed = capturing({});
    await reversed.svc.create(scope, NET, { pair: "1000123:TRX", amounts: "500000:10000" });
    expect(reversed.calls[0]?.[1]).toBe("1000123");
    expect(reversed.calls[0]?.[3]).toBe("_");
  });

  it("refuses a pair of the same token", async () => {
    await expect(
      service({}).create(scope, NET, { pair: "TRX:trx", amounts: "1:1" }),
    ).rejects.toMatchObject({ code: "same_token" });
  });

  it("refuses a token name, which could contain a colon", async () => {
    await expect(
      service({}).create(scope, NET, { pair: "TRX:MyToken", amounts: "1:1" }),
    ).rejects.toThrow(/not a token id/);
  });

  it("requires exactly one of --amounts and --raw-amounts", async () => {
    await expect(service({}).create(scope, NET, { pair: "TRX:1000123" })).rejects.toThrow(
      /exactly one of --amounts/,
    );
    await expect(
      service({}).create(scope, NET, { pair: "TRX:1000123", amounts: "1:1", rawAmounts: "1:1" }),
    ).rejects.toThrow(/exactly one of --amounts/);
  });
});

describe("exchange inject / withdraw", () => {
  const input = { id: 12, token: "TRX", amount: "1000" };

  it("computes the other side from the current ratio and reports reserves after", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.inject(scope, NET, input)).resolves.toMatchObject({
      tokenQuant: String(1_000n * TRX),
      otherTokenQuant: String(50_000n * 1_000_000n),
      reserveAfter: String(11_000n * TRX),
      otherReserveAfter: String(550_000n * 1_000_000n),
    });
  });

  it("subtracts on withdraw", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.withdraw(scope, NET, input)).resolves.toMatchObject({
      reserveAfter: String(9_000n * TRX),
      otherReserveAfter: String(450_000n * 1_000_000n),
    });
  });

  it("refuses anyone but the creator", async () => {
    const svc = service({ getExchangeById: async () => pool({ creatorAddress: OTHER }) });
    await expect(svc.inject(scope, NET, input)).rejects.toMatchObject({
      code: "not_exchange_creator",
    });
  });

  it("refuses a token that is not in the pair", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.inject(scope, NET, { ...input, token: "999999" })).rejects.toMatchObject({
      code: "token_not_in_exchange",
    });
  });

  it("refuses a closed pair", async () => {
    const svc = service({ getExchangeById: async () => pool({ secondTokenBalance: "0" }) });
    await expect(svc.inject(scope, NET, input)).rejects.toMatchObject({ code: "exchange_closed" });
  });

  it("refuses an amount whose counterpart rounds to zero", async () => {
    // 1,000,000 sun of TRX against a single unit of the other side: the ratio floors to 0
    const svc = service({ getExchangeById: async () => pool({ secondTokenBalance: "1" }) });
    await expect(svc.inject(scope, NET, { id: 12, token: "TRX", rawAmount: "1" })).rejects.toThrow(
      /too small for this pair's current ratio/,
    );
  });

  it("refuses withdrawing more than the pair holds", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(
      svc.withdraw(scope, NET, { id: 12, token: "TRX", amount: "20000" }),
    ).rejects.toMatchObject({ code: "insufficient_reserve" });
  });

  it("reports a missing pair rather than a null read", async () => {
    const svc = service({ getExchangeById: async () => undefined });
    await expect(svc.inject(scope, NET, input)).rejects.toMatchObject({
      code: "exchange_not_found",
    });
  });
});

describe("exchange trade", () => {
  const base = { id: 12, sell: "TRX", amount: "100" };

  it("prices the trade and derives the floor from --slippage", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    const result = await svc.trade(scope, NET, { ...base, slippage: 1 });
    // the spec's §4.4 worked example states 4,950 whole tokens predicted, 1% below → 4,900
    expect(BigInt(result.estimatedReceivedQuant) / 1_000_000n).toBe(4950n);
    expect(BigInt(result.minReceivedQuant) / 1_000_000n).toBe(4900n);
    // and the exact minimal-unit figures, so a change in the curve port is visible
    expect(result.estimatedReceivedQuant).toBe("4950495049");
    expect(result.minReceivedQuant).toBe("4900990098");
  });

  it("takes --min-received as given, in whole tokens", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.trade(scope, NET, { ...base, minReceived: "4900" })).resolves.toMatchObject({
      minReceivedQuant: String(4_900n * 1_000_000n),
    });
  });

  // The rejection has to point at --min-received, not at --amount: the caller would otherwise go
  // and correct an option they never passed (and which carries a different meaning on this command).
  it("blames --min-received, not --amount, for an over-precise floor", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(
      svc.trade(scope, NET, { ...base, minReceived: "1.1234567" }),
    ).rejects.toMatchObject({
      code: "invalid_amount",
      message: expect.stringContaining("--min-received has too many decimal places"),
    });
  });

  it("sends expected=1 and warns when no protection is asked for", async () => {
    warnings.length = 0;
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.trade(scope, NET, base)).resolves.toMatchObject({ minReceivedQuant: "1" });
    expect(warnings.join(" ")).toMatch(/no slippage protection/);
  });

  it("refuses two competing floors", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.trade(scope, NET, { ...base, slippage: 1, minReceived: "1" })).rejects.toThrow(
      /at most one of --min-received/,
    );
  });

  it("names both sides of the swap", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.trade(scope, NET, { ...base, slippage: 1 })).resolves.toMatchObject({
      soldTokenId: "_",
      soldLabel: "TRX",
      receivedTokenId: "1000123",
      receivedLabel: "MyToken",
    });
  });

  it("prefers the receipt's realised amount over the estimate", async () => {
    const svc = service(
      { getExchangeById: async () => pool() },
      {
        run: async () =>
          ({ stage: "confirmed", txId: "t", exchangeReceived: 4_949_000_000 }) as never,
      },
    );
    const result = await svc.trade(scope, NET, { ...base, slippage: 1 });
    expect(result.receivedQuant).toBe("4949000000");
    expect(result.estimatedReceivedQuant).toBe("4950495049");
  });
});

describe("exchange show / list", () => {
  it("resolves both sides for a single pair", async () => {
    const svc = service({ getExchangeById: async () => pool() });
    await expect(svc.show(NET, { id: 12 })).resolves.toMatchObject({
      exchangeId: 12,
      pair: "TRX:1000123",
      firstTokenLabel: "TRX",
      firstTokenDecimals: 6,
      secondTokenLabel: "MyToken",
      secondTokenDecimals: 6,
    });
  });

  it("lists with exactly one RPC and no per-row token lookups", async () => {
    const listExchanges = vi.fn(async () => [pool()]);
    const getAssetById = vi.fn(async () => MYTOKEN);
    const svc = service({ listExchanges, getAssetById });
    await expect(svc.list(NET, { limit: 10, offset: 0 })).resolves.toMatchObject({
      exchanges: [{ exchangeId: 12, pair: "TRX:1000123" }],
      pagination: { offset: 0, limit: 10 },
    });
    expect(listExchanges).toHaveBeenCalledWith(10, 0);
    expect(getAssetById).not.toHaveBeenCalled();
  });
});
