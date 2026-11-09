import type { GovernanceTransactionInput } from "../../contracts/transaction-input.js";
export type { GovernanceTransactionInput } from "../../contracts/transaction-input.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import { receiptOf, transactionMode, type TxOutcomeView } from "../../services/transaction-mode.js";

export function governanceTransactionMode(
  pipeline: TxPipeline,
  scope: TransactionScope,
  input: GovernanceTransactionInput,
  options: { requireSoftware?: boolean } = {},
) {
  const mode = transactionMode(input);
  if (mode.mode === "sign-only" || mode.mode === "broadcast") {
    pipeline.assertCanSign(
      scope.activeAccount,
      "tron",
      options.requireSoftware ? { requireSoftware: true } : undefined,
    );
  }
  return mode;
}

export interface TronTransactionResource {
  netUsage?: number;
  netFeeSun?: number;
  energyUsage?: number;
  energyFeeSun?: number;
}

export function transactionResource(view: TxOutcomeView): TronTransactionResource | undefined {
  const data = receiptOf(view);
  const resource = {
    netUsage: data.netUsed,
    netFeeSun: data.netFeeSun,
    energyUsage: data.energyUsed,
    energyFeeSun: data.energyFeeSun,
  };
  return Object.values(resource).some((value) => value !== undefined) ? resource : undefined;
}
