import { describe, it, expect } from "vitest";
import { TronAccountService } from "./account-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronHistoryReader } from "../../ports/chain/tron-history-reader.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { PriceProvider } from "../../ports/price-provider.js";

const net: NetworkDescriptor = { id: "tron:nile", family: "tron", chainId: "nile", aliases: ["nile"], capabilities: [] };
const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "TXaddress" };

function serviceWith(nativeRaw: string, nativePrice: number | null) {
  const gateway = {
    getNativeBalance: async () => nativeRaw,
    getTrc10Balance: async () => "0",
    getTrc20Balance: async () => "0",
  };
  const gateways = { client: () => gateway, get: () => gateway } as unknown as ChainGatewayProvider;
  const tokens = { effective: () => [] } as unknown as TokenRepository;
  const prices = {
    source: "test",
    nativeUsd: async () => nativePrice,
    tokenUsd: async () => new Map(),
  } as unknown as PriceProvider;
  return new TronAccountService(gateways, {} as unknown as TronHistoryReader, tokens, prices);
}

describe("TronAccountService.balance (direction A shape)", () => {
  it("returns raw sun balance with native decimals + symbol (no unit label)", async () => {
    const result = await serviceWith("1983993000", 0.12).balance(scope, net, "tron");
    expect(result).toEqual({ address: "TXaddress", balance: "1983993000", decimals: 6, symbol: "TRX" });
    expect(result).not.toHaveProperty("unit");
  });
});

describe("TronAccountService.portfolio native USD conversion", () => {
  it("prices the native TRX holding from raw sun × price at 6-decimal scale", async () => {
    const result = await serviceWith("1983993000", 0.12).portfolio(scope, net);
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native).toMatchObject({
      kind: "native", symbol: "TRX", decimals: 6, rawBalance: "1983993000", balance: "1983.993", priceUsd: 0.12,
    });
    expect(native.valueUsd).toBe(238.07916); // 1983.993 × 0.12, rounded to 6 dp
    expect(result.totalValueUsd).toBe(238.07916);
    expect(result.priceSource).toBe("test");
  });

  it("leaves native valueUsd + total null when the price source returns null", async () => {
    const result = await serviceWith("1983993000", null).portfolio(scope, net);
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native.valueUsd).toBeNull();
    expect(result.totalValueUsd).toBeNull();
  });
});

describe("TronAccountService.portfolio per-token best-effort (issue #9)", () => {
  const TOK = { kind: "trc20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", symbol: "USDT", decimals: 6, name: "Tether", source: "user" };

  function serviceWithFailingToken() {
    const gateway = {
      getNativeBalance: async () => "1000000",
      getTrc10Balance: async () => "0",
      getTrc20Balance: async () => { throw new Error("TRON trc20 balanceOf failed: HTTP 500"); },
    };
    const gateways = { client: () => gateway, get: () => gateway } as unknown as ChainGatewayProvider;
    const tokens = { effective: () => [TOK] } as unknown as TokenRepository;
    const prices = { source: "test", nativeUsd: async () => 0.1, tokenUsd: async () => new Map([[TOK.id, 1]]) } as unknown as PriceProvider;
    return new TronAccountService(gateways, {} as unknown as TronHistoryReader, tokens, prices);
  }

  it("one unreadable token degrades to a stable reason without leaking the raw error (I-06)", async () => {
    const result = await serviceWithFailingToken().portfolio(scope, net);
    // native still resolved
    const native = result.holdings.find((h) => h.kind === "native")!;
    expect(native.balance).toBe("1"); // 1_000_000 sun / 1e6
    // the failing token is present but degraded, not thrown
    const token = result.holdings.find((h) => h.symbol === "USDT")!;
    expect(token.rawBalance).toBeNull();
    expect(token.balance).toBeNull();
    expect(token.valueUsd).toBeNull();
    // stable enum, and the raw downstream message must NOT survive into the payload
    expect(token.balanceUnavailable).toBe(true);
    expect(token.reason).toBe("rpc_error");
    expect(JSON.stringify(token)).not.toContain("HTTP 500");
    // total counts only the readable holdings (native), not the degraded token
    expect(result.totalValueUsd).toBe(0.1); // 1 × 0.1
  });

  it("a failing price source degrades to a stable reason without leaking the raw error (I-06)", async () => {
    const gateway = {
      getNativeBalance: async () => "1000000",
      getTrc10Balance: async () => "0",
      getTrc20Balance: async () => "0",
    };
    const gateways = { client: () => gateway, get: () => gateway } as unknown as ChainGatewayProvider;
    const tokens = { effective: () => [TOK] } as unknown as TokenRepository;
    const prices = {
      source: "test",
      nativeUsd: async () => { throw new Error("request to https://api.provider.com/?key=SECRET failed"); },
      tokenUsd: async () => new Map(),
    } as unknown as PriceProvider;
    const result = await new TronAccountService(gateways, {} as unknown as TronHistoryReader, tokens, prices).portfolio(scope, net);
    expect(result.priceUnavailable).toBe(true);
    expect(result.priceReason).toBe("price_provider_error");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
