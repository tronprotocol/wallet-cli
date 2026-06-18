/**
 * Keystore (L1) — wallet-centric storage: encrypted vault/key blobs + wallets.json
 * registry + root labels + selection (--account/--wallet). Atomic writes under lock
 * (修正③). BIP39 passphrase plumbed (修正⑤). Data shapes live in SharedTypes. (plan §7.3)
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { base32crockford } from "@scure/base";
import type {
  AccountRef,
  Bytes,
  ChainAddresses,
  ChainFamily,
  KeystoreBlob,
  Source,
  Wallet,
  WalletsFile,
  WalletView,
} from "../types/index.js";
import { CryptoEnvelope } from "../crypto/index.js";
import { Derivation } from "../derivation/index.js";
import { addressCodec } from "../address/index.js";
import { AtomicFileStore } from "../fs/index.js";
import { UsageError, WalletError } from "../errors/index.js";

type IdPrefix = "wlt" | "vlt" | "key";

export interface ImportParams {
  secret: string;
  type: "seed" | "privateKey";
  passphrase?: string;
  label?: string;
}

export class Keystore {
  readonly walletsPath: string;
  constructor(
    private readonly root: string,
    private readonly store: AtomicFileStore,
    private readonly getPassword: () => string,
  ) {
    this.walletsPath = join(root, "wallets.json");
  }

  // ── registry IO ───────────────────────────────────────────────────────────
  #read(): WalletsFile {
    const f = this.store.readJson<WalletsFile>(this.walletsPath);
    return f ?? { version: 1, activeAccount: null, wallets: [], labels: {} };
  }
  /** caller must already hold the wallets.json lock (mutators wrap in withLock). */
  #write(f: WalletsFile): void {
    this.store.writeJson(this.walletsPath, f);
  }

  // ── import ───────────────────────────────────────────────────────────────
  import(p: ImportParams): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const password = this.getPassword();

      let source: Source;
      const walletId = this.#freshId("wlt", file);

      if (p.type === "seed") {
        const mnemonic = p.secret.trim();
        if (!Derivation.validateMnemonic(mnemonic)) {
          throw new WalletError("invalid_value", "invalid BIP39 mnemonic");
        }
        const entropy = Derivation.mnemonicToEntropy(mnemonic);
        const seed = Derivation.mnemonicToSeed(mnemonic, p.passphrase);
        const addr0 = deriveSeedAddresses(seed, 0);
        const dup = findByAddress(file, addr0);
        if (dup) return dup;
        const vaultId = this.#freshId("vlt", file);
        // global master-password invariant (§7.4.1): establish/verify the sentinel inside the
        // SAME lock as the blob write, so two parallel first-imports can't seed two passwords.
        this.#assertPassword({ createIfAbsent: true });
        // persist passphrase inside the encrypted vault so decryptSeed reconstructs the SAME
        // seed (otherwise the displayed address and the signing key would diverge).
        this.#writeBlob("vaults", CryptoEnvelope.encrypt(encodeVault(entropy, p.passphrase), password, vaultId, "bip39-seed"));
        source = { type: "seed", vaultId, addresses: { "0": addr0 } };
      } else {
        const pk = hexToBytes(p.secret.trim().replace(/^0x/, ""));
        if (pk.length !== 32) throw new WalletError("invalid_value", "private key must be 32 bytes");
        const addr = derivePrivAddresses(pk);
        const dup = findByAddress(file, addr);
        if (dup) return dup;
        const keyId = this.#freshId("key", file);
        this.#assertPassword({ createIfAbsent: true }); // §7.4.1 sentinel, inside this lock
        this.#writeBlob("keys", CryptoEnvelope.encrypt(pk, password, keyId, "raw-privkey"));
        source = { type: "privateKey", keyId, addresses: addr };
      }

      const wallet: Wallet = { id: walletId, source };
      const ref = accountRefOf(wallet, source.type === "seed" ? 0 : null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      if (!file.activeAccount) file.activeAccount = ref;
      this.#write(file);
      return ref;
    });
  }

  registerLedger(p: { family: ChainFamily; path: string; address: string; label?: string }): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      // ledger is single-chain watch-only; the dedup key is (family, path), not address
      // (a hardware account stays distinct from a software one sharing the same key).
      const dup = findLedgerByPath(file, p.family, p.path);
      if (dup) return dup;
      const walletId = this.#freshId("wlt", file);
      // no encrypted blob: ledger holds no secret locally, only family+path+address.
      const wallet: Wallet = {
        id: walletId,
        source: { type: "ledger", family: p.family, path: p.path, address: p.address },
      };
      const ref = accountRefOf(wallet, null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      if (!file.activeAccount) file.activeAccount = ref;
      this.#write(file);
      return ref;
    });
  }

  registerWatch(p: { family: ChainFamily; address: string; label?: string }): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      // watch is secret-less; like ledger it stays distinct from a software account with the
      // same address — the dedup key is (family, address), see findWatchByAddress.
      const dup = findWatchByAddress(file, p.family, p.address);
      if (dup) return dup;
      const walletId = this.#freshId("wlt", file);
      // no encrypted blob: a watch account holds no secret, only family+address.
      const wallet: Wallet = {
        id: walletId,
        source: { type: "watch", family: p.family, address: p.address },
      };
      const ref = accountRefOf(wallet, null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      if (!file.activeAccount) file.activeAccount = ref;
      this.#write(file);
      return ref;
    });
  }

  addAccount(walletId: string): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet) throw new WalletError("invalid_value", `unknown wallet ${walletId}`);
      // only seed wallets are HD: privateKey has no derivation, ledger must be re-imported per path.
      if (wallet.source.type !== "seed") {
        const hint = wallet.source.type === "ledger" ? " — import another path with 'wallet import --type ledger'" : "";
        throw new WalletError("invalid_value", `${wallet.source.type} wallets are not HD; cannot add accounts${hint}`);
      }
      const next = (Math.max(-1, ...accountIndices(wallet.source)) + 1) | 0;
      const seed = this.#decryptSeedFromVault(wallet.source.vaultId);
      wallet.source.addresses[String(next)] = deriveSeedAddresses(seed, next);
      this.#write(file);
      return accountRefOf(wallet, next);
    });
  }

  // ── selection / lookup ─────────────────────────────────────────────────────
  /** index is meaningful only for seed wallets; privateKey/ledger report -1. */
  resolveAccount(refOrLabel: string): { wallet: Wallet; index: number } {
    const file = this.#read();
    const ref = this.#toRef(file, refOrLabel);
    const [walletId, idxStr] = ref.split(".");
    const wallet = file.wallets.find((w) => w.id === walletId);
    if (!wallet) throw new WalletError("invalid_value", `unknown account ${refOrLabel}`);
    if (wallet.source.type !== "seed") return { wallet, index: -1 };
    let index: number;
    if (idxStr === undefined) {
      // wallet-layer selection of a seed: unambiguous only when it has exactly one account.
      // Multi-account → hard error (the signing path never guesses which account, §7.3).
      const known = accountIndices(wallet.source);
      if (known.length > 1) {
        throw new UsageError(
          "invalid_value",
          `'${refOrLabel}' selects a multi-account seed wallet; specify an account ref, e.g. ${wallet.id}.${known[0]}`,
        );
      }
      index = known[0] ?? 0;
    } else {
      index = Number(idxStr);
      if (!Number.isInteger(index) || index < 0) {
        throw new WalletError("invalid_value", `invalid account ref '${refOrLabel}'`);
      }
    }
    return { wallet, index };
  }

  resolveWallet(idOrLabel: string): Wallet {
    const file = this.#read();
    const ref = this.#toRef(file, idOrLabel);
    const walletId = ref.split(".")[0]!;
    const wallet = file.wallets.find((w) => w.id === walletId);
    if (!wallet) throw new WalletError("invalid_value", `unknown wallet ${idOrLabel}`);
    return wallet;
  }

  rename(refOrLabel: string, label: string): void {
    this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrLabel);
      this.#assignLabel(file, ref, label, true);
      this.#write(file);
    });
  }

  setActive(refOrLabel: string): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrLabel);
      file.activeAccount = ref;
      this.#write(file);
      return ref;
    });
  }

  list(): WalletView[] {
    const file = this.#read();
    const views: WalletView[] = [];
    for (const w of file.wallets) {
      // seed → one view per known index; privateKey/ledger → a single index-less view.
      const indices = w.source.type === "seed" ? accountIndices(w.source) : [null];
      for (const index of indices) {
        const ref = accountRefOf(w, index);
        views.push({
          id: w.id,
          ref,
          label: file.labels[ref],
          type: w.source.type,
          index,
          addresses: viewAddresses(w, index),
          active: file.activeAccount === ref,
        });
      }
    }
    return views;
  }

  activeAccount(): AccountRef | null {
    return this.#read().activeAccount;
  }

  delete(refOrWallet: string): void {
    this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrWallet);
      const [walletId, idxStr] = ref.split(".");
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet) throw new WalletError("invalid_value", `unknown wallet ${refOrWallet}`);

      // account-level delete: a single HD sub-account ref (wlt_x.N) forgets just that index
      // (re-derivable from the seed). The vault/secret survives until the wallet itself is
      // deleted via a wallet-level ref/label — destroying a secret needs an explicit target.
      if (wallet.source.type === "seed" && idxStr !== undefined) {
        if (!(idxStr in wallet.source.addresses)) {
          throw new WalletError("invalid_value", `unknown account ${refOrWallet}`);
        }
        delete wallet.source.addresses[idxStr];
        delete file.labels[ref];
        const remaining = accountIndices(wallet.source);
        if (remaining.length === 0) {
          // the last known account is gone → drop the now-empty wallet and its vault.
          file.wallets = file.wallets.filter((w) => w.id !== walletId);
          delete file.labels[walletId!];
          this.#removeBlobFiles(wallet.source);
        }
        if (file.activeAccount === ref || (remaining.length === 0 && file.activeAccount?.split(".")[0] === walletId)) {
          file.activeAccount = file.wallets.length ? accountRefOf(file.wallets[0]!, firstIndex(file.wallets[0]!)) : null;
        }
        this.#write(file);
        return;
      }

      // wallet-level delete: remove the wallet, all its accounts/labels and its secret blob.
      file.wallets = file.wallets.filter((w) => w.id !== walletId);
      for (const k of Object.keys(file.labels)) {
        if (k === walletId || k.startsWith(`${walletId}.`)) delete file.labels[k];
      }
      if (file.activeAccount && file.activeAccount.split(".")[0] === walletId) {
        file.activeAccount = file.wallets.length ? accountRefOf(file.wallets[0]!, firstIndex(file.wallets[0]!)) : null;
      }
      this.#removeBlobFiles(wallet.source);
      this.#write(file);
    });
  }

  // ── secrets ────────────────────────────────────────────────────────────────
  decryptSeed(vaultId: string): Bytes {
    return this.#decryptSeedFromVault(vaultId);
  }
  decryptKey(keyId: string): Bytes {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("keys", keyId));
    if (!blob) throw new WalletError("invalid_value", `missing key ${keyId}`);
    this.#assertPassword({ createIfAbsent: false });
    const pw = this.getPassword();
    const out = CryptoEnvelope.decrypt(blob, pw); // MAC mismatch → auth_failed
    this.#backfillVerifier(pw);
    return out;
  }
  /** recover the BIP39 mnemonic from a seed vault (for `wallet backup --reveal-secret`). */
  revealMnemonic(vaultId: string): string {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const pw = this.getPassword();
    const { entropy } = decodeVault(CryptoEnvelope.decrypt(blob, pw));
    this.#backfillVerifier(pw);
    return Derivation.entropyToMnemonic(entropy);
  }

  // ── internals ────────────────────────────────────────────────────────────
  #decryptSeedFromVault(vaultId: string): Bytes {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const pw = this.getPassword();
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, pw));
    this.#backfillVerifier(pw);
    return Derivation.mnemonicToSeed(Derivation.entropyToMnemonic(entropy), passphrase);
  }

  // ── global master-password sentinel (§7.4.1) ───────────────────────────────
  #verifierPath(): string {
    return join(this.root, "verifier.json");
  }
  /**
   * The keystore-wide invariant that every encrypted blob shares ONE master password.
   * Encrypting writes call with createIfAbsent:true (first write defines the password,
   * later writes verify); decrypt paths call with false (verify only — a missing sentinel
   * is backfilled from a real blob AFTER it decrypts successfully, see #backfillVerifier).
   */
  #assertPassword(opts: { createIfAbsent: boolean }): void {
    const password = this.getPassword();
    const existing = this.store.readJson<KeystoreBlob>(this.#verifierPath());
    if (existing) {
      CryptoEnvelope.decrypt(existing, password); // MAC mismatch → auth_failed (wrong master password)
      return;
    }
    if (opts.createIfAbsent) this.#writeVerifier(password);
  }
  #writeVerifier(password: string): void {
    this.store.writeJson(
      this.#verifierPath(),
      CryptoEnvelope.encrypt(randomBytes(32), password, "verifier", "verifier"),
    );
  }
  /** one-time backfill: a legacy keystore with blobs but no sentinel gets one after a good decrypt. */
  #backfillVerifier(password: string): void {
    if (!this.store.readJson<KeystoreBlob>(this.#verifierPath())) this.#writeVerifier(password);
  }

  #blobPath(dir: "vaults" | "keys", id: string): string {
    return join(this.root, dir, `${id}.json`);
  }
  #writeBlob(dir: "vaults" | "keys", blob: { id: string }): void {
    mkdirSync(join(this.root, dir), { recursive: true });
    this.store.writeJson(this.#blobPath(dir, blob.id), blob);
  }
  #removeBlobFiles(source: Source): void {
    // ledger keeps no local blob; nothing to unlink.
    const path =
      source.type === "seed" ? this.#blobPath("vaults", source.vaultId)
      : source.type === "privateKey" ? this.#blobPath("keys", source.keyId)
      : undefined;
    if (path && existsSync(path)) {
      try { unlinkSync(path); } catch { /* best-effort */ }
    }
  }

  #freshId(prefix: IdPrefix, file: WalletsFile): string {
    const taken = new Set(file.wallets.flatMap((w) => [w.id, secretId(w.source)]));
    for (;;) {
      const id = `${prefix}_${base32crockford.encode(randomBytes(5)).toLowerCase()}`;
      if (!taken.has(id)) return id;
    }
  }

  /** ref|address|label → canonical account ref (exact ref, unique address, or unique label). */
  #toRef(file: WalletsFile, input: string): AccountRef {
    const v = input.trim();
    if (v.startsWith("wlt_")) return v;
    // address form (T… / 0x…): match the unique account holding it in its cache (§7.3 / §7.10).
    if (addressCodec("tron").validate(v) || addressCodec("evm").validate(v)) {
      const hits: AccountRef[] = [];
      for (const w of file.wallets) {
        for (const { index, addr } of enumerateAddresses(w)) {
          if (addr.tron === v || addr.evm === v) hits.push(accountRefOf(w, index));
        }
      }
      if (hits.length === 0) throw new WalletError("invalid_value", `no account with address ${input}`);
      if (hits.length > 1) {
        throw new UsageError("invalid_value", `address ${input} matches multiple accounts: ${hits.join(", ")}`);
      }
      return hits[0]!;
    }
    const matches = Object.entries(file.labels).filter(
      ([, label]) => label.trim().toLowerCase() === v.toLowerCase(),
    );
    if (matches.length === 0) throw new WalletError("invalid_value", `no account labelled '${input}'`);
    if (matches.length > 1) {
      throw new UsageError("invalid_value", `label '${input}' is ambiguous: ${matches.map((m) => m[0]).join(", ")}`);
    }
    return matches[0]![0];
  }

  #assignLabel(file: WalletsFile, ref: AccountRef, label?: string, allowReplace = false): void {
    const value = (label ?? this.#defaultLabel(file)).trim();
    if (value.startsWith("wlt_")) throw new UsageError("invalid_value", "label must not start with 'wlt_'");
    for (const [k, existing] of Object.entries(file.labels)) {
      if (existing.trim().toLowerCase() === value.toLowerCase() && k !== ref) {
        throw new UsageError("invalid_value", `label '${value}' already in use by ${k}`);
      }
    }
    if (file.labels[ref] && !allowReplace && label) {
      // keep existing unless explicitly renaming
    }
    file.labels[ref] = value;
  }

  #defaultLabel(file: WalletsFile): string {
    let n = file.wallets.length + 1;
    const used = new Set(Object.values(file.labels).map((l) => l.toLowerCase()));
    while (used.has(`wallet-${n}`)) n++;
    return `wallet-${n}`;
  }
}

// ── pure helpers ─────────────────────────────────────────────────────────────
/** the secret-blob id carried by a source (vault/key id), or "" for ledger (no blob). */
function secretId(s: Source): string {
  return s.type === "seed" ? s.vaultId : s.type === "privateKey" ? s.keyId : "";
}
/** lowest known index of a wallet, or null for the index-less sources (privateKey/ledger). */
function firstIndex(w: Wallet): number | null {
  return w.source.type === "seed" ? (accountIndices(w.source)[0] ?? 0) : null;
}
function accountRefOf(w: Wallet, index: number | null): AccountRef {
  return accountRef(w.id, index);
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

/** the single account-ref format: `wlt_x.<index>` (seed) or `wlt_k` (privateKey/ledger, index=null). */
export function accountRef(walletId: string, index: number | null): AccountRef {
  return index === null ? walletId : `${walletId}.${index}`;
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
function deriveSeedAddresses(seed: Bytes, index: number): ChainAddresses {
  return {
    tron: addressCodec("tron").fromPublicKey(Derivation.derive(seed, Derivation.path("tron", index)).publicKey),
    evm: addressCodec("evm").fromPublicKey(Derivation.derive(seed, Derivation.path("evm", index)).publicKey),
  };
}
function derivePrivAddresses(pk: Bytes): ChainAddresses {
  const pub = Derivation.publicKeyFromPrivate(pk);
  return { tron: addressCodec("tron").fromPublicKey(pub), evm: addressCodec("evm").fromPublicKey(pub) };
}

/** (index, cached addresses) pairs of a wallet — the one shape both dedup and views walk. */
function enumerateAddresses(w: Wallet): Array<{ index: number | null; addr: Partial<ChainAddresses> }> {
  const s = w.source;
  if (s.type === "seed") {
    return accountIndices(s).map((i) => ({ index: i, addr: s.addresses[String(i)]! }));
  }
  if (s.type === "privateKey") return [{ index: null, addr: s.addresses }];
  return [{ index: null, addr: { [s.family]: s.address } }];
}

/** addresses projected for a single account view (seed index / privateKey / ledger). */
function viewAddresses(w: Wallet, index: number | null): Partial<ChainAddresses> {
  return enumerateAddresses(w).find((e) => e.index === index)?.addr ?? {};
}

/** software-account dedup (seed/privateKey only). Ledger/watch dedup by their own keys below. */
function findByAddress(file: WalletsFile, addr: Partial<ChainAddresses>): AccountRef | null {
  for (const w of file.wallets) {
    if (w.source.type === "ledger" || w.source.type === "watch") continue;
    for (const { index, addr: a } of enumerateAddresses(w)) {
      if ((addr.evm && a.evm === addr.evm) || (addr.tron && a.tron === addr.tron)) {
        return accountRefOf(w, index);
      }
    }
  }
  return null;
}

/** ledger dedup key = (family, path); a hardware account is distinct from a software one. */
function findLedgerByPath(file: WalletsFile, family: ChainFamily, path: string): AccountRef | null {
  for (const w of file.wallets) {
    if (w.source.type === "ledger" && w.source.family === family && w.source.path === path) {
      return accountRefOf(w, null);
    }
  }
  return null;
}

/** watch dedup key = (family, address); a watch-only account is distinct from a software one. */
function findWatchByAddress(file: WalletsFile, family: ChainFamily, address: string): AccountRef | null {
  for (const w of file.wallets) {
    if (w.source.type === "watch" && w.source.family === family && w.source.address === address) {
      return accountRefOf(w, null);
    }
  }
  return null;
}
