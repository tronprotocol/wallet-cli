// Router order does not rank output; amountOutRaw already accounts for fees.
import { ChainError } from "../errors/index.js";
import { compareDecimal } from "./decimal.js";

export interface RouteCandidate {
  // Base units.
  readonly amountOutRaw: string;
  // Human decimal fee; used only to break output ties.
  readonly fee: string;
  // One entry per token; hop count is length - 1.
  readonly path: readonly unknown[];
}

export function bestRoute<T extends RouteCandidate>(routes: readonly T[]): T {
  if (routes.length === 0) {
    throw new ChainError("no_matching_route", "the router found no route for this pair");
  }
  const ranked = routes
    .map((route, index) => ({ route, index }))
    .sort((left, right) => {
      const out = compareBigint(right.route.amountOutRaw, left.route.amountOutRaw);
      if (out !== 0) return out;
      const fee = compareDecimal(left.route.fee, right.route.fee);
      if (fee !== 0) return fee;
      const hops = left.route.path.length - right.route.path.length;
      if (hops !== 0) return hops;
      return left.index - right.index;
    });
  return ranked[0]!.route;
}

function compareBigint(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}
