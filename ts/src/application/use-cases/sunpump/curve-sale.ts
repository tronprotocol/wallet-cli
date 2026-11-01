import { requestDispatchCheck, unlessDeadline } from "../../services/command-deadline.js";
import type { ExecutionDeadline } from "../../contracts/deadline.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type {
  LaunchpadPort,
  LaunchpadTokenFacts,
  SellQuote,
} from "../../ports/sunpump/launchpad.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { BaseUnits, Sun } from "../../../domain/amounts/index.js";

export interface CurveSaleQuote {
  // Seller proceeds, already net of the fee.
  readonly trxOutSun: Sun;
  // Paid by the curve on top of seller proceeds.
  readonly feeSun: Sun;
}

export async function quoteCurveSale(
  deadline: ExecutionDeadline,
  launchpad: LaunchpadPort,
  network: NetworkDescriptor,
  facts: LaunchpadTokenFacts,
  tokensIn: BaseUnits,
): Promise<CurveSaleQuote> {
  let quoted: SellQuote;
  try {
    quoted = await launchpad.quoteSell(
      network,
      facts.address,
      tokensIn,
      requestDispatchCheck(deadline),
    );
  } catch (error) {
    await refuseTooSmall(
      deadline,
      launchpad,
      network,
      facts,
      tokensIn,
      "the curve will not price it",
    );
    throw error;
  }
  if (BigInt(quoted.trxAmountSun) <= 0n) {
    const because = "it would pay the seller nothing";
    await refuseTooSmall(deadline, launchpad, network, facts, tokensIn, because);
    // Reject zero proceeds even when the minimum sale amount is unavailable.
    throw new UsageError("invalid_amount", `this sale is too small: ${because}`);
  }
  return { trxOutSun: quoted.trxAmountSun, feeSun: quoted.feeSun };
}

// Relabel the error only when the contract confirms the sale is below its minimum.
async function refuseTooSmall(
  deadline: ExecutionDeadline,
  launchpad: LaunchpadPort,
  network: NetworkDescriptor,
  facts: LaunchpadTokenFacts,
  tokensIn: string,
  because: string,
): Promise<void> {
  const minimum = await launchpad
    .minimumSellAmount(network, facts.address, requestDispatchCheck(deadline))
    .catch(unlessDeadline(deadline, () => undefined));
  if (minimum === undefined || BigInt(tokensIn) >= BigInt(minimum)) return;
  throw new UsageError(
    "invalid_amount",
    `this sale is too small: ${because}. Sell at least ${minimum} ${facts.symbol} in base units`,
  );
}
