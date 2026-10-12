import type { TronTxInfo } from "../../../../application/ports/chain/tron-gateway.js";
import { tronHexAddress } from "../../../../domain/address/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";

const TRANSFER = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hex = (s: string) => s.replace(/^0x/, "").toLowerCase();
const address = (s: string) => tronHexAddress(s).slice(-40).toLowerCase();
const validWord = (s: string) => /^[0-9a-f]{64}$/.test(s);

/** Net output credited by this successful transaction; never a before/after account snapshot. */
export function decodeReceivedAmount(
  info: TronTxInfo,
  token: string,
  recipient: string,
): string | undefined {
  if (info.receipt?.result !== "SUCCESS") return undefined;
  const owner = address(recipient);
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
        if (
          (typeof amount === "number" && !Number.isSafeInteger(amount)) ||
          !/^\d+$/.test(String(amount))
        )
          return undefined;
        total += BigInt(direction) * BigInt(amount);
        seen = true;
      }
    }
  } else {
    if (!Array.isArray(info.log)) return undefined;
    const currency = address(token);
    for (const entry of info.log) {
      const topics = entry.topics ?? [];
      if (hex(entry.address ?? "").slice(-40) !== currency || hex(topics[0] ?? "") !== TRANSFER)
        continue;
      if (topics.length !== 3 || !validWord(hex(topics[1])) || !validWord(hex(topics[2])))
        return undefined;
      const direction =
        Number(hex(topics[2]).slice(-40) === owner) - Number(hex(topics[1]).slice(-40) === owner);
      if (!direction) continue;
      const data = hex(entry.data ?? "");
      if (!validWord(data)) return undefined;
      total += BigInt(direction) * BigInt(`0x${data}`);
      seen = true;
    }
  }
  return seen && total >= 0n ? total.toString() : undefined;
}
