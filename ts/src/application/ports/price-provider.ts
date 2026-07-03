export interface PriceProvider {
  readonly source: string;
  nativeUsd(networkId: string): Promise<number | null>;
  tokenUsd(networkId: string, contracts: string[]): Promise<Map<string, number | null>>;
}

