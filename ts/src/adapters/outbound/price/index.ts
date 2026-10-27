import type { PriceConfig } from "../../../domain/types/index.js";
import type { PriceProvider } from "../../../application/ports/price-provider.js";
import { CoinGeckoPriceProvider } from "./coingecko.js";

export { CoinGeckoPriceProvider };

export type { PriceProvider } from "../../../application/ports/price-provider.js";

export class NullPriceProvider implements PriceProvider {
  readonly source = "none";
  async nativeUsd(_networkId: string): Promise<number | null> {
    return null;
  }
  async tokenUsd(_networkId: string, contracts: string[]): Promise<Map<string, number | null>> {
    return new Map(contracts.map((c) => [c, null]));
  }
}

// Declared testnets return zero; null means the price is unknown.
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

export function createPriceProvider(
  price?: PriceConfig,
  timeoutMs?: number,
  testnets: ReadonlySet<string> = new Set(),
): PriceProvider {
  // Disabled valuation must stay null, including on testnets.
  if (price?.provider === "none") return new NullPriceProvider();
  return new TestnetZeroPriceProvider(
    new CoinGeckoPriceProvider(price?.baseUrl, timeoutMs),
    testnets,
  );
}
