import type {
  BroadcastResult,
  TronTransactionArtifact,
  TxConfirmation,
  TxOutcome,
} from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { TronGateway, TronTxInfo } from "../ports/chain/tron-gateway.js";
import { authoritativeTxId, localTxId } from "./broadcast-identity.js";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalize(info: TronTxInfo): TxConfirmation {
  const result: Omit<TxConfirmation, "failed"> = {
    confirmed: true,
    blockNumber: info.blockNumber,
  };
  if (info.feeSun !== undefined) result.feeSun = info.feeSun;
  if (info.energyUsed !== undefined) result.energyUsed = info.energyUsed;
  if (info.netUsed !== undefined) result.netUsed = info.netUsed;
  if (info.energyFeeSun !== undefined) result.energyFeeSun = info.energyFeeSun;
  if (info.netFeeSun !== undefined) result.netFeeSun = info.netFeeSun;
  if (info.withdrawnSun !== undefined) result.withdrawnSun = info.withdrawnSun;
  if (info.assetIssueId !== undefined) result.assetIssueID = info.assetIssueId;
  if (info.unfreezeAmount !== undefined) result.unfreezeAmount = info.unfreezeAmount;
  if (info.exchangeId !== undefined) result.exchangeId = info.exchangeId;
  if (info.exchangeReceived !== undefined) result.exchangeReceived = info.exchangeReceived;
  if (info.exchangeInjectedOther !== undefined) {
    result.exchangeInjectedOther = info.exchangeInjectedOther;
  }
  if (info.exchangeWithdrawnOther !== undefined) {
    result.exchangeWithdrawnOther = info.exchangeWithdrawnOther;
  }
  if (info.receiptResult !== undefined) result.result = info.receiptResult;
  return { ...result, failed: info.execution === "failed" };
}

// Only contract execution reports success in the receipt; native transactions never carry a result.
const CONTRACT_EXECUTION_TYPES = new Set(["TriggerSmartContract", "CreateSmartContract"]);

function requiresExecutionResult(transaction: TronTransactionArtifact): boolean {
  const type = (transaction as Partial<TronTransactionArtifact> | null)?.raw_data?.contract?.[0]
    ?.type;
  return type !== undefined && CONTRACT_EXECUTION_TYPES.has(type);
}

export function tronConfirmation(
  gateway: TronGateway,
  scope: TransactionScope,
): (txId: string, transaction: TronTransactionArtifact) => Promise<TxConfirmation | undefined> {
  return async (txId, transaction) => {
    const needsResult = requiresExecutionResult(transaction);
    const deadline = Date.now() + Math.max(0, scope.waitTimeoutMs);
    for (;;) {
      const info = await gateway.getTransactionInfoById(txId).catch(() => undefined);
      if (info?.blockNumber !== undefined && (!needsResult || info.execution !== "unknown")) {
        return normalize(info);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return undefined;
      await sleep(Math.min(1500, remaining));
    }
  };
}

export async function stageTronBroadcast(
  gateway: TronGateway,
  scope: TransactionScope,
  result: BroadcastResult,
  transaction: TronTransactionArtifact,
): Promise<TxOutcome> {
  const local = localTxId(transaction);
  const txId = authoritativeTxId(local, String(result.txId ?? result.hash ?? ""), (m) =>
    scope.warn(m),
  );
  if (!scope.wait || !txId) {
    if (scope.wait && !txId) {
      scope.warn(
        "--wait requested but the broadcast returned no txid; returning submitted (unconfirmed)",
      );
    }
    return { stage: "submitted", ...result, ...(txId ? { txId } : {}) };
  }
  const confirmed = await tronConfirmation(gateway, scope)(txId, transaction).catch(
    () => undefined,
  );
  if (!confirmed) {
    scope.warn(
      `--wait: ${txId} not confirmed within ${scope.waitTimeoutMs}ms; returning submitted (it may still confirm on-chain)`,
    );
    return { stage: "submitted", ...result, txId };
  }
  return { stage: confirmed.failed ? "failed" : "confirmed", ...result, txId, ...confirmed };
}
