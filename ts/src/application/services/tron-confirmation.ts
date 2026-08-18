import type { TxOutcome } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { TronGateway, TronTxInfo } from "../ports/chain/tron-gateway.js";
import { authoritativeTxId } from "./broadcast-identity.js";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function normalize(info: TronTxInfo): Record<string, unknown> {
  const receipt = info.receipt ?? {};
  const result: Record<string, unknown> = {
    confirmed: true,
    blockNumber: info.blockNumber,
  };
  if (info.fee !== undefined) result.feeSun = info.fee;
  if (receipt.energy_usage_total !== undefined) result.energyUsed = receipt.energy_usage_total;
  if (receipt.net_usage !== undefined) result.netUsed = receipt.net_usage;
  if (receipt.energy_fee !== undefined) result.energyFeeSun = receipt.energy_fee;
  if (receipt.net_fee !== undefined) result.netFeeSun = receipt.net_fee;
  if (info.withdraw_amount !== undefined) result.withdrawnSun = info.withdraw_amount;
  // Chain-assigned identities and realised amounts exist only in the receipt, so they are absent
  // whenever a command returns `submitted` — see docs/asset-exchange-spec-deviations-v4.12.0.md.
  // (TRON's HTTP mapping camel-cases this one field and leaves the rest snake_case.)
  if (info.assetIssueID !== undefined) result.assetIssueID = info.assetIssueID;
  if (info.unfreeze_amount !== undefined) result.unfreezeAmount = info.unfreeze_amount;
  if (info.exchange_id !== undefined) result.exchangeId = info.exchange_id;
  if (info.exchange_received_amount !== undefined)
    result.exchangeReceived = info.exchange_received_amount;
  if (info.exchange_inject_another_amount !== undefined) {
    result.exchangeInjectedOther = info.exchange_inject_another_amount;
  }
  if (info.exchange_withdraw_another_amount !== undefined) {
    result.exchangeWithdrawnOther = info.exchange_withdraw_another_amount;
  }
  if (receipt.result !== undefined) result.result = receipt.result;
  result.failed =
    receipt.result !== undefined && receipt.result !== "SUCCESS" && receipt.result !== "DEFAULT";
  return result;
}

export function tronConfirmation(
  gateway: TronGateway,
  scope: TransactionScope,
): (txId: string) => Promise<Record<string, unknown> | undefined> {
  return async (txId) => {
    const deadline = Date.now() + Math.max(0, scope.waitTimeoutMs);
    for (;;) {
      const info = await gateway.getTransactionInfoById(txId).catch(() => undefined);
      if (info?.blockNumber !== undefined) return normalize(info);
      const remaining = deadline - Date.now();
      if (remaining <= 0) return undefined;
      await sleep(Math.min(1500, remaining));
    }
  };
}

export async function stageTronBroadcast(
  gateway: TronGateway,
  scope: TransactionScope,
  result: Record<string, unknown>,
  local?: string,
): Promise<TxOutcome> {
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
  const confirmed = await tronConfirmation(gateway, scope)(txId).catch(() => undefined);
  if (!confirmed) {
    scope.warn(
      `--wait: ${txId} not confirmed within ${scope.waitTimeoutMs}ms; returning submitted (it may still confirm on-chain)`,
    );
    return { stage: "submitted", ...result, txId };
  }
  return { stage: confirmed.failed ? "failed" : "confirmed", ...result, txId, ...confirmed };
}
