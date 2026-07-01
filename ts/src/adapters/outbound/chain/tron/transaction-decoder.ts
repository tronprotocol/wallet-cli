import { tronHexToBase58 } from "../../../../domain/address/index.js";
import type { DecodedTronTransaction, TronTx } from "../../../../application/ports/chain/tron-gateway.js";

const TRC20_TRANSFER_SELECTOR = "a9059cbb";

/** Decode the consumed subset of TRON contracts without performing network IO. */
export function decodeTronTransaction(transaction: TronTx): DecodedTronTransaction {
  const contract = transaction.raw_data?.contract?.[0];
  const value = contract?.parameter?.value ?? {};
  const type = String(contract?.type ?? "");
  const from = tronHexToBase58(value.owner_address);

  if (type === "TransferContract") {
    return { kind: "trx", from, to: tronHexToBase58(value.to_address), rawAmount: String(value.amount ?? 0) };
  }
  if (type === "TransferAssetContract") {
    return { kind: "trc10", from, to: tronHexToBase58(value.to_address), rawAmount: String(value.amount ?? 0) };
  }
  if (type !== "TriggerSmartContract") return from ? { kind: "unknown", from } : { kind: "unknown" };

  const tokenContract = tronHexToBase58(value.contract_address);
  const data = String(value.data ?? "").replace(/^0x/, "");
  if (!data.toLowerCase().startsWith(TRC20_TRANSFER_SELECTOR) || data.length < 136) {
    return { kind: "contract", from, tokenContract };
  }
  return {
    kind: "trc20",
    from,
    to: tronHexToBase58(`41${data.slice(32, 72)}`),
    rawAmount: BigInt(`0x${data.slice(72, 136)}`).toString(),
    tokenContract,
  };
}
