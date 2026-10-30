import type { TransactionModeInput } from "../contracts/transaction-input.js";
export type { TransactionModeInput } from "../contracts/transaction-input.js";
import type {
  BroadcastStage,
  FeeReport,
  SignedTx,
  TxConfirmation,
  TxOutcome,
  UnsignedTx,
} from "../../domain/types/index.js";
import { errorMessage, inputRef, UsageError } from "../../domain/errors/index.js";
import {
  isPermissionId,
  MAX_PERMISSION_ID,
  OWNER_PERMISSION_ID,
} from "../../domain/tron/permission/index.js";
import { isTronExpirationMs, MAX_TRON_EXPIRATION_MS } from "../../domain/transaction/index.js";

export type TransactionExecutionMode = "dry-run" | "build-only" | "sign-only" | "broadcast";

export interface ResolvedTransactionMode {
  mode: TransactionExecutionMode;
  permissionId: number;
  expiration?: number;
}

export function transactionMode(input: TransactionModeInput): ResolvedTransactionMode {
  const selected = [input.dryRun, input.signOnly, input.buildOnly].filter(Boolean).length;
  if (selected > 1) {
    throw new UsageError(
      "invalid_option",
      errorMessage`choose at most one of ${inputRef("dryRun")}, ${inputRef("signOnly")}, ${inputRef("buildOnly")}`,
    );
  }
  const permissionId = input.permissionId ?? OWNER_PERMISSION_ID;
  if (!isPermissionId(permissionId)) {
    throw new UsageError(
      "invalid_option",
      errorMessage`${inputRef("permissionId")} must be an integer from ${OWNER_PERMISSION_ID} to ${MAX_PERMISSION_ID}`,
    );
  }
  if (input.expiration !== undefined) {
    if (!isTronExpirationMs(input.expiration)) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("expiration")} must be an integer from 1 to ${MAX_TRON_EXPIRATION_MS} milliseconds`,
      );
    }
    if (!input.signOnly && !input.buildOnly) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("expiration")} is only valid with ${inputRef("signOnly")} or ${inputRef("buildOnly")}`,
      );
    }
  }
  const mode: TransactionExecutionMode = input.dryRun
    ? "dry-run"
    : input.buildOnly
      ? "build-only"
      : input.signOnly
        ? "sign-only"
        : "broadcast";
  return {
    mode,
    permissionId,
    ...(input.expiration === undefined ? {} : { expiration: input.expiration }),
  };
}

export function transactionRequiresSigner(input: TransactionModeInput): boolean {
  const mode = transactionMode(input).mode;
  return mode === "sign-only" || mode === "broadcast";
}

// One view per transaction stage; broadcast stages pass through unchanged.
export type TxOutcomeView =
  | { mode: "dry-run"; fee: FeeReport; tx: UnsignedTx }
  | { mode: "build-only"; tx: UnsignedTx; hex: string; fee: FeeReport }
  | {
      mode: "sign-only";
      signed: SignedTx;
      fee?: FeeReport;
      address?: string;
      txId?: string;
      hex?: string;
    }
  | Extract<TxOutcome, { stage: BroadcastStage }>;

export function outcomeData(outcome: TxOutcome): TxOutcomeView {
  if (outcome.stage === "plan") return { mode: "dry-run", fee: outcome.fee, tx: outcome.tx };
  if (outcome.stage === "built") {
    return { mode: "build-only", tx: outcome.tx, hex: outcome.hex, fee: outcome.fee };
  }
  if (outcome.stage === "signed") {
    // Caller-supplied transactions may have no fee estimate.
    return {
      mode: "sign-only",
      signed: outcome.signed,
      ...(outcome.fee === undefined ? {} : { fee: outcome.fee }),
      ...(outcome.address === undefined ? {} : { address: outcome.address }),
      ...(outcome.txId === undefined ? {} : { txId: outcome.txId }),
      ...(outcome.hex === undefined ? {} : { hex: outcome.hex }),
    };
  }
  return outcome;
}

// Receipt facts exist only once the transaction was broadcast.
export function receiptOf(view: TxOutcomeView): Partial<TxConfirmation> {
  return "stage" in view ? view : {};
}
