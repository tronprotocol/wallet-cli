/**
 * Keystore pure helpers — the wallet data-model functions (no IO, no password): account-ref
 * formatting, address derivation/projection, the vault payload codec, and the dedup scans.
 * The Keystore class (./index) composes these; data shapes live in SharedTypes.
 */
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import type {
  AccountRef,
  Bytes,
  ChainAddresses,
  ChainFamily,
  Source,
  Wallet,
  WalletsFile,
} from "../types/index.js";
import { Derivation } from "../derivation/index.js";
import { CHAIN_FAMILIES, addressCodec } from "../family/index.js";

/** the secret-blob id carried by a source (vault/key id), or "" for ledger/watch (no blob). */
export function secretId(s: Source): string {
  return s.type === "seed" ? s.vaultId : s.type === "privateKey" ? s.keyId : "";
}

/** lowest known index of a wallet, or null for the index-less sources (privateKey/ledger). */
export function firstIndex(w: Wallet): number | null {
  return w.source.type === "seed" ? (accountIndices(w.source)[0] ?? 0) : null;
}

export function accountRefOf(w: Wallet, index: number | null): AccountRef {
  return accountRef(w.id, index);
}

/** the single account-ref format: `wlt_x.<index>` (seed) or `wlt_k` (privateKey/ledger, index=null). */
export function accountRef(walletId: string, index: number | null): AccountRef {
  return index === null ? walletId : `${walletId}.${index}`;
}

/** known account indices of a source — seed only (privateKey/ledger have none). */
export function accountIndices(source: Source): number[] {
  if (source.type !== "seed") return [];
  return Object.keys(source.addresses).map(Number).sort((a, b) => a - b);
}

/**
 * The single way to read a cached address. seed → addresses[index][family]
 * (index defaults to the lowest known); privateKey → flat addresses[family];
 * ledger → its address iff family matches, else undefined.
 */
export function walletAddress(
  wallet: Wallet,
  family: ChainFamily,
  index?: number,
): string | undefined {
  const s = wallet.source;
  switch (s.type) {
    case "seed": {
      const i = index ?? accountIndices(s)[0] ?? 0;
      return s.addresses[String(i)]?.[family];
    }
    case "privateKey":
      return s.addresses[family];
    case "ledger":
    case "watch":
      return s.family === family ? s.address : undefined;
  }
}

// ── vault payload codec (entropy + optional BIP39 passphrase, persisted encrypted) ──
interface VaultPayload {
  v: 1;
  entropy: string;
  passphrase?: string;
}
export function encodeVault(entropy: Bytes, passphrase?: string): Bytes {
  const payload: VaultPayload = { v: 1, entropy: bytesToHex(entropy) };
  if (passphrase) payload.passphrase = passphrase;
  return new TextEncoder().encode(JSON.stringify(payload));
}
export function decodeVault(plaintext: Bytes): { entropy: Bytes; passphrase?: string } {
  const obj = JSON.parse(new TextDecoder().decode(plaintext)) as VaultPayload;
  return { entropy: hexToBytes(obj.entropy), passphrase: obj.passphrase };
}

export function deriveSeedAddresses(seed: Bytes, index: number): ChainAddresses {
  const out = {} as Record<ChainFamily, string>;
  for (const f of CHAIN_FAMILIES) {
    out[f] = addressCodec(f).fromPublicKey(Derivation.derive(seed, Derivation.path(f, index)).publicKey);
  }
  return out;
}
export function derivePrivAddresses(pk: Bytes): ChainAddresses {
  const pub = Derivation.publicKeyFromPrivate(pk);
  const out = {} as Record<ChainFamily, string>;
  for (const f of CHAIN_FAMILIES) out[f] = addressCodec(f).fromPublicKey(pub);
  return out;
}

/** (index, cached addresses) pairs of a wallet — the one shape both dedup and views walk. */
export function enumerateAddresses(w: Wallet): Array<{ index: number | null; addr: Partial<ChainAddresses> }> {
  const s = w.source;
  if (s.type === "seed") {
    return accountIndices(s).map((i) => ({ index: i, addr: s.addresses[String(i)]! }));
  }
  if (s.type === "privateKey") return [{ index: null, addr: s.addresses }];
  return [{ index: null, addr: { [s.family]: s.address } }];
}

/** addresses projected for a single account view (seed index / privateKey / ledger). */
export function viewAddresses(w: Wallet, index: number | null): Partial<ChainAddresses> {
  return enumerateAddresses(w).find((e) => e.index === index)?.addr ?? {};
}

/** software-account dedup (seed/privateKey only). Ledger/watch dedup by source match below. */
export function findByAddress(file: WalletsFile, addr: Partial<ChainAddresses>): AccountRef | null {
  for (const w of file.wallets) {
    if (w.source.type === "ledger" || w.source.type === "watch") continue;
    for (const { index, addr: a } of enumerateAddresses(w)) {
      if (CHAIN_FAMILIES.some((f) => addr[f] !== undefined && a[f] === addr[f])) {
        return accountRefOf(w, index);
      }
    }
  }
  return null;
}

/** secret-less dedup (ledger by family+path, watch by family+address): one parameterized scan. */
export function findBySource(file: WalletsFile, match: (s: Source) => boolean): AccountRef | null {
  for (const w of file.wallets) {
    if (match(w.source)) return accountRefOf(w, null);
  }
  return null;
}
