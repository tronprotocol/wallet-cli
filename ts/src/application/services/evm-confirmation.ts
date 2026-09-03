import type { EvmGateway } from "../ports/chain/gateway-provider.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Poll for an EVM transaction's receipt until it appears or `--wait` runs out.
 *
 * `confirmed` means "we have a receipt", and `failed` is read from the receipt's status — the two
 * are separate on purpose. A transaction with `status: 0x0` was mined, paid for its gas, and
 * reverted: it is confirmed AND failed, and collapsing those into one flag would let the CLI
 * report a reverted transfer as a successful one. The realised fee is reported either way,
 * because a reverted transaction is not a free one.
 *
 * Best-effort, like the TRON counterpart: an unreachable endpoint means "not confirmed yet", not
 * an error — the transaction was already broadcast, and failing here would deny that.
 */
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
