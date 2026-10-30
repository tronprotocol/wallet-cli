import type { TxConfirmation } from "../../../domain/types/index.js";
import type { EvmGateway } from "../../ports/chain/evm/evm-gateway.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { pollWithinWaitBudget } from "../wait-budget.js";

// A mined revert is confirmed and failed; RPC errors remain unconfirmed after broadcast.
export function evmConfirmation(
  gateway: EvmGateway,
  scope: TransactionScope,
): (hash: string) => Promise<TxConfirmation | undefined> {
  return (hash) =>
    pollWithinWaitBudget(
      scope.waitTimeoutMs,
      async (signal): Promise<TxConfirmation | undefined> => {
        const receipt = await gateway.getTransactionReceipt(hash, signal).catch(() => null);
        if (receipt) {
          return {
            confirmed: true,
            failed: receipt.success !== true,
            ...(receipt.blockNumber === undefined ? {} : { blockNumber: receipt.blockNumber }),
            ...(receipt.gasUsed === undefined ? {} : { gasUsed: receipt.gasUsed }),
            ...(receipt.feeWei === undefined ? {} : { feeWei: receipt.feeWei }),
            ...(receipt.effectiveGasPriceWei === undefined
              ? {}
              : { effectiveGasPriceWei: receipt.effectiveGasPriceWei }),
            ...(receipt.contractAddress === undefined
              ? {}
              : { contractAddress: receipt.contractAddress }),
          };
        }
        return undefined;
      },
    );
}
