/**
 * A curve sale's quote, shared by `sunpump sell` and the curve branch of `sunswap swap`.
 *
 * The contract's `getTrxAmountBySaleWithFee` answers `(trxAmount, fee)`, and `trxAmount` is
 * ALREADY what the seller receives: the fee is paid to the fee address separately, on top. A
 * Nile sale quoted at `(22728, 10000)` paid the seller 22728 SUN and the fee address 10000 SUN.
 * Subtracting the fee again understates every sale by the fee and loosens the floor derived from
 * it.
 *
 * Both commands sell on the same curve, so both refuse a too-small sale in the same words.
 */
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../../ports/sunpump/launchpad.js";
import { UsageError } from "../../../../domain/errors/index.js";

export interface CurveSaleQuote {
  /** SUN the seller receives — the contract's `trxAmount`, already net of the fee. */
  readonly trxOutSun: string;
  /** SUN of platform fee, paid by the curve on top of `trxOutSun`. */
  readonly feeSun: string;
}

/**
 * The quote, or a refusal a caller can act on.
 *
 * A sale is too small in two ways: the curve reverts rather than price it, or it prices it at
 * nothing for the seller. Either way the answer is the same — sell at least the smallest amount
 * that pays the seller one SUN.
 */
export async function quoteCurveSale(
  launchpad: LaunchpadPort,
  network: NetworkDescriptor,
  facts: LaunchpadTokenFacts,
  tokensIn: string,
): Promise<CurveSaleQuote> {
  let quoted: { trxAmountSun: string; feeSun: string };
  try {
    quoted = await launchpad.quoteSell(network, facts.address, tokensIn);
  } catch (error) {
    await refuseTooSmall(launchpad, network, facts, tokensIn, "the curve will not price it");
    throw error;
  }
  if (BigInt(quoted.trxAmountSun) <= 0n) {
    const because = "it would pay the seller nothing";
    await refuseTooSmall(launchpad, network, facts, tokensIn, because);
    // Zero proceeds are refused whether or not the threshold could be read: a sale that pays
    // nothing is never what the caller meant.
    throw new UsageError("invalid_amount", `this sale is too small: ${because}`);
  }
  return { trxOutSun: quoted.trxAmountSun, feeSun: quoted.feeSun };
}

/**
 * The threshold, ending in the one thing a caller can act on.
 *
 * It is READ, not assumed — the contract's own inverse quote for one SUN of proceeds — so it
 * stays true if SunPump changes the fee. And it is CHECKED before it is claimed: an amount that
 * turns out not to be below the threshold means the failure was something else, so the original
 * error is left to speak for itself rather than being relabelled.
 */
async function refuseTooSmall(
  launchpad: LaunchpadPort,
  network: NetworkDescriptor,
  facts: LaunchpadTokenFacts,
  tokensIn: string,
  because: string,
): Promise<void> {
  const minimum = await launchpad.minimumSellAmount(network, facts.address).catch(() => undefined);
  if (minimum === undefined || BigInt(tokensIn) >= BigInt(minimum)) return;
  throw new UsageError(
    "invalid_amount",
    `this sale is too small: ${because}. Sell at least ${minimum} ${facts.symbol} in base units`,
  );
}
