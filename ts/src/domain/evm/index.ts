import { hexToBytes } from "@noble/hashes/utils.js";
import { evmChecksumAddress } from "../address/index.js";

export interface Erc20Transfer {
  // EIP-55 recipient.
  readonly to: string;
  // Token base units, decimal.
  readonly rawAmount: string;
}

// Selector of ERC-20 transfer(address,uint256).
const TRANSFER_CALL = /^0xa9059cbb([0-9a-fA-F]{128})$/;

// ERC-20 transfer calldata to its recipient and amount; undefined for any other calldata.
export function decodeErc20Transfer(input: string): Erc20Transfer | undefined {
  const words = TRANSFER_CALL.exec(input)?.[1];
  if (words === undefined) return undefined;
  return {
    to: evmChecksumAddress(hexToBytes(words.slice(24, 64).toLowerCase())),
    rawAmount: BigInt(`0x${words.slice(64)}`).toString(10),
  };
}

// Gas of a native-coin transfer to an address without code.
export const NATIVE_TRANSFER_GAS = 21_000;

// Decimal wei in and out.
export function nativeTransferCostWei(gasPriceWei: string): string {
  return (BigInt(gasPriceWei) * BigInt(NATIVE_TRANSFER_GAS)).toString(10);
}
