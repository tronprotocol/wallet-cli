import type { TxOutcome } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { TronGateway, TronTxInfo } from "../ports/chain/tron-gateway.js";

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
  if (info.withdraw_amount !== undefined) result.withdrawnSun = info.withdraw_amount;
  if (receipt.result !== undefined) result.result = receipt.result;
  result.failed = receipt.result !== undefined &&
    receipt.result !== "SUCCESS" &&
    receipt.result !== "DEFAULT";
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
): Promise<TxOutcome> {
  const txId = String(result.txId ?? result.hash ?? "");
  if (!scope.wait || !txId) return { stage: "submitted", ...result };
  const confirmed = await tronConfirmation(gateway, scope)(txId).catch(() => undefined);
  if (!confirmed) return { stage: "submitted", ...result };
  return { stage: confirmed.failed ? "failed" : "confirmed", ...result, ...confirmed };
}

