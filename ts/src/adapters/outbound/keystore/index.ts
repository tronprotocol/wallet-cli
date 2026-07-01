/**
 * Keystore — wallet-centric storage: encrypted vault/key blobs plus wallets.json.
 * registry + root labels + selection (--account/--wallet). Atomic writes under lock.
 * BIP39 passphrase plumbed. Data shapes live in SharedTypes.
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, hexToBytes } from "@noble/hashes/utils.js";
import { base32crockford } from "@scure/base";
import type {
  AccountDescriptor, AccountRef, Bytes, ChainFamily, KeystoreBlob, MutationResult, Source, Wallet, WalletsFile } from "../../../domain/types/index.js";
import { CryptoEnvelope } from "../persistence/crypto/index.js";
import { Derivation } from "../../../domain/derivation/index.js";
import { familyOf, CHAIN_FAMILIES } from "../../../domain/family/index.js";
import { SOURCE_KINDS, sourceFamily } from "../../../domain/sources/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { UsageError, WalletError } from "../../../domain/errors/index.js";
import {
  accountIndices,
  accountRefOf,
  decodeVault,
  derivePrivAddresses,
  deriveSeedAddresses,
  encodeVault,
  enumerateAddresses,
  findByAddress,
  findBySource,
  firstIndex,
  secretId,
  viewAddresses,
} from "../../../domain/wallet/index.js";

// public data-model helpers used by upper layers (signer/context) — re-exported here so they
// keep importing from the keystore barrel.
export { accountIndices, accountRef, decodeVault, encodeVault, walletAddress } from "../../../domain/wallet/index.js";

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
  import(p: ImportParams): MutationResult {
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
        if (dup) {
          file.activeAccount = dup;
          this.#write(file);
          return { accountId: dup, created: false };
        }
        const vaultId = this.#freshId("vlt", file);
        // global master-password invariant: establish/verify the sentinel inside the
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
        if (dup) {
          file.activeAccount = dup;
          this.#write(file);
          return { accountId: dup, created: false };
        }
        const keyId = this.#freshId("key", file);
        this.#assertPassword({ createIfAbsent: true }); // sentinel, inside this lock
        this.#writeBlob("keys", CryptoEnvelope.encrypt(pk, password, keyId, "raw-privkey"));
        source = { type: "privateKey", keyId, addresses: addr };
      }

      const wallet: Wallet = { id: walletId, source };
      const ref = accountRefOf(wallet, source.type === "seed" ? 0 : null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, created: true };
    });
  }

  registerLedger(p: { family: ChainFamily; path: string; address: string; label?: string }): MutationResult {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      // ledger is single-chain watch-only; the dedup key is (family, path), not address
      // (a hardware account stays distinct from a software one sharing the same key).
      const dup = findBySource(file, (s) => s.type === "ledger" && s.family === p.family && s.path === p.path);
      if (dup) {
        file.activeAccount = dup;
        this.#write(file);
        return { accountId: dup, created: false };
      }
      const walletId = this.#freshId("wlt", file);
      // no encrypted blob: ledger holds no secret locally, only family+path+address.
      const wallet: Wallet = {
        id: walletId,
        source: { type: "ledger", family: p.family, path: p.path, address: p.address },
      };
      const ref = accountRefOf(wallet, null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, created: true };
    });
  }

  registerWatch(p: { family: ChainFamily; address: string; label?: string }): MutationResult {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      // watch is secret-less; like ledger it stays distinct from a software account with the
      // same address — the dedup key is (family, address), see findWatchByAddress.
      const dup = findBySource(file, (s) => s.type === "watch" && s.family === p.family && s.address === p.address);
      if (dup) {
        file.activeAccount = dup;
        this.#write(file);
        return { accountId: dup, created: false };
      }
      const walletId = this.#freshId("wlt", file);
      // no encrypted blob: a watch account holds no secret, only family+address.
      const wallet: Wallet = {
        id: walletId,
        source: { type: "watch", family: p.family, address: p.address },
      };
      const ref = accountRefOf(wallet, null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, created: true };
    });
  }

  /** Derive an HD sub-account. `index` picks an explicit slot (idempotent if already derived);
   *  omitted → the next free index. `created` is false when the index was already derived. */
  addAccount(walletId: string, index?: number): MutationResult {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet) throw new WalletError("invalid_value", `unknown wallet ${walletId}`);
      // only seed wallets are HD: privateKey has no derivation, ledger must be re-imported per path.
      if (wallet.source.type !== "seed") {
        const hint = wallet.source.type === "ledger" ? " — import another path with 'import ledger'" : "";
        throw new WalletError("invalid_value", `${wallet.source.type} wallets are not HD; cannot add accounts${hint}`);
      }
      const next = index ?? ((Math.max(-1, ...accountIndices(wallet.source)) + 1) | 0);
      const key = String(next);
      let created = false;
      if (!wallet.source.addresses[key]) {
        const seed = this.#decryptSeedFromVault(wallet.source.vaultId);
        wallet.source.addresses[key] = deriveSeedAddresses(seed, next);
        created = true;
      }
      const ref = accountRefOf(wallet, next);
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, created };
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
      // Multi-account → hard error (the signing path never guesses which account).
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

  rename(refOrLabel: string, label: string): { accountId: AccountRef; previousLabel?: string; label: string } {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrLabel);
      const previousLabel = file.labels[ref];
      this.#assignLabel(file, ref, label);
      this.#write(file);
      return { accountId: ref, previousLabel, label: file.labels[ref]! };
    });
  }

  setActive(refOrLabel: string): { accountId: AccountRef; previous: AccountRef | null } {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrLabel);
      const previous = file.activeAccount;
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, previous };
    });
  }

  list(): AccountDescriptor[] {
    const file = this.#read();
    const views: AccountDescriptor[] = [];
    for (const w of file.wallets) {
      // seed → one view per known index; privateKey/ledger → a single index-less view.
      const indices = w.source.type === "seed" ? accountIndices(w.source) : [null];
      for (const index of indices) views.push(this.#describe(file, w, index));
    }
    return views;
  }

  /** the full max-disclosure descriptor of one account (resolves accountId/label/address). */
  describe(refOrLabel: string): AccountDescriptor {
    const file = this.#read();
    const { wallet, index } = this.resolveAccount(refOrLabel);
    return this.#describe(file, wallet, index < 0 ? null : index);
  }

  /** shared descriptor builder — the single shape `list`/`describe` and every command return. */
  #describe(file: WalletsFile, w: Wallet, index: number | null): AccountDescriptor {
    const ref = accountRefOf(w, index);
    const s = w.source;
    const d: AccountDescriptor = {
      accountId: ref,
      label: file.labels[ref],
      type: s.type,
      index,
      active: file.activeAccount === ref,
      addresses: viewAddresses(w, index),
    };
    const family = sourceFamily(s);
    if (family) d.family = family;
    if (s.type === "ledger") d.path = s.path;
    return d;
  }

  activeAccount(): AccountRef | null {
    return this.#read().activeAccount;
  }

  /** delete an account/wallet. Reports what scope was removed, whether a secret blob was
   *  destroyed, and the active account afterwards (re-pointed if the old active is gone). */
  delete(refOrWallet: string): { accountId: AccountRef; scope: "account" | "wallet"; secretRemoved: boolean; newActive: AccountRef | null } {
    return this.store.withLock(this.walletsPath, () => {
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
        let secretRemoved = false;
        if (remaining.length === 0) {
          // the last known account is gone → drop the now-empty wallet and its vault.
          file.wallets = file.wallets.filter((w) => w.id !== walletId);
          delete file.labels[walletId!];
          this.#removeBlobFiles(wallet.source);
          secretRemoved = true;
        }
        if (file.activeAccount === ref || (remaining.length === 0 && file.activeAccount?.split(".")[0] === walletId)) {
          file.activeAccount = file.wallets.length ? accountRefOf(file.wallets[0]!, firstIndex(file.wallets[0]!)) : null;
        }
        this.#write(file);
        return { accountId: ref, scope: remaining.length === 0 ? "wallet" : "account", secretRemoved, newActive: file.activeAccount };
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
      return { accountId: walletId!, scope: "wallet", secretRemoved: SOURCE_KINDS[wallet.source.type].hasSecret, newActive: file.activeAccount };
    });
  }

  // ── password sentinel queries (read-only; never throw) ──────────────────────
  /** true once the keystore-wide master password has been established. */
  isInitialized(): boolean {
    return existsSync(this.#verifierPath());
  }
  /** true iff `pw` decrypts the sentinel; false when absent or wrong (never throws). */
  verifyPassword(pw: string): boolean {
    const blob = this.store.readJson<KeystoreBlob>(this.#verifierPath());
    if (!blob) return false;
    try {
      CryptoEnvelope.decrypt(blob, pw);
      return true;
    } catch {
      return false;
    }
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
    return CryptoEnvelope.decrypt(blob, pw); // MAC mismatch → auth_failed
  }
  /** recover the BIP39 mnemonic from a seed vault (for `wallet backup`); also report whether a
   *  BIP39 passphrase ("25th word") is set, without exposing its value. */
  revealMnemonic(vaultId: string): { mnemonic: string; passphraseSet: boolean } {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, this.getPassword()));
    return { mnemonic: Derivation.entropyToMnemonic(entropy), passphraseSet: !!passphrase };
  }

  // ── internals ────────────────────────────────────────────────────────────
  #decryptSeedFromVault(vaultId: string): Bytes {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, this.getPassword()));
    return Derivation.mnemonicToSeed(Derivation.entropyToMnemonic(entropy), passphrase);
  }

  // ── global master-password sentinel  ───────────────────────────────
  #verifierPath(): string {
    return join(this.root, "verifier.json");
  }
  /**
   * The keystore-wide invariant that every encrypted blob shares ONE master password.
   * Only the encrypting import paths call with createIfAbsent:true (first import defines the
   * password, later imports verify) — so the master password is *born* solely at `wallet
   * create` / `import-mnemonic` / `import-private-key`. Decrypt paths call with false (verify
   * only, never write): every blob this keystore writes is preceded by the sentinel in the same
   * lock, so a present blob always has a matching sentinel — no backfill path exists.
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
    // address form (T… / 0x…): match the unique account holding it in its cache.
    if (familyOf(v) !== undefined) {
      const hits: AccountRef[] = [];
      for (const w of file.wallets) {
        for (const { index, addr } of enumerateAddresses(w)) {
          if (CHAIN_FAMILIES.some((f) => addr[f] === v)) hits.push(accountRefOf(w, index));
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

  #assignLabel(file: WalletsFile, ref: AccountRef, label?: string): void {
    const value = (label ?? this.#defaultLabel(file)).trim();
    if (value.startsWith("wlt_")) throw new UsageError("invalid_value", "label must not start with 'wlt_'");
    for (const [k, existing] of Object.entries(file.labels)) {
      if (existing.trim().toLowerCase() === value.toLowerCase() && k !== ref) {
        throw new UsageError("invalid_value", `label '${value}' already in use by ${k}`);
      }
    }
    file.labels[ref] = value;
  }

  #defaultLabel(file: WalletsFile): string {
    // called AFTER the new wallet is pushed, so length already counts it: 1st wallet → "wallet-1".
    let n = file.wallets.length;
    const used = new Set(Object.values(file.labels).map((l) => l.toLowerCase()));
    while (used.has(`wallet-${n}`)) n++;
    return `wallet-${n}`;
  }
}
