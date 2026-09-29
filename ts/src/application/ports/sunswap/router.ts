/**
 * RouterPort — candidate routes from the SunSwap route service.
 *
 * It returns the service's answer NORMALISED, not its wire shape: every amount in base units as a
 * decimal string, protocol names uppercased, and the parallel `tokens`/`symbols` arrays folded
 * into one path. The wire shape is the adapter's problem, and it has traps — the field called
 * `amountIn` is a HUMAN decimal, the base units live under `amountInRaw`, and there is no raw fee
 * at all. A port that leaked those names would spread the traps.
 */
import type { NetworkDescriptor } from "../../../domain/types/index.js";

/** One token in a route's path, with the scale its amounts are denominated in. */
export interface RouterHop {
  readonly address: string;
  readonly symbol: string;
}

/**
 * One candidate route.
 *
 * `fee` stays a HUMAN decimal because that is all the service sends — there is no raw field — and
 * turning it into base units needs the input token's decimals, which the service does not send
 * either. The use case does that conversion where it knows the token.
 */
export interface RouterRoute {
  readonly amountInRaw: string;
  readonly amountOutRaw: string;
  /** human decimal, in the INPUT token's units. */
  readonly fee: string;
  /** percentage as the service reports it; may be negative, which is a real answer. */
  readonly priceImpactPercent: string;
  readonly inUsd?: string;
  readonly outUsd?: string;
  readonly path: readonly RouterHop[];
  /** uppercase, one per POOL — so one fewer than `path`: `["V2","V3"]` for TRX → WTRX → USDT. */
  readonly protocols: readonly string[];
  /**
   * Fee tiers, as the service sends them.
   *
   * NOT one per pool: measured across 1-, 2- and 3-pool routes it carries one entry per token in
   * `path`, which is a trailing `0` past the last pool. Published unchanged rather than trimmed to
   * a shape the service does not use.
   */
  readonly poolFees: readonly string[];
  /**
   * The route passes through a hook contract nobody has verified.
   *
   * A fact about the route, not a decode failure: the route is still offered and the caller
   * decides, with the minimum bounding the exposure (PM 5.1.3).
   */
  readonly containsUnverifiedHook: boolean;
  /**
   * The service's own route object, carried verbatim and OPAQUE.
   *
   * Planning the swap needs the wire route, field for field, because the Universal Router calldata
   * is compiled from it — `poolKeys` and `stepAmountsOut` included, which the normalised shape above
   * has no use for. Carrying it is what lets the route be CHOSEN here, in tested code, and encoded
   * in the adapter: the alternative is asking the SDK to quote again, which could plan a different
   * route than the one we published.
   *
   * Nothing outside `adapters/outbound/sunswap` may read it.
   */
  readonly source: unknown;
}

export interface RouterPort {
  /**
   * Every candidate for a pair, unsorted and unfiltered.
   *
   * `amountInRaw` is BASE UNITS. The service's own parameter takes base units too, and passing a
   * human amount is not an error — it answers with a valid quote for a millionth of the trade.
   */
  routes(
    network: NetworkDescriptor,
    request: { fromToken: string; toToken: string; amountInRaw: string },
  ): Promise<readonly RouterRoute[]>;
}
