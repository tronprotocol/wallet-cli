/**
 * Family Registry — the single source of per-family facts and ports. Folds the scattered
 * `family === "tron" ? …: …` branches into one table that every lower layer can read.
 *
 * FACTS live here (units, coin type, codec, ledger-app). The signing PORT
 * (SignStrategy), RPC factory, and command module are assembled per family in FAMILY_REGISTRY at the
 * application wiring — dependency inversion keeps the domain independent.
 *
 * Adding a chain = one entry in FAMILIES (facts) + one FamilyDef in FAMILY_REGISTRY.
 */
import { type AddressCodec, EvmAddress, TronAddress } from "../address/index.js";

/** The family identity itself lives in a dependency-free module; re-exported here so the registry
 *  stays the one place callers import family facts from. */
export { ChainFamily } from "./chain-family.js";
import type { ChainFamily } from "./chain-family.js";

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // smallest-unit name: "sun" / "wei"
  // NOTE: the coin's SYMBOL is deliberately absent — it lives on NetworkDescriptor. Two networks
  // of one family can use different coins (evm:1 = ETH, evm:56 = BNB), so a family-level symbol
  // can only ever be right for one of them.
  nativeDecimals: number; // native coin decimals: base unit → coin (sun→TRX = 6)
  coinType: number; // BIP44 coin_type
  /** which BIP44 level the account number hangs at — each family follows its own ecosystem
   *  convention, so the coin type alone does not determine the path (§1.2). */
  indexAt: "account" | "addressIndex";
  codec: AddressCodec; // address derive/validate
  ledger?: { app: string }; // present = hardware app wired; value = the Ledger app name
}

export const FAMILIES: { [F in ChainFamily]: FamilyMeta & { family: F } } = {
  tron: {
    family: "tron",
    nativeUnit: "sun",
    nativeDecimals: 6,
    coinType: 195,
    indexAt: "account", // m/44'/195'/<N>'/0/0
    codec: new TronAddress(),
    ledger: { app: "tron" },
  },
  evm: {
    family: "evm",
    nativeUnit: "wei",
    nativeDecimals: 18,
    coinType: 60,
    indexAt: "addressIndex", // m/44'/60'/0'/0/<N> — MetaMask/Trezor/Rabby, not Ledger Live
    codec: new EvmAddress(),
    ledger: { app: "ethereum" },
  },
};

/** every known family, in declaration order. */
export const CHAIN_FAMILIES = Object.keys(FAMILIES) as ChainFamily[];

/** Address codec selected by chain family. */
export function addressCodec(family: ChainFamily): AddressCodec {
  return FAMILIES[family].codec;
}

/** detect a family from an address's on-chain encoding; undefined if none match. */
export function familyOf(address: string): ChainFamily | undefined {
  return CHAIN_FAMILIES.find((f) => FAMILIES[f].codec.validate(address));
}

/**
 * An address in the single spelling this CLI stores and prints, whichever family it belongs to.
 *
 * Anything that is not a valid address of any family is returned untouched: callers use this on
 * values that may be a label, a contact name or a ref, and it is not this function's place to
 * decide those are wrong.
 */
export function canonicalAddress(address: string): string {
  const family = familyOf(address);
  return family ? FAMILIES[family].codec.canonical(address) : address;
}
