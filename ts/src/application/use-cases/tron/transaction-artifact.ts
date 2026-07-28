import { ChainError } from "../../../domain/errors/index.js";
import type { TronTransactionArtifact } from "../../../domain/types/index.js";

export function transactionContract(transaction: TronTransactionArtifact) {
  const contracts = transaction.raw_data?.contract;
  if (!Array.isArray(contracts) || contracts.length !== 1) {
    throw new ChainError("invalid_transaction", "transaction must contain exactly one contract");
  }
  return contracts[0]!;
}

export function expirationOf(transaction: TronTransactionArtifact): number {
  const expiration = transaction.raw_data.expiration;
  if (!Number.isSafeInteger(expiration) || expiration! <= 0) {
    throw new ChainError("invalid_transaction", "transaction expiration is missing or imprecise");
  }
  return expiration!;
}

export function assertNotExpired(
  transaction: TronTransactionArtifact,
  now = Date.now(),
): void {
  const expiration = expirationOf(transaction);
  if (expiration <= now) {
    throw new ChainError("tx_expired", `transaction expired at ${new Date(expiration).toISOString()}`);
  }
}
