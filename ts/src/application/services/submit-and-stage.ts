import type {
  BroadcastResult,
  BroadcastStage,
  TxConfirmation,
  TxOutcome,
} from "../../domain/types/index.js";
import { errorMessage } from "../../domain/errors/index.js";
import type { DispatchCheck } from "../contracts/deadline.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import { authoritativeTxId, submitWithTxId } from "./broadcast-identity.js";
import { assertSubmitAdmitted, submitDispatchCheck } from "./command-deadline.js";
import { waitsForConfirmation } from "./transaction-mode.js";

export type BroadcastOutcome = Extract<TxOutcome, { stage: BroadcastStage }>;

// Submits a signed transaction and applies the wait policy. `local` is the id derived from the signed
// transaction; once submitted, a confirmation failure still returns the submitted outcome.
export async function submitAndStage(
  scope: Pick<TransactionScope, "deadline" | "wait" | "warn">,
  local: string | undefined,
  submit: (check: DispatchCheck) => Promise<BroadcastResult>,
  confirm: (txId: string) => Promise<TxConfirmation | undefined>,
): Promise<BroadcastOutcome> {
  assertSubmitAdmitted(scope.deadline);
  const result = await submitWithTxId(local, () => submit(submitDispatchCheck(scope.deadline)));
  const txId = authoritativeTxId(local, result.txId ?? result.hash, (m) => scope.warn(m));
  const wait = waitsForConfirmation(scope.wait, true);
  if (!wait || !txId) {
    if (wait && !txId) {
      scope.warn("the broadcast returned no txid; returning submitted (unconfirmed)");
    }
    return { stage: "submitted", ...result, ...(txId ? { txId } : {}) };
  }
  const confirmed = await confirm(txId).catch(() => undefined);
  if (!confirmed) {
    scope.warn(
      errorMessage`${txId} not confirmed before the command's time limit; returning submitted (it may still confirm on-chain)`,
    );
    return { stage: "submitted", ...result, txId };
  }
  return { stage: confirmed.failed ? "failed" : "confirmed", ...result, txId, ...confirmed };
}
