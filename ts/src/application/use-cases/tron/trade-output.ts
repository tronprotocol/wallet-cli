import type { NetworkDescriptor, TxOutcome } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import { warnOnPostCheck } from "../../services/post-check.js";

/** A failed post-read must not turn an already confirmed trade into an execution failure. */
export async function tradeOutput(
  scope: TransactionScope,
  network: NetworkDescriptor,
  gateways: ChainGatewayProvider,
  outcome: TxOutcome,
  token: string,
  recipient: string,
  key: "amountOut" | "tokensOut" | "trxOut",
): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = { amountsEstimated: true };
  if (outcome.stage !== "confirmed" || !("txId" in outcome) || typeof outcome.txId !== "string")
    return fields;
  await warnOnPostCheck(scope, "trade_output", async () => {
    const amount = await gateways
      .get(network, "tron")
      .receivedAmount(outcome.txId as string, token, recipient);
    if (amount === undefined)
      return "the trade confirmed but its received amount could not be verified from the receipt; amounts remain estimates";
    fields[key] = amount;
    fields.amountsEstimated = false;
    return undefined;
  });
  return fields;
}
