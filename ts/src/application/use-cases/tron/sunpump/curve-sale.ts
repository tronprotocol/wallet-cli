import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { LaunchpadPort, LaunchpadTokenFacts } from "../../../ports/sunpump/launchpad.js";
import { UsageError } from "../../../../domain/errors/index.js";

export interface CurveSaleQuote {
  // Seller proceeds in SUN, already net of the fee.
  readonly trxOutSun: string;
  // Fee in SUN, paid by the curve on top of seller proceeds.
  readonly feeSun: string;
}

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
    // Reject zero proceeds even when the minimum sale amount is unavailable.
    throw new UsageError("invalid_amount", `this sale is too small: ${because}`);
  }
  return { trxOutSun: quoted.trxAmountSun, feeSun: quoted.feeSun };
}

// Relabel the error only when the contract confirms the sale is below its minimum.
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
