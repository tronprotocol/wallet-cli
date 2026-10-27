// Raw input/output amounts are base units; protocol names are uppercase.
import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface RouterHop {
  readonly address: string;
  readonly symbol: string;
}

export interface RouterRoute {
  readonly amountInRaw: string;
  readonly amountOutRaw: string;
  // Whole input-token units, decimal.
  readonly fee: string;
  // Percentage; may be negative.
  readonly priceImpactPercent: string;
  readonly inUsd?: string;
  readonly outUsd?: string;
  readonly path: readonly RouterHop[];
  // One uppercase entry per pool: path.length - 1.
  readonly protocols: readonly string[];
  // One entry per path token, including a trailing zero after the last pool.
  readonly poolFees: readonly string[];
  readonly containsUnverifiedHook: boolean;
  // Opaque wire route, returned unchanged to the encoder so execution uses the quoted route.
  readonly source: unknown;
}

export interface RouterPort {
  // Unsorted, unfiltered candidates; amountInRaw must be base units.
  routes(
    network: NetworkDescriptor,
    request: { fromToken: string; toToken: string; amountInRaw: string },
  ): Promise<readonly RouterRoute[]>;
}
