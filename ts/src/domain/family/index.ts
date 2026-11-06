import {
  type AddressCodec,
  EvmAddress,
  isTronHexAddress,
  TronAddress,
  tronHash20Hex,
} from "../address/index.js";

export {
  evmChecksumAddress,
  isEvmAddress,
  isTronHexAddress,
  publicKeyHash20,
  tronAddressFromEvmHex,
  tronAddressFromHash20,
  tronAddressToEvmHex,
  tronHash20Hex,
  tronHexAddress,
  tronHexFromHash20,
  tronHexToBase58,
} from "../address/index.js";
export { isTxHash, normalizeTxHash, txHashInputPattern } from "./tx-hash.js";

export { ChainFamily } from "./chain-family.js";
import type { ChainFamily } from "./chain-family.js";

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // Smallest unit: sun or wei.
  // Native symbols belong to networks; one family can use several coins.
  nativeDecimals: number; // Base-unit decimal places.
  coinType: number; // BIP44 coin_type
  codec: AddressCodec;
  addressPrefix: string;
  zeroAddress: string;
  ledger?: { app: string }; // Present when the Ledger app is wired.
}

export const FAMILIES: { [F in ChainFamily]: FamilyMeta & { family: F } } = {
  tron: {
    family: "tron",
    nativeUnit: "sun",
    nativeDecimals: 6,
    coinType: 195,
    codec: new TronAddress(),
    addressPrefix: "T",
    zeroAddress: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
    ledger: { app: "tron" },
  },
  evm: {
    family: "evm",
    nativeUnit: "wei",
    nativeDecimals: 18,
    coinType: 60,
    codec: new EvmAddress(),
    addressPrefix: "0x",
    zeroAddress: "0x0000000000000000000000000000000000000000",
    ledger: { app: "ethereum" },
  },
};

export const CHAIN_FAMILIES = Object.keys(FAMILIES) as ChainFamily[];

export function addressCodec(family: ChainFamily): AddressCodec {
  return FAMILIES[family].codec;
}

// Requires a valid address, including its checksum when present.
export function familyOf(address: string): ChainFamily | undefined {
  return CHAIN_FAMILIES.find((f) => FAMILIES[f].codec.validate(address));
}

// Canonicalizes valid addresses; preserves labels, contact names, and references.
export function canonicalAddress(address: string): string {
  const family = familyOf(address);
  return family ? FAMILIES[family].codec.canonical(address) : address;
}

const ADDRESS_BODY: { [F in ChainFamily]: RegExp } = {
  tron: /^[1-9A-HJ-NP-Za-km-z]+$/,
  evm: /^[0-9a-fA-F]+$/,
};

// Length after the family's address prefix when the rest uses its alphabet; checks no length or checksum.
export function addressBodyLength(family: ChainFamily, value: string): number | undefined {
  const prefix = FAMILIES[family].addressPrefix;
  if (!value.startsWith(prefix)) return undefined;
  const body = value.slice(prefix.length);
  return ADDRESS_BODY[family].test(body) ? body.length : undefined;
}

export type AddressShape = "tron-base58" | "tron-hex" | "evm";

// Base58 of the 21-byte TRON payload, after the "T" prefix.
const TRON_BASE58_BODY_LENGTH = 33;
// 20 bytes of hex, after the "0x" prefix.
const EVM_HEX_BODY_LENGTH = 40;

// Spelling and exact length of an address; checks no checksum. TRON hex is 41 + 20 bytes, optionally 0x-prefixed.
export function addressShape(value: string): AddressShape | undefined {
  if (addressBodyLength("tron", value) === TRON_BASE58_BODY_LENGTH) return "tron-base58";
  if (isTronHexAddress(value.startsWith("0x") ? value.slice(2) : value)) return "tron-hex";
  if (addressBodyLength("evm", value) === EVM_HEX_BODY_LENGTH) return "evm";
  return undefined;
}

// Whether value starts with the family's address prefix in any letter case.
export function hasAddressPrefix(family: ChainFamily, value: string): boolean {
  const prefix = FAMILIES[family].addressPrefix;
  return value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

// Same 20-byte account. TRON accepts every form tronHash20Hex reads; EVM ignores checksum casing.
export function sameAddress(family: ChainFamily, a: string, b: string): boolean {
  if (family === "tron") {
    try {
      return tronHash20Hex(a) === tronHash20Hex(b);
    } catch {
      return false;
    }
  }
  const lower = a.toLowerCase();
  return lower === b.toLowerCase() && addressShape(lower) === "evm";
}
