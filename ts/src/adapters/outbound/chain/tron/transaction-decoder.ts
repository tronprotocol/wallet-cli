import { tronHexFromHash20, tronHexToBase58 } from "../../../../domain/address/index.js";
import type { DecodedTronTransaction } from "../../../../application/ports/chain/tron/tron-gateway.js";

export interface DecodableTronTransaction {
  raw_data?: {
    contract?: Array<{ type?: string; parameter?: { value?: Record<string, unknown> } }>;
  };
}

const TRC20_TRANSFER_SELECTOR = "a9059cbb";

export function decodeTronTransaction(
  transaction: DecodableTronTransaction,
): DecodedTronTransaction {
  const contract = transaction.raw_data?.contract?.[0];
  const value = contract?.parameter?.value ?? {};
  const type = String(contract?.type ?? "");
  const from = tronHexToBase58(value.owner_address);

  if (type === "TransferContract") {
    return {
      kind: "trx",
      from,
      to: tronHexToBase58(value.to_address),
      rawAmount: String(value.amount ?? 0),
    };
  }
  if (type === "TransferAssetContract") {
    return {
      kind: "trc10",
      from,
      to: tronHexToBase58(value.to_address),
      rawAmount: String(value.amount ?? 0),
    };
  }
  if (type !== "TriggerSmartContract")
    return from ? { kind: "unknown", from } : { kind: "unknown" };

  const tokenContract = tronHexToBase58(value.contract_address);
  const data = String(value.data ?? "").replace(/^0x/, "");
  if (!data.toLowerCase().startsWith(TRC20_TRANSFER_SELECTOR) || data.length < 136) {
    return { kind: "contract", from, tokenContract };
  }
  return {
    kind: "trc20",
    from,
    to: tronHexToBase58(tronHexFromHash20(data.slice(32, 72))),
    rawAmount: BigInt(`0x${data.slice(72, 136)}`).toString(),
    tokenContract,
  };
}
