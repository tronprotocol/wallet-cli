import type { ChainFamily, EffectiveTokenEntry, NetworkDescriptor } from "../../../domain/types/index.js";
import { FAMILIES } from "../../../domain/family/index.js";
import { fromBaseUnits } from "../../../domain/amounts/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronHistoryQuery, TronHistoryReader } from "../../ports/chain/tron-history-reader.js";
import type { PriceProvider } from "../../ports/price-provider.js";
import type { TokenRepository } from "../../ports/token-repository.js";

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function holding(
  kind: string,
  symbol: string,
  decimals: number,
  raw: string,
  price: number | null,
  extra: Record<string, unknown> = {},
) {
  const balance = fromBaseUnits(raw, decimals);
  return {
    kind,
    symbol,
    decimals,
    rawBalance: raw,
    balance,
    priceUsd: price,
    valueUsd: price === null ? null : round6(Number(balance) * price),
    ...extra,
  };
}

export class TronAccountService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly history: TronHistoryReader,
    private readonly tokens: TokenRepository,
    private readonly prices: PriceProvider,
  ) {}

  async balance(scope: AccountScope, network: NetworkDescriptor, family: ChainFamily) {
    const address = scope.resolveAddress(family);
    return {
      address,
      balance: await this.gateways.client(network).getNativeBalance(address),
      unit: FAMILIES[family].nativeUnit,
    };
  }

  async info(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const [account, resources] = await Promise.all([
      gateway.getAccount(address),
      gateway.getAccountResources(address),
    ]);
    const number = (value: unknown) => Number(value ?? 0);
    return {
      address,
      account,
      resources: {
        bandwidth: {
          used: number(resources.NetUsed) + number(resources.freeNetUsed),
          limit: number(resources.NetLimit) + number(resources.freeNetLimit),
        },
        energy: {
          used: number(resources.EnergyUsed),
          limit: number(resources.EnergyLimit),
        },
      },
    };
  }

  historyFor(scope: AccountScope, network: NetworkDescriptor, query: TronHistoryQuery) {
    return this.history.get(network, scope.resolveAddress("tron"), query);
  }

  async portfolio(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("tron");
    const gateway = this.gateways.get(network, "tron");
    const tokens = this.tokens.effective(network.id, scope.activeAccount);
    const [nativeRaw, tokenBalances] = await Promise.all([
      gateway.getNativeBalance(address),
      Promise.all(tokens.map((token) =>
        token.kind === "trc10"
          ? gateway.getTrc10Balance(token.id, address)
          : gateway.getTrc20Balance(token.id, address),
      )),
    ]);

    let priceError: string | undefined;
    let nativePrice: number | null = null;
    let tokenPrices = new Map<string, number | null>();
    try {
      [nativePrice, tokenPrices] = await Promise.all([
        this.prices.nativeUsd(network.id),
        this.prices.tokenUsd(
          network.id,
          tokens.filter((token) => token.kind === "trc20").map((token) => token.id),
        ),
      ]);
    } catch (error) {
      priceError = (error as Error).message;
    }

    const holdings: Array<Record<string, unknown>> = [
      holding("native", "TRX", 6, nativeRaw, nativePrice),
      ...tokens.map((token: EffectiveTokenEntry, index) => holding(
        token.kind,
        token.symbol,
        token.decimals,
        tokenBalances[index]!,
        token.kind === "trc20" ? tokenPrices.get(token.id) ?? null : null,
        { id: token.id, name: token.name, source: token.source },
      )),
    ];
    const values = holdings
      .map((item) => item.valueUsd)
      .filter((value): value is number => typeof value === "number");
    return {
      network: network.id,
      account: scope.activeAccount,
      address,
      priceSource: this.prices.source,
      ...(priceError ? { priceError } : {}),
      holdings,
      totalValueUsd: values.length ? round6(values.reduce((sum, value) => sum + value, 0)) : null,
    };
  }
}
