import type { TxOutcome } from "../../domain/types/index.js";
import { UsageError } from "../../domain/errors/index.js";

export interface TransactionModeInput {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
  permissionId?: number;
  expiration?: number;
}

export type TransactionExecutionMode = "dry-run" | "build-only" | "sign-only" | "broadcast";

export interface ResolvedTransactionMode {
  mode: TransactionExecutionMode;
  dryRun: boolean;
  buildOnly: boolean;
  broadcast: boolean;
  permissionId: number;
  expiration?: number;
}

export function transactionMode(input: TransactionModeInput): ResolvedTransactionMode {
  const selected = [input.dryRun, input.signOnly, input.buildOnly].filter(Boolean).length;
  if (selected > 1) {
    throw new UsageError("invalid_option", "choose at most one of --dry-run, --sign-only, --build-only");
  }
  const permissionId = input.permissionId ?? 0;
  if (!Number.isInteger(permissionId) || permissionId < 0 || permissionId > 9) {
    throw new UsageError("invalid_option", "--permission-id must be an integer from 0 to 9");
  }
  if (input.expiration !== undefined) {
    if (!Number.isInteger(input.expiration) || input.expiration < 1 || input.expiration > 86_400_000) {
      throw new UsageError("invalid_option", "--expiration must be an integer from 1 to 86400000 milliseconds");
    }
    if (!input.signOnly && !input.buildOnly) {
      throw new UsageError("invalid_option", "--expiration is only valid with --sign-only or --build-only");
    }
  }
  const common = { permissionId, ...(input.expiration === undefined ? {} : { expiration: input.expiration }) };
  if (input.dryRun) return { mode: "dry-run", dryRun: true, buildOnly: false, broadcast: false, ...common };
  if (input.buildOnly) return { mode: "build-only", dryRun: false, buildOnly: true, broadcast: false, ...common };
  if (input.signOnly) return { mode: "sign-only", dryRun: false, buildOnly: false, broadcast: false, ...common };
  return { mode: "broadcast", dryRun: false, buildOnly: false, broadcast: true, ...common };
}

export function transactionRequiresSigner(input: TransactionModeInput): boolean {
  const mode = transactionMode(input).mode;
  return mode === "sign-only" || mode === "broadcast";
}

export function outcomeData(outcome: TxOutcome): Record<string, unknown> {
  if (outcome.stage === "plan") return { mode: "dry-run", fee: outcome.fee, tx: outcome.tx };
  if (outcome.stage === "built") {
    return { mode: "build-only", tx: outcome.tx, hex: outcome.hex, fee: outcome.fee };
  }
  if (outcome.stage === "signed") {
    // `fee` is absent when the caller supplied the transaction (tx sign): nothing was estimated.
    // Omit rather than emit undefined — kv() drops empty rows and JSON stays additive.
    return {
      mode: "sign-only",
      signed: outcome.signed,
      ...(outcome.fee === undefined ? {} : { fee: outcome.fee }),
      ...(outcome.address === undefined ? {} : { address: outcome.address }),
      ...(outcome.txId === undefined ? {} : { txId: outcome.txId }),
      ...(outcome.hex === undefined ? {} : { hex: outcome.hex }),
    };
  }
  return outcome as unknown as Record<string, unknown>;
}
