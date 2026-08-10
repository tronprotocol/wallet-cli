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

/**
 * The hook `--build-only` and `--sign-only` need: complete transaction hex. Without it the pipeline
 * refuses build-only outright ("this chain adapter cannot produce transaction hex") and omits `hex`
 * from sign-only, which is the whole point of both flags.
 *
 * Only `artifact` — deliberately NOT the full `tronTransactionHooks`. This group binds
 * `--permission-id` inside each builder and applies `--expiration` via `withExtendedExpiration`
 * before the pipeline sees the transaction, so also supplying `prepare` would rebind Permission_id
 * and extend the expiration a SECOND time. Unifying on `prepare` is a separate refactor.
 */
export function governanceArtifact(gateway: TronGateway) {
  return { artifact: (transaction: UnsignedTx) => gateway.encodeTransactionHex(transaction) };
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
