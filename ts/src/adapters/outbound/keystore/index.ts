import { WALLETS_VERSION } from "../../../domain/migration/wallets-v2.js";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, hexToBytes } from "@noble/hashes/utils.js";
import { base32crockford } from "@scure/base";
import type {
  AccountDescriptor,
  AccountRef,
  Bytes,
  ChainFamily,
  KeystoreBlob,
  MutationResult,
  Source,
  Wallet,
  WalletsFile,
} from "../../../domain/types/index.js";
import { CryptoEnvelope } from "../persistence/crypto/index.js";
import {
  derivationMismatchError,
  legacyDerivationError,
  resolveDerivation,
} from "../../../domain/wallet/derivation-match.js";
import { Derivation } from "../../../domain/derivation/index.js";
import {
  addressCodec,
  familyOf,
  canonicalAddress,
  CHAIN_FAMILIES,
} from "../../../domain/family/index.js";
import { SOURCE_KINDS, sourceFamily } from "../../../domain/sources/index.js";
import { derivedAccountLabel, labelKey, walletLabel } from "../../../domain/wallet/label.js";
import { parseWalletsFile } from "../../../domain/wallet/wallets-file.js";
import { assertPasswordPolicy } from "../../../domain/wallet/password-policy.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import {
  errorMessage,
  ExecutionError,
  UsageError,
  WalletError,
} from "../../../domain/errors/index.js";
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

export {
  accountIndices,
  accountRef,
  decodeVault,
  encodeVault,
  walletAddress,
} from "../../../domain/wallet/index.js";

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

  #read(): WalletsFile {
    const f = this.store.readJson<unknown>(this.walletsPath);
    // The default version is persisted on the first write.
    if (f === null)
      return { version: WALLETS_VERSION, activeAccount: null, wallets: [], labels: {} };
    return parseWalletsFile(f);
  }
  // Caller must hold the wallets.json lock.
  #write(f: WalletsFile): void {
    this.store.writeJson(this.walletsPath, f);
  }

  // Every mutation first finishes an interrupted password change.
  #locked<T>(fn: () => T): T {
    return this.store.withLock(this.walletsPath, () => {
      this.store.recoverJournal(this.#journalPath());
      return fn();
    });
  }

  // For secret reads outside the lock; never call while holding it.
  #recovered(): void {
    if (existsSync(this.#journalPath())) this.#locked(() => undefined);
  }

  import(p: ImportParams): MutationResult {
    return this.#locked(() => {
      const file = this.#read();
      const password = this.getPassword();

      let source: Source;
      let plaintext: Bytes;
      const walletId = this.#freshId("wlt", file);

      if (p.type === "seed") {
        const mnemonic = p.secret.trim();
        if (!Derivation.validateMnemonic(mnemonic)) {
          throw new WalletError("invalid_mnemonic", "invalid BIP39 mnemonic");
        }
        const entropy = Derivation.mnemonicToEntropy(mnemonic);
        const seed = Derivation.mnemonicToSeed(mnemonic, p.passphrase);
        const addr0 = deriveSeedAddresses(seed, 0);
        const dup = findByAddress(file, addr0, "seed");
        if (dup) {
          file.activeAccount = dup;
          this.#write(file);
          return { accountId: dup, created: false };
        }
        const vaultId = this.#freshId("vlt", file);
        // Store the passphrase so decryption reproduces the same seed.
        plaintext = encodeVault(entropy, p.passphrase);
        source = { type: "seed", vaultId, addresses: { "0": addr0 } };
      } else {
        // Map decoder failures to invalid_private_key.
        let pk: Uint8Array;
        try {
          pk = hexToBytes(p.secret.trim().replace(/^0x/, ""));
        } catch {
          throw new WalletError(
            "invalid_private_key",
            "private key must be 32 bytes of hex, with or without a 0x prefix",
          );
        }
        if (pk.length !== 32)
          throw new WalletError("invalid_private_key", "private key must be 32 bytes");
        // A 32-byte value can still be outside the secp256k1 scalar range.
        if (!Derivation.isValidPrivateKey(pk))
          throw new WalletError("invalid_private_key", "private key is out of range for secp256k1");
        const addr = derivePrivAddresses(pk);
        const dup = findByAddress(file, addr, "privateKey");
        if (dup) {
          file.activeAccount = dup;
          this.#write(file);
          return { accountId: dup, created: false };
        }
        const keyId = this.#freshId("key", file);
        plaintext = pk;
        source = { type: "privateKey", keyId, addresses: addr };
      }

      const wallet: Wallet = { id: walletId, source };
      const ref = accountRefOf(wallet, source.type === "seed" ? 0 : null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      file.activeAccount = ref;
      // Validate labels before writes; keep sentinel and blob writes under the wallets.json lock.
      this.#assertPassword({ createIfAbsent: true });
      this.#writeBlob(
        source.type === "seed" ? "vaults" : "keys",
        CryptoEnvelope.encrypt(
          plaintext,
          password,
          source.type === "seed" ? source.vaultId : source.keyId,
          source.type === "seed" ? "bip39-seed" : "raw-privkey",
        ),
      );
      this.#write(file);
      return { accountId: ref, created: true };
    });
  }

  registerLedger(p: {
    family: ChainFamily;
    path: string;
    address: string;
    label?: string;
  }): MutationResult {
    assertAddress(p.family, p.address);
    return this.#locked(() => {
      const file = this.#read();
      // Keep hardware and software accounts distinct even when they share an address.
      const dup = findBySource(
        file,
        (s) => s.type === "ledger" && s.family === p.family && s.path === p.path,
      );
      if (dup) {
        file.activeAccount = dup;
        this.#write(file);
        return { accountId: dup, created: false };
      }
      const walletId = this.#freshId("wlt", file);
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
    assertAddress(p.family, p.address);
    return this.#locked(() => {
      const file = this.#read();
      // Deduplicate only against watch accounts.
      const dup = findBySource(
        file,
        (s) => s.type === "watch" && s.family === p.family && s.address === p.address,
      );
      // Do not activate a watch account implicitly: it cannot sign.
      if (dup) return { accountId: dup, created: false };
      const walletId = this.#freshId("wlt", file);
      const wallet: Wallet = {
        id: walletId,
        source: { type: "watch", family: p.family, address: p.address },
      };
      const ref = accountRefOf(wallet, null);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      this.#write(file);
      return { accountId: ref, created: true };
    });
  }

  // Omitted index appends after the highest slot; an existing slot is verified and activated.
  addAccount(walletId: string, index?: number, label?: string): MutationResult {
    return this.#locked(() => {
      const file = this.#read();
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet)
        throw new UsageError("account_not_found", errorMessage`unknown wallet ${walletId}`);
      if (wallet.source.type !== "seed") {
        const hint =
          wallet.source.type === "ledger" ? " — import another path with 'import ledger'" : "";
        throw new UsageError(
          "seed_not_found",
          `${wallet.source.type} wallets are not HD; cannot add accounts${hint}`,
        );
      }
      const next = index ?? (Math.max(-1, ...accountIndices(wallet.source)) + 1) | 0;
      const key = String(next);
      let created = false;
      if (!wallet.source.addresses[key]) {
        // Check for mixed templates only when deriving a new key.
        const seed = this.#decryptSeedFromVault(wallet.source.vaultId);
        this.#assertDerivable(file, wallet, seed);
        wallet.source.addresses[key] = deriveSeedAddresses(seed, next);
        created = true;
      } else {
        // Verify cached addresses before persisting the selection change.
        const seed = this.#decryptSeedFromVault(wallet.source.vaultId);
        this.#assertAccountMatches(wallet, next, seed);
      }
      const ref = accountRefOf(wallet, next);
      if (label !== undefined) this.#assignLabel(file, ref, label);
      else if (created) {
        const base = file.labels[accountRefOf(wallet, 0)];
        this.#assignLabel(file, ref, derivedAccountLabel(base, next));
      }
      file.activeAccount = ref;
      this.#write(file);
      return { accountId: ref, created };
    });
  }

  // Do not mix derivation templates: stored addresses do not identify their template.
  #assertDerivable(file: WalletsFile, wallet: Wallet, seed: Bytes): void {
    if (wallet.source.type !== "seed") return;
    for (const existing of accountIndices(wallet.source)) {
      if (existing === 0) continue; // identical under both templates; never legacy
      const cached = wallet.source.addresses[String(existing)]?.tron;
      if (!cached) continue;
      const resolved = resolveDerivation(seed, "tron", existing, cached);
      const ref = `${wallet.id}.${existing}`;
      if (!resolved) {
        throw derivationMismatchError(
          "tron",
          ref,
          `so no further accounts can be derived from ${wallet.id}`,
        );
      }
      if (resolved.scheme === "legacy") {
        throw legacyDerivationError(ref, resolved.path, "derive", {
          account: file.labels[ref],
          wallet: file.labels[accountRefOf(wallet, 0)],
        });
      }
    }
  }

  // Accept either known derivation template for an existing slot.
  #assertAccountMatches(wallet: Wallet, index: number, seed: Bytes): void {
    if (wallet.source.type !== "seed") return;
    const ref = accountRefOf(wallet, index);
    const addresses = wallet.source.addresses[String(index)];
    if (!addresses) return;
    for (const family of CHAIN_FAMILIES) {
      const cached = addresses[family];
      if (!resolveDerivation(seed, family, index, cached)) {
        throw derivationMismatchError(family, ref);
      }
    }
  }

  // Non-seed wallets return index -1.
  resolveAccount(refOrLabel: string, family?: ChainFamily): { wallet: Wallet; index: number } {
    const file = this.#read();
    const ref = this.#toRef(file, refOrLabel, family);
    const [walletId, idxStr] = ref.split(".");
    const wallet = file.wallets.find((w) => w.id === walletId);
    if (!wallet)
      throw new UsageError("account_not_found", errorMessage`unknown account ${refOrLabel}`);
    this.#assertReadable(wallet, refOrLabel);
    if (wallet.source.type !== "seed") return { wallet, index: -1 };
    let index: number;
    if (idxStr === undefined) {
      // Never guess which account to sign with in a multi-account wallet.
      const known = accountIndices(wallet.source);
      if (known.length > 1) {
        throw new UsageError(
          "invalid_value",
          errorMessage`'${refOrLabel}' selects a multi-account seed wallet; specify an account ref, e.g. ${wallet.id}.${known[0]}`,
        );
      }
      index = known[0] ?? 0;
    } else {
      index = Number(idxStr);
      if (!Number.isInteger(index) || index < 0) {
        throw new WalletError("invalid_value", errorMessage`invalid account ref '${refOrLabel}'`);
      }
    }
    return { wallet, index };
  }

  resolveWallet(idOrLabel: string): Wallet {
    const file = this.#read();
    const ref = this.#toRef(file, idOrLabel);
    const walletId = ref.split(".")[0]!;
    const wallet = file.wallets.find((w) => w.id === walletId);
    if (!wallet)
      throw new UsageError("account_not_found", errorMessage`unknown wallet ${idOrLabel}`);
    this.#assertReadable(wallet, idOrLabel);
    return wallet;
  }

  rename(
    refOrLabel: string,
    label: string,
  ): { accountId: AccountRef; previousLabel?: string; label: string } {
    return this.#locked(() => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrLabel);
      const previousLabel = file.labels[ref];
      this.#assignLabel(file, ref, label);
      this.#write(file);
      return { accountId: ref, previousLabel, label: file.labels[ref]! };
    });
  }

  setActive(refOrLabel: string): { accountId: AccountRef; previous: AccountRef | null } {
    return this.#locked(() => {
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
      // Skip unknown source kinds so readable accounts remain accessible.
      if (SOURCE_KINDS[w.source.type] === undefined) continue;
      const indices = w.source.type === "seed" ? accountIndices(w.source) : [null];
      for (const index of indices) views.push(this.#describe(file, w, index));
    }
    return views;
  }

  // IDs of unknown source kinds skipped by list().
  unreadable(): string[] {
    const file = this.#read();
    return file.wallets.filter((w) => SOURCE_KINDS[w.source.type] === undefined).map((w) => w.id);
  }

  describe(refOrLabel: string): AccountDescriptor {
    const file = this.#read();
    const { wallet, index } = this.resolveAccount(refOrLabel);
    return this.#describe(file, wallet, index < 0 ? null : index);
  }

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
    if (s.type === "seed") {
      d.seedId = w.id;
    }
    d.derivationPath = derivationPathsOf(s, index);
    return d;
  }

  activeAccount(): AccountRef | null {
    return this.#read().activeAccount;
  }

  delete(refOrWallet: string): {
    accountId: AccountRef;
    scope: "account" | "wallet";
    secretRemoved: boolean;
    newActive: AccountRef | null;
  } {
    return this.#locked(() => {
      const file = this.#read();
      const ref = this.#toRef(file, refOrWallet);
      const [walletId, idxStr] = ref.split(".");
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet)
        throw new WalletError("invalid_value", errorMessage`unknown wallet ${refOrWallet}`);
      this.#assertReadable(wallet, refOrWallet);

      // Deleting seed index 0 removes the whole wallet, including its vault.
      if (wallet.source.type === "seed" && idxStr !== undefined && idxStr !== "0") {
        if (!(idxStr in wallet.source.addresses)) {
          throw new WalletError("invalid_value", errorMessage`unknown account ${refOrWallet}`);
        }
        delete wallet.source.addresses[idxStr];
        delete file.labels[ref];
        const remaining = accountIndices(wallet.source);
        if (remaining.length === 0) {
          file.wallets = file.wallets.filter((w) => w.id !== walletId);
          delete file.labels[walletId!];
        }
        if (
          file.activeAccount === ref ||
          (remaining.length === 0 && file.activeAccount?.split(".")[0] === walletId)
        ) {
          file.activeAccount = file.wallets.length
            ? accountRefOf(file.wallets[0]!, firstIndex(file.wallets[0]!))
            : null;
        }
        // Publish the index without the reference before deleting the secret it names.
        this.#write(file);
        return {
          accountId: ref,
          scope: remaining.length === 0 ? "wallet" : "account",
          secretRemoved: remaining.length === 0 && this.#removeBlobFiles(wallet.source),
          newActive: file.activeAccount,
        };
      }

      file.wallets = file.wallets.filter((w) => w.id !== walletId);
      for (const k of Object.keys(file.labels)) {
        if (k === walletId || k.startsWith(`${walletId}.`)) delete file.labels[k];
      }
      if (file.activeAccount && file.activeAccount.split(".")[0] === walletId) {
        file.activeAccount = file.wallets.length
          ? accountRefOf(file.wallets[0]!, firstIndex(file.wallets[0]!))
          : null;
      }
      this.#write(file);
      return {
        accountId: walletId!,
        scope: "wallet",
        secretRemoved:
          SOURCE_KINDS[wallet.source.type].hasSecret && this.#removeBlobFiles(wallet.source),
        newActive: file.activeAccount,
      };
    });
  }

  isInitialized(): boolean {
    return existsSync(this.#verifierPath());
  }
  // False for an absent sentinel or failed decryption; file-read errors propagate.
  verifyPassword(pw: string): boolean {
    this.#recovered();
    const blob = this.store.readJson<KeystoreBlob>(this.#verifierPath());
    if (!blob) return false;
    try {
      CryptoEnvelope.decrypt(blob, pw);
      return true;
    } catch {
      return false;
    }
  }

  changePassword(oldPassword: string, newPassword: string): { wallets: string[]; count: number } {
    return this.#locked(() => {
      const verifier = this.store.readJson<KeystoreBlob>(this.#verifierPath());
      if (!verifier) {
        throw new WalletError(
          "no_software_wallet",
          "no software wallet; no master password set; nothing to change",
        );
      }
      CryptoEnvelope.decrypt(verifier, oldPassword); // MAC mismatch → auth_failed (wrong old password)

      const file = this.#read();
      const entries: Array<{ path: string; value: unknown }> = [];
      const labels: string[] = [];
      for (const w of file.wallets) {
        const s = w.source;
        if (s.type !== "seed" && s.type !== "privateKey") continue;
        const dir = s.type === "seed" ? ("vaults" as const) : ("keys" as const);
        const id = s.type === "seed" ? s.vaultId : s.keyId;
        const path = this.#blobPath(dir, id);
        const blob = this.store.readJson<KeystoreBlob>(path);
        if (!blob) {
          throw new WalletError(
            "invalid_value",
            `missing ${dir === "vaults" ? "vault" : "key"} blob ${id}`,
          );
        }
        const plaintext = CryptoEnvelope.decrypt(blob, oldPassword);
        try {
          entries.push({
            path,
            value: CryptoEnvelope.encrypt(plaintext, newPassword, id, blob.type),
          });
        } finally {
          plaintext.fill(0);
        }
        labels.push(file.labels[accountRefOf(w, s.type === "seed" ? 0 : null)] ?? w.id);
      }
      if (entries.length === 0) {
        throw new WalletError("no_software_wallet", "no software wallet keystore to re-encrypt");
      }
      entries.push({
        path: this.#verifierPath(),
        value: CryptoEnvelope.encrypt(randomBytes(32), newPassword, "verifier", "verifier"),
      });
      let outcome;
      try {
        outcome = this.store.writeJsonJournaled(this.#journalPath(), entries);
      } catch (e) {
        throw new ExecutionError(
          "io_error",
          "failed to write re-encrypted keystores; the old password remains in effect",
          { error: String(e) },
        );
      }
      if (!outcome.complete) {
        throw new ExecutionError(
          "io_error",
          "the new password is in effect, but some keystore files are not replaced yet; the next wallet command finishes replacing them",
          { error: String(outcome.error) },
        );
      }
      return { wallets: labels, count: labels.length };
    });
  }

  decryptSeed(vaultId: string): Bytes {
    this.#recovered();
    return this.#decryptSeedFromVault(vaultId);
  }
  decryptKey(keyId: string): Bytes {
    this.#recovered();
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("keys", keyId));
    if (!blob) throw new WalletError("invalid_value", `missing key ${keyId}`);
    this.#assertPassword({ createIfAbsent: false });
    const pw = this.getPassword();
    return CryptoEnvelope.decrypt(blob, pw); // MAC mismatch → auth_failed
  }
  revealMnemonic(vaultId: string): { mnemonic: string; passphraseSet: boolean } {
    this.#recovered();
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, this.getPassword()));
    return { mnemonic: Derivation.entropyToMnemonic(entropy), passphraseSet: !!passphrase };
  }

  #decryptSeedFromVault(vaultId: string): Bytes {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    this.#assertPassword({ createIfAbsent: false });
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, this.getPassword()));
    return Derivation.mnemonicToSeed(Derivation.entropyToMnemonic(entropy), passphrase);
  }

  #verifierPath(): string {
    return join(this.root, "verifier.json");
  }
  // Records an unfinished password change of the verifier and the vault and key blobs.
  #journalPath(): string {
    return join(this.root, "password-change.journal.json");
  }
  // Import verifies or creates the password sentinel under the wallets.json lock.
  #assertPassword(opts: { createIfAbsent: boolean }): void {
    const password = this.getPassword();
    const existing = this.store.readJson<KeystoreBlob>(this.#verifierPath());
    if (existing) {
      CryptoEnvelope.decrypt(existing, password); // MAC mismatch → auth_failed (wrong master password)
      return;
    }
    if (opts.createIfAbsent) {
      assertPasswordPolicy(password);
      this.#writeVerifier(password);
    }
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
  // Runs after the index no longer references the blob; false means the secret file remains.
  #removeBlobFiles(source: Source): boolean {
    const path =
      source.type === "seed"
        ? this.#blobPath("vaults", source.vaultId)
        : source.type === "privateKey"
          ? this.#blobPath("keys", source.keyId)
          : undefined;
    if (path === undefined) return false;
    try {
      rmSync(path, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  // Reject unknown source kinds before mutating storage.
  #assertReadable(wallet: Wallet, input: string): void {
    if (SOURCE_KINDS[wallet.source.type] !== undefined) return;
    throw new WalletError(
      "encoding_error",
      errorMessage`${input} uses a wallet format this version does not understand; upgrade wallet-cli to use it`,
    );
  }

  #freshId(prefix: IdPrefix, file: WalletsFile): string {
    const taken = new Set(file.wallets.flatMap((w) => [w.id, secretId(w.source)]));
    for (;;) {
      const id = `${prefix}_${base32crockford.encode(randomBytes(5)).toLowerCase()}`;
      if (!taken.has(id)) return id;
    }
  }

  // Multiple address matches are interchangeable only within one family and with local keys.
  #toRef(file: WalletsFile, input: string, family?: ChainFamily): AccountRef {
    const v = input.trim();
    if (v.startsWith("wlt_")) return v;
    const addrFamily = familyOf(v);
    if (addrFamily !== undefined) {
      // Reject cross-family addresses before lookup; wallet-only commands omit the family.
      if (family !== undefined && family !== addrFamily) {
        throw new UsageError(
          "family_mismatch",
          errorMessage`${input} is ${addrFamily === "evm" ? "an" : "a"} ${addrFamily} address, but this command runs on ${family}; address the account by its accountId or label to use it here`,
        );
      }
      // Normalize EVM input to match cached checksummed addresses.
      const wanted = canonicalAddress(v);
      const hits: Array<{ ref: AccountRef; wallet: Wallet; index: number | null }> = [];
      for (const w of file.wallets) {
        // Unknown source kinds must not prevent lookup of readable accounts.
        if (SOURCE_KINDS[w.source.type] === undefined) continue;
        for (const { index, addr } of enumerateAddresses(w)) {
          if (addr[addrFamily] === wanted)
            hits.push({ ref: accountRefOf(w, index), wallet: w, index });
        }
      }
      if (hits.length === 0)
        throw new UsageError("account_not_found", errorMessage`no account with address ${input}`);
      const interchangeable =
        family === addrFamily && hits.every((h) => SOURCE_KINDS[h.wallet.source.type].hasSecret);
      if (hits.length > 1 && !interchangeable) {
        throw new UsageError(
          "ambiguous_account",
          errorMessage`address ${input} matches ${hits.length} accounts; address it by accountId`,
          {
            address: wanted,
            accountIds: hits.map((h) => h.ref),
            matches: hits.map((h) => ({
              accountId: h.ref,
              label: file.labels[h.ref] ?? "",
              type: h.wallet.source.type,
              index: SOURCE_KINDS[h.wallet.source.type].isHD ? h.index : null,
            })),
          },
        );
      }
      return hits[0]!.ref;
    }
    const matches = Object.entries(file.labels).filter(
      ([, label]) => label.trim().toLowerCase() === v.toLowerCase(),
    );
    if (matches.length === 0)
      throw new UsageError("account_not_found", errorMessage`no account labelled '${input}'`);
    if (matches.length > 1) {
      throw new UsageError(
        "invalid_value",
        errorMessage`label '${input}' is ambiguous: ${matches.map((m) => m[0]).join(", ")}`,
      );
    }
    return matches[0]![0];
  }

  #assignLabel(file: WalletsFile, ref: AccountRef, label?: string): void {
    const value = walletLabel(label ?? this.#defaultLabel(file));
    for (const [k, existing] of Object.entries(file.labels)) {
      if (labelKey(existing) === labelKey(value) && k !== ref) {
        throw new UsageError(
          "invalid_value",
          errorMessage`label '${value}' already in use by ${k}`,
        );
      }
    }
    file.labels[ref] = value;
  }

  #defaultLabel(file: WalletsFile): string {
    // The wallet count already includes the new wallet.
    let n = file.wallets.length;
    const used = new Set(Object.values(file.labels).map((l) => l.toLowerCase()));
    while (used.has(`wallet-${n}`)) n++;
    return `wallet-${n}`;
  }
}

// Applies the rule wallets.json loading applies to Ledger and watch addresses.
function assertAddress(family: ChainFamily, address: string): void {
  if (!CHAIN_FAMILIES.includes(family) || !addressCodec(family).validate(address)) {
    throw new UsageError(
      "invalid_address",
      errorMessage`not a valid ${family} address: ${address}`,
    );
  }
}

// Without opening the seed, report no paths if any family has multiple possible templates.
function derivationPathsOf(source: Source, index: number | null): Record<string, string> | null {
  if (source.type === "seed" && index !== null) {
    if (CHAIN_FAMILIES.some((family) => Derivation.legacyPaths(family, index).length > 0))
      return null;
    return Object.fromEntries(
      CHAIN_FAMILIES.map((family) => [family, Derivation.path(family, index)]),
    );
  }
  if (source.type === "ledger") return { [source.family]: source.path };
  return null;
}
