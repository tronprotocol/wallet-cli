import type { TxOutcome } from "../../domain/types/index.js";
import { UsageError } from "../../domain/errors/index.js";

export interface TransactionModeInput {
  dryRun?: boolean;
  signOnly?: boolean;
  buildOnly?: boolean;
}

export function transactionMode(input: TransactionModeInput): {
  dryRun: boolean;
  buildOnly?: boolean;
  broadcast: boolean;
} {
  const selected = [input.dryRun, input.signOnly, input.buildOnly].filter(Boolean).length;
  if (selected > 1) {
    throw new UsageError("invalid_option", "choose at most one of --dry-run, --sign-only, --build-only");
  }
  if (input.dryRun) return { dryRun: true, broadcast: false };
  if (input.signOnly) return { dryRun: false, broadcast: false };
  if (input.buildOnly) return { dryRun: false, buildOnly: true, broadcast: false };
  return { dryRun: false, broadcast: true };
}

export function outcomeData(outcome: TxOutcome): Record<string, unknown> {
  if (outcome.stage === "plan") return { mode: "dry-run", fee: outcome.fee, tx: outcome.tx };
  if (outcome.stage === "built") {
    const rawDataHex = (outcome.tx as { raw_data_hex?: unknown } | null)?.raw_data_hex;
    return {
      mode: "build-only",
      unsigned: outcome.tx,
      ...(typeof rawDataHex === "string" ? { unsignedHex: rawDataHex } : {}),
    };
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
    };
  }
  return outcome as unknown as Record<string, unknown>;
}
