import type { TronTxInfo } from "../../../../application/ports/chain/tron-gateway.js";
import { tronHash20Hex } from "../../../../domain/address/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";

const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hex = (s: string) => s.replace(/^0x/, "").toLowerCase();
const validWord = (s: string) => /^[0-9a-f]{64}$/.test(s);

// Net receipt-proven output in base units; undefined when evidence is insufficient.
export function decodeReceivedAmount(
  info: TronTxInfo,
  token: string,
  recipient: string,
): string | undefined {
  if (info.execution !== "success") return undefined;
  const owner = tronHash20Hex(recipient);
  let total = 0n;
  let seen = false;
  if (token === NATIVE_TRX_ADDRESS) {
    if (!Array.isArray(info.internal_transactions)) return undefined;
    for (const call of info.internal_transactions) {
      if (call.rejected) continue;
      const direction =
        Number(hex(call.transferTo_address ?? "").slice(-40) === owner) -
        Number(hex(call.caller_address ?? "").slice(-40) === owner);
      if (!direction) continue;
      if (!Array.isArray(call.callValueInfo)) return undefined;
      for (const value of call.callValueInfo) {
        if (value.tokenId) continue;
        const amount = value.callValue;
        if (amount === undefined) return undefined;
        total += BigInt(direction) * BigInt(amount);
        seen = true;
      }
    }
  } else {
    if (!Array.isArray(info.log)) return undefined;
    const currency = tronHash20Hex(token);
    for (const entry of info.log) {
      const topics = entry.topics ?? [];
      if (hex(entry.address ?? "").slice(-40) !== currency || hex(topics[0] ?? "") !== TRANSFER)
        continue;
      const [, from = "", to = ""] = topics;
      if (topics.length !== 3 || !validWord(hex(from)) || !validWord(hex(to))) return undefined;
      const direction =
        Number(hex(to).slice(-40) === owner) - Number(hex(from).slice(-40) === owner);
      if (!direction) continue;
      const data = hex(entry.data ?? "");
      if (!validWord(data)) return undefined;
      total += BigInt(direction) * BigInt(`0x${data}`);
      seen = true;
    }
  }
  return seen && total >= 0n ? total.toString() : undefined;
}
