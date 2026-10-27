import type { EffectiveTokenEntry, NetworkDescriptor } from "../../../domain/types/index.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { PriceProvider } from "../../ports/price-provider.js";
import { holding, portfolioTotal, unavailableHolding } from "../portfolio-holdings.js";
import { FAMILIES } from "../../../domain/family/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

export class EvmAccountService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
    private readonly prices: PriceProvider,
  ) {}

  async portfolio(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("evm");
    const gateway = this.gateways.get(network, "evm");
    const tokens = this.tokens.effective(network.id, scope.activeAccount);
    const [nativeRaw, balances] = await Promise.all([
      gateway.getNativeBalance(address),
      Promise.all(
        tokens.map((token) =>
          gateway
            .getErc20Balance(token.id, address)
            .then((raw) => ({ raw }) as const)
            // Raw errors may expose endpoint credentials; report only a stable reason.
            .catch(() => ({ unavailable: true }) as const),
        ),
      ),
    ]);

    let priceUnavailable = false;
    let nativePrice: number | null = null;
    let tokenPrices = new Map<string, number | null>();
    try {
      [nativePrice, tokenPrices] = await Promise.all([
        this.prices.nativeUsd(network.id),
        this.prices.tokenUsd(
          network.id,
          tokens.map((token) => token.id),
        ),
      ]);
    } catch {
      priceUnavailable = true;
    }

    const holdings: Array<Record<string, unknown>> = [
      holding("native", network.nativeSymbol, FAMILIES.evm.nativeDecimals, nativeRaw, nativePrice),
      ...tokens.map((token: EffectiveTokenEntry, index) => {
        const result = balances[index]!;
        const extra = { id: token.id, name: token.name, source: token.source };
        return "unavailable" in result
          ? unavailableHolding(token.kind, token.symbol, token.decimals, extra)
          : holding(
              token.kind,
              token.symbol,
              token.decimals,
              result.raw,
              tokenPrices.get(token.id) ?? null,
              extra,
            );
      }),
    ];

    return {
      network: network.id,
      account: scope.activeAccount,
      address,
      priceSource: this.prices.source,
      ...(priceUnavailable ? { priceUnavailable: true, priceReason: "price_provider_error" } : {}),
      holdings,
      totalValueUsd: portfolioTotal(holdings),
    };
  }

  async info(scope: AccountScope, network: NetworkDescriptor) {
    const address = scope.resolveAddress("evm");
    const gateway = this.gateways.get(network, "evm");
    const [balance, nonce, code] = await Promise.all([
      gateway.getNativeBalance(address),
      gateway.getTransactionCount(address),
      gateway.getCode(address),
    ]);
    const isContract = code !== "0x" && code !== "";
    return {
      address,
      balance,
      nonce: Number(nonce),
      decimals: FAMILIES.evm.nativeDecimals,
      symbol: network.nativeSymbol,
      type: isContract ? "contract" : "eoa",
      // Code size is bytes: 0x-prefixed hex has two characters per byte.
      ...(isContract ? { codeSize: (code.length - 2) / 2 } : {}),
    };
  }
}
