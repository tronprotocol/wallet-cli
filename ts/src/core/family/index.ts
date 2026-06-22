/**
 * Family Registry (L0) — the single source of per-family facts + ports. Folds the scattered
 * `family === "tron" ? … : …` branches into one table that every lower layer can read.
 *
 * FACTS live here (units, coin type, codec, default/sample networks). BEHAVIOUR that needs
 * concrete upper-layer classes (rpc/signer construction) is declared here only as a PORT
 * (FamilyAdapter/SignStrategy) and assembled at the composition root, then injected down
 * (clean-architecture dependency inversion). See plan §7.12.1.
 *
 * Adding a chain = one entry in FAMILIES (facts) + one entry in the runner's ADAPTERS (behaviour).
 */
import type { ChainFamily, NetworkId, RpcClient, SignedTx, UnsignedTx } from "../types/index.js";
import { type AddressCodec, EvmAddress, TronAddress } from "../address/index.js";

export interface FamilyMeta {
  family: ChainFamily;
  nativeUnit: string; // smallest-unit name: "sun" / "wei"
  coinType: number; // BIP44 coin_type
  codec: AddressCodec; // address derive/validate
  defaultNetwork: NetworkId; // net=optional builtin fallback
}

export const FAMILIES: Record<ChainFamily, FamilyMeta> = {
  tron: { family: "tron", nativeUnit: "sun", coinType: 195, codec: new TronAddress(), defaultNetwork: "tron:mainnet" },
  evm: { family: "evm", nativeUnit: "wei", coinType: 60, codec: new EvmAddress(), defaultNetwork: "evm:1" },
};

/** every known family, in declaration order — replaces hardcoded `["tron","evm"]`. */
export const CHAIN_FAMILIES = Object.keys(FAMILIES) as ChainFamily[];

/** the codec for a family (was core/address.addressCodec). */
export function addressCodec(family: ChainFamily): AddressCodec {
  return FAMILIES[family].codec;
}

/** is this namespace a chain family? — replaces CHAIN_NS / `ns === "tron" || "evm"`. */
export function isChainFamily(ns: string): ns is ChainFamily {
  return Object.prototype.hasOwnProperty.call(FAMILIES, ns);
}

/** detect a family from an address's on-chain encoding; undefined if none match. */
export function familyOf(address: string): ChainFamily | undefined {
  return CHAIN_FAMILIES.find((f) => FAMILIES[f].codec.validate(address));
}

// ── ports (types only; concrete adapters assembled at the composition root) ──────
/** per-family signing behaviour; SoftwareSigner delegates to this (no `if family`). */
export interface SignStrategy {
  sign(pkHex: string, tx: UnsignedTx): Promise<SignedTx>;
  signMessage(pkHex: string, message: string): Promise<string>;
}

/** per-family behaviour the runner wires up with concrete infra/runtime classes. */
export interface FamilyAdapter {
  family: ChainFamily;
  makeRpc(d: { rpcUrl?: string; grpcEndpoint?: string }): RpcClient;
  sign: SignStrategy;
}
