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

// Returns an empty string for sources without local secrets.
export function secretId(s: Source): string {
  return s.type === "seed" ? s.vaultId : s.type === "privateKey" ? s.keyId : "";
}

// Lowest cached seed index (zero if empty); null for other sources.
export function firstIndex(w: Wallet): number | null {
  return w.source.type === "seed" ? (accountIndices(w.source)[0] ?? 0) : null;
}

export function accountRefOf(w: Wallet, index: number | null): AccountRef {
  return accountRef(w.id, index);
}

// Seed refs use walletId.index; other sources use walletId.
export function accountRef(walletId: string, index: number | null): AccountRef {
  return index === null ? walletId : `${walletId}.${index}`;
}

export function accountIndices(source: Source): number[] {
  if (source.type !== "seed") return [];
  return Object.keys(source.addresses)
    .map(Number)
    .sort((a, b) => a - b);
}

// Reads cached addresses; a missing seed index defaults to the lowest known index.
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

// Vault plaintext is UTF-8 JSON containing hex entropy and an optional BIP39 passphrase.
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
    out[f] = addressCodec(f).fromPublicKey(
      Derivation.derive(seed, Derivation.path(f, index)).publicKey,
    );
  }
  return out;
}
export function derivePrivAddresses(pk: Bytes): ChainAddresses {
  const pub = Derivation.publicKeyFromPrivate(pk);
  const out = {} as Record<ChainFamily, string>;
  for (const f of CHAIN_FAMILIES) out[f] = addressCodec(f).fromPublicKey(pub);
  return out;
}

// Canonicalizes cached addresses for display and deduplication without rewriting storage.
export function enumerateAddresses(
  w: Wallet,
): Array<{ index: number | null; addr: Partial<ChainAddresses> }> {
  const s = w.source;
  if (s.type === "seed") {
    return accountIndices(s).map((i) => ({
      index: i,
      addr: canonicalAddresses(s.addresses[String(i)]!),
    }));
  }
  if (s.type === "privateKey") return [{ index: null, addr: canonicalAddresses(s.addresses) }];
  return [{ index: null, addr: { [s.family]: addressCodec(s.family).canonical(s.address) } }];
}

function canonicalAddresses(addr: Partial<ChainAddresses>): Partial<ChainAddresses> {
  const out: Partial<ChainAddresses> = {};
  for (const f of CHAIN_FAMILIES) {
    const value = addr[f];
    if (value !== undefined) out[f] = addressCodec(f).canonical(value);
  }
  return out;
}

export function viewAddresses(w: Wallet, index: number | null): Partial<ChainAddresses> {
  return enumerateAddresses(w).find((e) => e.index === index)?.addr ?? {};
}

// Scope deduplication by source type to avoid losing a seed when its raw key is already stored.
export function findByAddress(
  file: WalletsFile,
  addr: Partial<ChainAddresses>,
  ofType?: Source["type"],
): AccountRef | null {
  for (const w of file.wallets) {
    if (w.source.type === "ledger" || w.source.type === "watch") continue;
    if (ofType !== undefined && w.source.type !== ofType) continue;
    for (const { index, addr: a } of enumerateAddresses(w)) {
      if (CHAIN_FAMILIES.some((f) => addr[f] !== undefined && a[f] === addr[f])) {
        return accountRefOf(w, index);
      }
    }
  }
  return null;
}

export function findBySource(file: WalletsFile, match: (s: Source) => boolean): AccountRef | null {
  for (const w of file.wallets) {
    if (match(w.source)) return accountRefOf(w, null);
  }
  return null;
}
