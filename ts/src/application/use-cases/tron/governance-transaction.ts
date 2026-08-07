import type { UnsignedTx } from "../../../domain/types/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";
import {
  transactionMode,
  type TransactionModeInput,
} from "../../services/transaction-mode.js";

export interface GovernanceTransactionInput extends TransactionModeInput {
  expiration?: number;
  permissionId?: number;
}

export function governanceTransactionMode(
  pipeline: TxPipeline,
  scope: TransactionScope,
  input: GovernanceTransactionInput,
  options: { requireSoftware?: boolean } = {},
) {
  const mode = transactionMode(input);
  if (input.expiration !== undefined && !input.signOnly && !input.buildOnly) {
    throw new UsageError("invalid_option", "--expiration is only valid with --sign-only or --build-only");
  }
  if (!input.dryRun && !input.buildOnly) {
    pipeline.assertCanSign(scope.activeAccount, "tron", options.requireSoftware ? { requireSoftware: true } : undefined);
  }
  return mode;
}

export async function withExtendedExpiration(
  gateway: TronGateway,
  transaction: UnsignedTx,
  extensionMs: number | undefined,
): Promise<UnsignedTx> {
  return extensionMs === undefined
    ? transaction
    : await gateway.extendTransactionExpiration(transaction, extensionMs);
}

/** Canonical nested resource view required by governance JSON receipts. */
export function transactionResource(data: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
  const resource = {
    netUsage: data.netUsed,
    netFeeSun: data.netFeeSun,
    energyUsage: data.energyUsed,
    energyFeeSun: data.energyFeeSun,
  };
  return Object.values(resource).some((value) => value !== undefined) ? resource : undefined;
}
