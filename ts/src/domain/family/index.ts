import { type AddressCodec, EvmAddress, TronAddress } from "../address/index.js";

export { ChainFamily } from "./chain-family.js";
import type { ChainFamily } from "./chain-family.js";

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // Smallest unit: sun or wei.
  // Native symbols belong to networks; one family can use several coins.
  nativeDecimals: number; // Base-unit decimal places.
  coinType: number; // BIP44 coin_type
  codec: AddressCodec;
  ledger?: { app: string }; // Present when the Ledger app is wired.
}

export const FAMILIES: { [F in ChainFamily]: FamilyMeta & { family: F } } = {
  tron: {
    family: "tron",
    nativeUnit: "sun",
    nativeDecimals: 6,
    coinType: 195,
    codec: new TronAddress(),
    ledger: { app: "tron" },
  },
  evm: {
    family: "evm",
    nativeUnit: "wei",
    nativeDecimals: 18,
    coinType: 60,
    codec: new EvmAddress(),
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
