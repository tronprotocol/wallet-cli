/**
 * EvmAccountService — `account info` for the EVM family.
 *
 * TRON's `account info` returns the node's `getAccount` object plus derived bandwidth/energy
 * resources. An EVM node has no equivalent call and no such object, so this reports the three
 * facts an EVM account actually has: balance, nonce, and whether the address carries code.
 */
import { describe, it, expect } from "vitest";
import { EvmAccountService } from "./account-service.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { PriceProvider } from "../../ports/price-provider.js";

const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "0xADDR" };
const net = {
  id: "evm:1",
  family: "evm",
  nativeSymbol: "ETH",
  chainId: "1",
  capabilities: [],
} as NetworkDescriptor;
const emptyTokens = { effective: () => [] } as unknown as TokenRepository;
const nullPrices = {
  source: "test",
  nativeUsd: async () => null,
  tokenUsd: async () => new Map<string, number | null>(),
} satisfies PriceProvider;

function service(over: { balance?: string; nonce?: string; code?: string } = {}) {
  const gateway = {
    getNativeBalance: async () => over.balance ?? "0",
    getTransactionCount: async () => over.nonce ?? "0",
    getCode: async () => over.code ?? "0x",
  };
  return new EvmAccountService(
    { get: () => gateway } as unknown as ChainGatewayProvider,
    emptyTokens,
    nullPrices,
  );
}

describe("EvmAccountService.info", () => {
  it("reports address, balance, nonce and symbol", async () => {
    const out = await service({ balance: "1000000000000000000", nonce: "7" }).info(scope, net);

    expect(out).toMatchObject({
      address: "0xADDR",
      balance: "1000000000000000000",
      nonce: 7,
      decimals: 18,
      symbol: "ETH",
    });
  });

  // `eth_getCode` answers this and nothing else does: "0x" is an externally-owned account.
  it("marks an address with no code as an EOA, and gives it no code size", async () => {
    const out = await service({ code: "0x" }).info(scope, net);

    expect(out.type).toBe("eoa");
    // Not zero: an EOA is not a contract that happens to have no bytes.
    expect(out).not.toHaveProperty("codeSize");
  });

  it("marks an address carrying bytecode as a contract and sizes its code", async () => {
    const out = await service({ code: "0x60806040" }).info(scope, net);

    expect(out.type).toBe("contract");
    expect(out.codeSize).toBe(4);
  });

  // The regression this guards: `account info` used to answer with a decimal STRING while
  // `tx info` answered the same field with a number, so an agent reading one and feeding the
  // other saw the type change under it.
  it("reports the nonce as a number, the same carrier tx info uses", async () => {
    const out = await service({ nonce: "42" }).info(scope, net);
    expect(out.nonce).toBe(42);
  });
});

/**
 * `account portfolio` on EVM.
 *
 * Structurally the same as the TRON side, and deliberately so: it is one command, and the row
 * shape comes from the shared `portfolio-holdings` helpers rather than a second copy. What is
 * EVM-specific is only how a balance is read — `eth_call` per ERC-20, in parallel.
 *
 * No multicall: that would mean a contract dependency and a per-chain address to verify, for a
 * saving of a few round trips.
 */
describe("EvmAccountService.portfolio", () => {
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const BOOK = [
    { kind: "erc20", id: USDT, symbol: "USDT", decimals: 6, source: "official" as const },
  ];

  function portfolioService(
    over: {
      native?: string;
      balances?: Record<string, string | Error>;
      nativePrice?: number | null;
      tokenPrices?: Map<string, number | null>;
      pricesThrow?: boolean;
      book?: unknown[];
    } = {},
  ) {
    const gateway = {
      getNativeBalance: async () => over.native ?? "1000000000000000000",
      getErc20Balance: async (contract: string) => {
        const hit = (over.balances ?? { [USDT]: "5000000" })[contract];
        if (hit instanceof Error) throw hit;
        return hit ?? "0";
      },
    };
    const prices = {
      source: "coingecko",
      nativeUsd: async () => {
        if (over.pricesThrow) throw new Error("price boom");
        return over.nativePrice === undefined ? 1500 : over.nativePrice;
      },
      tokenUsd: async () => {
        if (over.pricesThrow) throw new Error("price boom");
        return over.tokenPrices ?? new Map([[USDT, 1]]);
      },
    };
    const tokens = { effective: () => over.book ?? BOOK };
    return new EvmAccountService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      tokens as never,
      prices as never,
    );
  }

  it("lists the native coin first, priced and scaled", async () => {
    const out = await portfolioService().portfolio(scope, net);

    expect(out.holdings[0]).toMatchObject({
      kind: "native",
      symbol: "ETH",
      decimals: 18,
      balance: "1",
      priceUsd: 1500,
      valueUsd: 1500,
    });
  });

  it("lists each book token with its own decimals and price", async () => {
    const out = await portfolioService().portfolio(scope, net);

    expect(out.holdings[1]).toMatchObject({
      kind: "erc20",
      symbol: "USDT",
      id: USDT,
      decimals: 6,
      balance: "5",
      valueUsd: 5,
      source: "official",
    });
  });

  it("totals only what it could value", async () => {
    expect((await portfolioService().portfolio(scope, net)).totalValueUsd).toBe(1505);
  });

  // The whole point of reading per token: one bad contract must cost one row, not the listing.
  it("degrades a single unreadable token without sinking the portfolio", async () => {
    const out = await portfolioService({
      balances: { [USDT]: new Error("execution reverted") },
    }).portfolio(scope, net);

    expect(out.holdings[1]).toMatchObject({
      symbol: "USDT",
      balanceUnavailable: true,
      balance: null,
      reason: "rpc_error",
    });
    // the native row and the total survive
    expect(out.holdings[0]!.valueUsd).toBe(1500);
    expect(out.totalValueUsd).toBe(1500);
  });

  it("reports a stable reason when the price provider fails, and still lists balances", async () => {
    const out = await portfolioService({ pricesThrow: true }).portfolio(scope, net);

    expect(out).toMatchObject({ priceUnavailable: true, priceReason: "price_provider_error" });
    expect(out.holdings[0]).toMatchObject({ balance: "1", priceUsd: null, valueUsd: null });
    expect(out.totalValueUsd).toBeNull();
  });

  it("names the price source it used", async () => {
    expect((await portfolioService().portfolio(scope, net)).priceSource).toBe("coingecko");
  });

  it("reads every token in parallel rather than one after another", async () => {
    const order: string[] = [];
    const many = ["0xaa", "0xbb", "0xcc"].map((id, i) => ({
      kind: "erc20",
      id,
      symbol: `T${i}`,
      decimals: 18,
      source: "user" as const,
    }));
    const gateway = {
      getNativeBalance: async () => "0",
      getErc20Balance: async (contract: string) => {
        order.push(`start:${contract}`);
        await new Promise((r) => setTimeout(r, 5));
        order.push(`end:${contract}`);
        return "0";
      },
    };
    const svc = new EvmAccountService(
      { get: () => gateway } as unknown as ChainGatewayProvider,
      { effective: () => many } as never,
      { source: "x", nativeUsd: async () => null, tokenUsd: async () => new Map() } as never,
    );
    await svc.portfolio(scope, net);

    // all three start before any finishes; a sequential loop would interleave start/end pairs.
    expect(order.slice(0, 3).every((entry) => entry.startsWith("start:"))).toBe(true);
  });
});
