/**
 * PriceProvider — best-effort USD valuation for `account portfolio`. A thin,
 * separate service: it NEVER throws into the command path. Any network/parse failure resolves
 * to null prices so the balance read always succeeds; portfolio surfaces a priceError note.
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

/** build the provider from config (`price:`). Missing → CoinGecko default. */
export function createPriceProvider(price?: PriceConfig): PriceProvider {
  if (price?.provider === "none") return new NullPriceProvider();
  return new CoinGeckoPriceProvider(price?.baseUrl, price?.apiKey);
}
