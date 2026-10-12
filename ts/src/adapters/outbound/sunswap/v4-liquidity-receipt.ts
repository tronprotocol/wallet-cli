import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { tronHexAddress } from "../../../domain/address/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../domain/sunswap/tokens.js";
import type { TronTxInfo } from "../../../application/ports/chain/tron-gateway.js";
import type {
  V4LiquidityReceiptQuery,
  V4LiquidityResult,
} from "../../../application/ports/sunswap/liquidity.js";

const topic = (signature: string) => bytesToHex(keccak_256(utf8ToBytes(signature)));
const POOL_MODIFY = topic("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32,int256)");
const POSITION_MODIFY = topic("ModifyLiquidity(uint256,int256,int256)");
const TRANSFER = topic("Transfer(address,address,uint256)");
const hex = (value: string) => value.replace(/^0x/, "").toLowerCase();
const address = (value: string) => tronHexAddress(value).slice(-40).toLowerCase();
const word = (data: string, index: number) =>
  BigInt(`0x${data.slice(index * 64, (index + 1) * 64)}`);
const validData = (data: string, words: number) =>
  data.length === words * 64 && /^[0-9a-f]+$/.test(data);
const pair = (packed: bigint) =>
  [BigInt.asIntN(128, packed >> 128n), BigInt.asIntN(128, packed)] as const;

type Log = { address?: string; topics?: string[]; data?: string };
type Internal = {
  caller_address?: string;
  transferTo_address?: string;
  rejected?: boolean;
  callValueInfo?: { callValue?: string | number; tokenId?: string }[];
};

/**
 * Match both ModifyLiquidity events to this position, then read account settlement transfers.
 * Pool amountDelta is emitted BEFORE afterModifyLiquidity hooks, so it alone cannot prove
 * the amount received. Transfer logs/internal TRX calls account for hooks and native refunds.
 */
export function decodeV4LiquidityReceipt(
  info: TronTxInfo,
  query: V4LiquidityReceiptQuery,
  positionManager: string,
  poolManager: string,
): V4LiquidityResult | undefined {
  if (info.receipt?.result !== "SUCCESS" || !Array.isArray(info.log)) return undefined;
  const logs = info.log as Log[];
  const manager = address(positionManager);
  const pool = address(poolManager);
  const poolId = hex(query.poolId);
  const positions = logs.filter(
    (entry) =>
      hex(entry.address ?? "").slice(-40) === manager &&
      entry.topics?.length === 2 &&
      hex(entry.topics[0]!) === POSITION_MODIFY &&
      validData(hex(entry.topics[1]!), 1) &&
      (query.tokenId === undefined || word(hex(entry.topics[1]!), 0).toString() === query.tokenId),
  );
  if (positions.length !== 1) return undefined;
  const position = positions[0]!;
  const tokenId = word(hex(position.topics![1]!), 0).toString();
  const positionData = hex(position.data ?? "");
  if (!validData(positionData, 2)) return undefined;
  const liquidityDelta = BigInt.asIntN(256, word(positionData, 0));
  const [fee0, fee1] = pair(word(positionData, 1));
  const pools = logs.filter((entry) => {
    const topics = entry.topics ?? [];
    const data = hex(entry.data ?? "");
    return (
      hex(entry.address ?? "").slice(-40) === pool &&
      topics.length === 3 &&
      hex(topics[0]!) === POOL_MODIFY &&
      hex(topics[1]!) === poolId &&
      validData(hex(topics[2]!), 1) &&
      hex(topics[2]!).slice(-40) === manager &&
      validData(data, 5) &&
      word(data, 3).toString() === tokenId &&
      BigInt.asIntN(256, word(data, 2)) === liquidityDelta
    );
  });
  if (pools.length !== 1 || fee0 < 0n || fee1 < 0n) return undefined;
  const [principal0, principal1] = pair(word(hex(pools[0]!.data!), 4));
  const owner = address(query.account);

  function flow(currency: string): bigint | undefined {
    let delta = 0n;
    if (currency === NATIVE_TRX_ADDRESS) {
      // Missing traces are unknown, not a zero transfer. Never fall back to balance snapshots.
      if (!Array.isArray(info.internal_transactions)) return undefined;
      delta -= BigInt(query.nativeValueSent ?? "0");
      for (const call of info.internal_transactions as Internal[]) {
        if (call.rejected) continue;
        const direction =
          Number(hex(call.transferTo_address ?? "").slice(-40) === owner) -
          Number(hex(call.caller_address ?? "").slice(-40) === owner);
        if (!direction) continue;
        if (!Array.isArray(call.callValueInfo)) return undefined;
        for (const value of call.callValueInfo) {
          if (value.tokenId) continue; // TRC10 is not TRX.
          const amount = value.callValue ?? 0;
          if (
            (typeof amount === "number" && !Number.isSafeInteger(amount)) ||
            !/^\d+$/.test(String(amount))
          )
            return undefined;
          delta += BigInt(direction) * BigInt(amount);
        }
      }
      return delta;
    }
    const token = address(currency);
    for (const entry of logs) {
      const topics = entry.topics ?? [];
      if (hex(entry.address ?? "").slice(-40) !== token || hex(topics[0] ?? "") !== TRANSFER)
        continue;
      if (topics.length !== 3 || !validData(hex(topics[1]!), 1) || !validData(hex(topics[2]!), 1))
        return undefined;
      const direction =
        Number(hex(topics[2]!).slice(-40) === owner) - Number(hex(topics[1]!).slice(-40) === owner);
      if (!direction) continue;
      const data = hex(entry.data ?? "");
      if (!validData(data, 1)) return undefined;
      delta += BigInt(direction) * word(data, 0);
    }
    return delta;
  }
  const balanceDelta0 = flow(query.token0);
  const balanceDelta1 = flow(query.token1);
  if (balanceDelta0 === undefined || balanceDelta1 === undefined) return undefined;
  return {
    tokenId,
    liquidityDelta: liquidityDelta.toString(),
    principal0: principal0.toString(),
    principal1: principal1.toString(),
    fee0: fee0.toString(),
    fee1: fee1.toString(),
    balanceDelta0: balanceDelta0.toString(),
    balanceDelta1: balanceDelta1.toString(),
  };
}
