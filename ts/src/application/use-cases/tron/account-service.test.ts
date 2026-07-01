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
