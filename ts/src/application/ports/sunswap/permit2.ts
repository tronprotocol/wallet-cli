import type { NetworkDescriptor, TypedDataPayload } from "../../../domain/types/index.js";
import type { BaseUnits } from "../../../domain/amounts/index.js";

declare const permit2Grant: unique symbol;

// SDK PermitSingle struct; only the router adapter reads it.
export interface Permit2Grant {
  readonly [permit2Grant]: true;
}

export interface Permit2Plan {
  // Approve the token to Permit2, not directly to the spender.
  readonly permit2: string;
  readonly spender: string;
  // EIP-712 payload; domain guards inspect it before signing.
  readonly typedData: TypedDataPayload;
  // Return unchanged with its signature to the call builder.
  readonly grant: Permit2Grant;
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
      readonly amount: BaseUnits;
      readonly ttlSeconds: number;
    },
  ): Promise<Permit2Plan | undefined>;
}
