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

/**
 * The family identity: the named, value-level enum of chain families. Prefer `ChainFamily.tron`
 * over the bare `"tron"` string in comparisons/switches. Kept as a const-object (not a TS `enum`)
 * so the derived type stays a plain `"tron"` string union — bare strings (config data,
 * CLI/RPC boundaries) remain assignable, and references can migrate incrementally.
 */
export const ChainFamily = { tron: "tron" } as const;
export type ChainFamily = (typeof ChainFamily)[keyof typeof ChainFamily];

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // smallest-unit name: "sun" / "wei"
  coinType: number; // BIP44 coin_type
  codec: AddressCodec; // address derive/validate
  ledger?: { app: string }; // present = hardware app wired; value = the Ledger app name
}

export const FAMILIES: Record<ChainFamily, FamilyMeta> = {
  tron: { family: "tron", nativeUnit: "sun", coinType: 195, codec: new TronAddress(), ledger: { app: "tron" } },
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
