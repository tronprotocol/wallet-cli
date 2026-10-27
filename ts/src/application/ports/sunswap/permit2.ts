import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface Permit2Plan {
  // Approve the token to Permit2, not directly to the spender.
  readonly permit2: string;
  readonly spender: string;
  // EIP-712 payload; domain guards inspect it before signing.
  readonly typedData: unknown;
  // Opaque permit struct; return unchanged with its signature to the call builder.
  readonly grant: unknown;
  // Exact spend in token base units.
  readonly amount: string;
  // Unix seconds.
  readonly expiration: string;
  // Callers require typed-data mode.
  readonly mode: string;
}

export interface Permit2Port {
  // Plan an exact grant; undefined means the existing grant already covers the amount.
  planPermit(
    network: NetworkDescriptor,
    input: {
      readonly owner: string;
      readonly token: string;
      readonly spender: string;
      readonly amount: string;
      readonly ttlSeconds: number;
    },
  ): Promise<Permit2Plan | undefined>;
}
