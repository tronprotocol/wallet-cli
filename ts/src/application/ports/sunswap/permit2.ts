/**
 * Permit2Port — a bounded, time-boxed Permit2 authorization, planned and not signed.
 *
 * It started life inside the router's port and moved out when V4 liquidity needed the same thing.
 * The two differ only in WHO may pull: the Universal Router for a swap, the V4 position manager for a
 * deposit. Everything else — the exact amount, the one-hour expiry, the typed data, the struct the
 * signature has to cover — is identical, and a second implementation would be a second set of rules
 * to keep agreeing with the first.
 *
 * Measured on Nile: the same planner, handed the position manager as `spender`, produces grants of
 * exactly the amounts a deposit needs, bound to that contract and not to the router.
 *
 * `grant` is OPAQUE. It is the permit struct, carried back with the signature to whatever builds the
 * call, because the signature must cover exactly the struct the calldata embeds. Nothing outside
 * `adapters/outbound/sunswap` may look inside it.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";

export interface Permit2Plan {
  /** The Permit2 contract; the token is approved to this, never to the spender directly. */
  readonly permit2: string;
  /** Who the grant allows to pull — a router, or a position manager. */
  readonly spender: string;
  /** The EIP-712 payload. Opaque here; the domain guard is what reads it. */
  readonly typedData: unknown;
  /** The permit struct, carried back with the signature. Opaque. */
  readonly grant: unknown;
  /** What the grant allows, base units — exactly the amount being spent. */
  readonly amount: string;
  /** When it lapses, unix seconds. */
  readonly expiration: string;
  /** How the planner intends to authorize. Anything but `typed-data` is refused by the caller. */
  readonly mode: string;
}

export interface Permit2Port {
  /**
   * An exact Permit2 authorization for `amount` of `token`, lapsing in `ttlSeconds`.
   *
   * Returns `undefined` when the existing grant already covers the amount: measured on Nile, a repeat
   * depositor whose grant is still live needs no permit at all and the deposit goes out as a bare
   * call. Signing one anyway would spend a signature to change nothing.
   */
  planPermit(
    network: NetworkDescriptor,
    input: {
      readonly owner: string;
      readonly token: string;
      /** The contract allowed to pull. Not defaulted: a grant to the wrong one is the whole risk. */
      readonly spender: string;
      readonly amount: string;
      readonly ttlSeconds: number;
    },
  ): Promise<Permit2Plan | undefined>;
}
