/**
 * PriceProvider — best-effort USD valuation for `account portfolio`. A thin,
 * separate service: it NEVER throws into the command path. Any network/parse failure resolves
 * to null prices so the balance read always succeeds; portfolio surfaces a priceUnavailable note.
 */
import type { PriceConfig } from "../../../domain/types/index.js";
import type { PriceProvider } from "../../../application/ports/price-provider.js";
import { CoinGeckoPriceProvider } from "./coingecko.js";

export { CoinGeckoPriceProvider };

export type { PriceProvider } from "../../../application/ports/price-provider.js";

/** disabled provider (`price.provider: none`) — every price is null, no network calls. */
export class NullPriceProvider implements PriceProvider {
  readonly source = "none";
  async nativeUsd(_networkId: string): Promise<number | null> {
    return null;
  }
  async tokenUsd(_networkId: string, contracts: string[]): Promise<Map<string, number | null>> {
    return new Map(contracts.map((c) => [c, null]));
  }
}

/**
 * A test network's coin is not traded, so its holdings are worth nothing — and that is a fact to
 * state, not one to look up.
 *
 * Zero, not null: `null` means "we could not find out", and on a testnet we did not fail to find
 * out — there is nothing to find. The previous behaviour priced testnet coins off their mainnet
 * ticker, which valued Sepolia ETH at thousands of dollars; a valuation is a claim about money,
 * and that one was false.
 *
 * It also spares every testnet `portfolio` a round trip to the price API.
 */
class TestnetZeroPriceProvider implements PriceProvider {
  constructor(
    private readonly inner: PriceProvider,
    private readonly testnets: ReadonlySet<string>,
  ) {}
  get source(): string {
    return this.inner.source;
  }
  async nativeUsd(networkId: string): Promise<number | null> {
    return this.testnets.has(networkId) ? 0 : this.inner.nativeUsd(networkId);
  }
  async tokenUsd(networkId: string, contracts: string[]): Promise<Map<string, number | null>> {
    return this.testnets.has(networkId)
      ? new Map(contracts.map((contract) => [contract, 0]))
      : this.inner.tokenUsd(networkId, contracts);
  }
}

/** build the provider from config (`price:`). Missing → CoinGecko default. */
export function createPriceProvider(
  price?: PriceConfig,
  timeoutMs?: number,
  testnets: ReadonlySet<string> = new Set(),
): PriceProvider {
  // `provider: none` is the user switching valuation off entirely; nothing to layer on top.
  if (price?.provider === "none") return new NullPriceProvider();
  return new TestnetZeroPriceProvider(
    new CoinGeckoPriceProvider(price?.baseUrl, timeoutMs),
    testnets,
  );
}
