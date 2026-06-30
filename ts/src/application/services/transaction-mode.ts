import type { TxOutcome } from "../../domain/types/index.js";
import { UsageError } from "../../domain/errors/index.js";

export interface TransactionModeInput {
  dryRun?: boolean;
  signOnly?: boolean;
}

export function transactionMode(input: TransactionModeInput): {
  dryRun: boolean;
  broadcast: boolean;
} {
  if (input.dryRun && input.signOnly) {
    throw new UsageError("invalid_option", "choose at most one of --dry-run, --sign-only");
  }
  if (input.dryRun) return { dryRun: true, broadcast: false };
  if (input.signOnly) return { dryRun: false, broadcast: false };
  return { dryRun: false, broadcast: true };
}

export function outcomeData(outcome: TxOutcome): Record<string, unknown> {
  if (outcome.stage === "plan") return { mode: "dry-run", fee: outcome.fee, tx: outcome.tx };
  if (outcome.stage === "signed") {
    return { mode: "sign-only", signed: outcome.signed, fee: outcome.fee };
  }
  return outcome as unknown as Record<string, unknown>;
}

