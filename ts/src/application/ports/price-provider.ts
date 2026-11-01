import type { DispatchCheck } from "../contracts/deadline.js";

export interface PriceProvider {
  readonly source: string;
  nativeUsd(networkId: string, check: DispatchCheck): Promise<number | null>;
  tokenUsd(
    networkId: string,
    contracts: string[],
    check: DispatchCheck,
  ): Promise<Map<string, number | null>>;
}
