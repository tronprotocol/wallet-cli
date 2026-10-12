/**
 * RouterExecutionPort — planning a Universal Router swap, without signing or sending one.
 *
 * The split from `RouterPort` is deliberate. That port prices: it asks the route service what is on
 * offer and normalises the answer. This one takes the route that was CHOSEN and turns it into the
 * two things a swap needs — a bounded Permit2 authorization, and the encoded router call that
 * carries it. Neither is signed here and neither is broadcast here; both go through `TxPipeline`,
 * which is where dry-run, permissions, confirmation and the receipt shape are guaranteed.
 *
 * Two values travel through the application as OPAQUE handles, and nothing outside
 * `adapters/outbound/sunswap` may look inside them:
 *
 * - `RouterRoute.source`, the route service's own object, because the calldata is compiled from it
 *   field for field.
 * - `Permit2Plan.grant`, the permit struct, from `Permit2Port` — because the signature must cover
 *   exactly the struct the calldata embeds. Handing it back is what makes the grant ours: a planner
 *   asked to produce the swap and the permit together grants MAX_UINT160 for thirty days and offers no
 *   way to bound either, which is measured and is why the two steps are separate.
 *
 * The permit half of this port MOVED OUT to `Permit2Port` when V4 liquidity needed the same planning
 * with a different spender. What is left here is genuinely router-specific: its address, the clock its
 * deadline is measured against, and the calldata.
 */
import type { ContractParameter } from "../../contracts/tron-contract-call.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";

/**
 * The router call as the encoder produced it.
 *
 * Kept in the encoder's own terms rather than converted, because the domain guard's job is to check
 * what was BUILT. `callValue` and `feeLimit` are SUN.
 */
export interface RouterSwapCall {
  readonly target: string;
  readonly functionSelector: string;
  readonly parameters: readonly ContractParameter[];
  readonly callValue: string;
  readonly feeLimit: string;
}

export interface RouterExecutionPort {
  /** The Universal Router on this network, from the chain's own configuration. */
  routerAddress(network: NetworkDescriptor): string;

  /**
   * The clock the encoded deadline is measured against, in unix seconds.
   *
   * Not our own clock. A swap's deadline is enforced against BLOCK time, so it is anchored to the
   * chain's notion of now — and the same value is used by the encoder, because the caller checking
   * the deadline and the encoder setting it must read one number. Asking two sources produced a
   * twelve-second disagreement and refused a correct call; memoised, they agree exactly.
   */
  transactionTime(network: NetworkDescriptor): Promise<number>;

  /**
   * The encoded `execute(bytes,bytes[],uint256)` call for a chosen route.
   *
   * `minimumOut` is not passed: the floor is derived from `slippageBips` while the calldata is
   * built, and the route service's own `amountOutMinimum` field is equal to `amountOut` even when
   * slippage was requested. The caller computes the floor it expects and checks the result.
   */
  buildSwapCall(
    network: NetworkDescriptor,
    input: {
      /** `RouterRoute.source`, verbatim. */
      readonly route: unknown;
      readonly slippageBips: number;
      readonly recipient: string;
      readonly validForSeconds: number;
      readonly feeLimitSun: string;
      /** Absent when the input is native TRX, which needs no permit. */
      readonly permit?: { readonly grant: unknown; readonly signature: string };
    },
  ): Promise<RouterSwapCall>;
}
