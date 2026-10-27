import type { EvmGateway } from "../ports/chain/gateway-provider.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// A mined revert is confirmed and failed; RPC errors remain unconfirmed after broadcast.
export function evmConfirmation(
  gateway: EvmGateway,
  scope: TransactionScope,
): (hash: string) => Promise<Record<string, unknown> | undefined> {
  return async (hash) => {
    const deadline = Date.now() + Math.max(0, scope.waitTimeoutMs);
    for (;;) {
      const receipt = await gateway.getTransactionReceipt(hash).catch(() => null);
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
      const remaining = deadline - Date.now();
      if (remaining <= 0) return undefined;
      await sleep(Math.min(1500, remaining));
    }
  };
}
