import type { EffectiveTokenEntry, NetworkDescriptor } from "../../../domain/types/index.js";
import type { TokenRepository } from "../../ports/token-repository.js";
import type { PriceProvider } from "../../ports/price-provider.js";
import { holding, portfolioTotal, unavailableHolding } from "../portfolio-holdings.js";
import { FAMILIES } from "../../../domain/family/index.js";
import type { AccountScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";

/**
 * EVM account reads.
 *
 * `info` deliberately does not mirror TRON's shape. TRON returns the node's `getAccount` object
 * plus derived bandwidth/energy; an EVM node exposes no such call and no such object, so there
 * is nothing to pass through. What an EVM account actually has is a balance, a nonce, and either
 * code or no code — and those are what a user asks `account info` for.
 */
export class EvmAccountService {
  constructor(
    private readonly gateways: ChainGatewayProvider,
    private readonly tokens: TokenRepository,
    private readonly prices: PriceProvider,
  ) {}

  /**
   * Every holding, valued.
   *
   * Balances are read PER TOKEN and in parallel, each degrading on its own: a delisted contract,
   * a reverting `balanceOf` or an RPC hiccup costs that one row, not the listing. Deliberately
   * not a multicall — that would add a contract dependency and a per-chain address to verify, to
   * save a few round trips.
   *
   * The row shape comes from the shared helpers, so this listing and TRON's report the same
   * fields for the same thing.
   */
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
            // Swallow the underlying error rather than surfacing it: it can carry the endpoint
            // (and any key in it) into a success payload. A stable reason goes on the row instead.
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
    // "0x" is the empty-code answer, i.e. an externally-owned account. `type` rather than a
    // boolean (§4.3): it is the field agents match on, and it has room for a third kind of
    // account without every reader having to relearn the meaning of a flag.
    const isContract = code !== "0x" && code !== "";
    return {
      address,
      balance,
      // A number, matching `tx info`'s own `nonce` (§4.3): one field name must not arrive as two
      // types across two commands. Safe as a number — a nonce counts an account's transactions,
      // so it cannot approach 2^53 the way a wei balance does.
      nonce: Number(nonce),
      decimals: FAMILIES.evm.nativeDecimals,
      symbol: network.nativeSymbol,
      type: isContract ? "contract" : "eoa",
      // Bytes of deployed code, and only for an account that has some: an EOA reporting 0 would
      // be answering a question that does not apply to it. Hex is "0x" + two chars per byte.
      ...(isContract ? { codeSize: (code.length - 2) / 2 } : {}),
    };
  }
}
