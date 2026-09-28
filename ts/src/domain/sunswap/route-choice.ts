/**
 * Choosing between candidate routes.
 *
 * The router returns several and does NOT sort them by what you receive. Measured on mainnet for
 * 100 TRX to USDT: the first candidate had the LOWEST fee and the WORST output, while the second
 * paid more and charged more. Taking the first — which "the default shows the best" invites —
 * would hand every caller a worse fill than was on offer, silently and forever, because the
 * number returned is a real number from a real route.
 *
 * So best means: the most received. The fee is already inside that figure, which is exactly why a
 * lower fee on a worse route is irrelevant.
 */
import { ChainError } from "../errors/index.js";

/** Only what choosing needs. The adapter's full route carries more. */
export interface RouteCandidate {
  /** base units out — the figure the choice is made on. */
  readonly amountOutRaw: string;
  /** the router's fee, human decimal as it sends it; used only to break a tie. */
  readonly fee: string;
  /** one entry per token in the path, so hop count is length - 1. */
  readonly path: readonly unknown[];
}

/**
 * The best candidate, by a fully ordered rule.
 *
 * Every step exists because the one before it can tie, and the last step is the router's own
 * order — so the answer is stable for the same response rather than "whichever came first" by
 * accident. A test needs a stable answer, and so does a caller comparing two runs.
 *
 * 1. most received
 * 2. then the lowest fee
 * 3. then the fewest hops, because each hop is a contract that can fail
 * 4. then the order the router returned
 */
export function bestRoute<T extends RouteCandidate>(routes: readonly T[]): T {
  if (routes.length === 0) {
    // Exit 1, not 2: the caller asked a well-formed question and the market had no answer
    // (PM 5.1.2 lists it among the execution failures).
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

/** Amounts are base units past what a double holds, so they are compared as integers. */
function compareBigint(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * A human decimal fee, compared without floats.
 *
 * Only a tie-break, but a float here would make the ORDER depend on binary rounding — and an
 * unstable order is the thing this function exists to prevent.
 */
function compareDecimal(left: string, right: string): number {
  const [leftWhole = "0", leftFraction = ""] = left.trim().split(".");
  const [rightWhole = "0", rightFraction = ""] = right.trim().split(".");
  const width = Math.max(leftFraction.length, rightFraction.length);
  const scaled = (whole: string, fraction: string) =>
    BigInt(`${whole || "0"}${fraction.padEnd(width, "0") || "0"}`);
  return compareBigint(
    scaled(leftWhole, leftFraction).toString(),
    scaled(rightWhole, rightFraction).toString(),
  );
}
