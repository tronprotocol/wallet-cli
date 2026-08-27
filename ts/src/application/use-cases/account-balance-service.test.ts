/**
 * AccountBalanceService — native balance, for any family.
 *
 * Nothing here is chain-specific: the gateway's neutral `client()` reads the balance, the family
 * table supplies the base unit's decimals, and the SYMBOL comes off the network. That last split
 * is the point of the test below — `evm:1` and `evm:56` are one family with two different coins.
 */
import { describe, it, expect } from "vitest";
import { AccountBalanceService } from "./account-balance-service.js";
import type { ChainGatewayProvider } from "../ports/chain/gateway-provider.js";
import type { AccountScope } from "../contracts/execution-scope.js";
import type { NetworkDescriptor } from "../../domain/types/index.js";

const scope: AccountScope = { activeAccount: "wlt_test.0", resolveAddress: () => "0xADDR" };

const gateways = (balance: string) =>
  ({
    client: () => ({ getNativeBalance: async () => balance }),
  }) as unknown as ChainGatewayProvider;

const network = (over: Partial<NetworkDescriptor>): NetworkDescriptor =>
  ({
    id: "evm:1",
    family: "evm",
    nativeSymbol: "ETH",
    chainId: "1",
    capabilities: [],
    ...over,
  }) as NetworkDescriptor;

describe("AccountBalanceService.balance", () => {
  it("reports the raw base-unit balance with the family's decimals", async () => {
    const out = await new AccountBalanceService(gateways("1000000000000000000")).balance(
      scope,
      network({}),
      "evm",
    );

    expect(out).toEqual({
      address: "0xADDR",
      balance: "1000000000000000000",
      decimals: 18,
      symbol: "ETH",
    });
  });

  it("uses TRON's 6 decimals for a TRON network", async () => {
    const out = await new AccountBalanceService(gateways("1983993000")).balance(
      scope,
      network({ id: "tron:nile", family: "tron", nativeSymbol: "TRX", chainId: "nile" }),
      "tron",
    );

    expect(out).toMatchObject({ decimals: 6, symbol: "TRX" });
  });

  // The trap this whole split exists for: BNB and ETH are the same FAMILY. A symbol read off the
  // family table would label a BNB balance "ETH" — a wallet naming the wrong currency.
  it("takes the symbol from the network, not the family", async () => {
    const bsc = await new AccountBalanceService(gateways("5")).balance(
      scope,
      network({ id: "evm:56", nativeSymbol: "BNB", chainId: "56" }),
      "evm",
    );

    expect(bsc.symbol).toBe("BNB");
    expect(bsc.decimals).toBe(18);
  });
});
