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
import { type AddressCodec, TronAddress } from "../address/index.js";

/** The family identity itself lives in a dependency-free module; re-exported here so the registry
 *  stays the one place callers import family facts from. */
export { ChainFamily } from "./chain-family.js";
import type { ChainFamily } from "./chain-family.js";

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // smallest-unit name: "sun" / "wei"
  nativeSymbol: string; // native coin display symbol: "TRX" / "ETH"
  nativeDecimals: number; // native coin decimals: base unit → coin (sun→TRX = 6)
  coinType: number; // BIP44 coin_type
  codec: AddressCodec; // address derive/validate
  ledger?: { app: string }; // present = hardware app wired; value = the Ledger app name
}

export const FAMILIES: Record<ChainFamily, FamilyMeta> = {
  tron: {
    family: "tron",
    nativeUnit: "sun",
    nativeSymbol: "TRX",
    nativeDecimals: 6,
    coinType: 195,
    codec: new TronAddress(),
    ledger: { app: "tron" },
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
