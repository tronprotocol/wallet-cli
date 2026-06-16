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

type IdPrefix = "wlt" | "vlt" | "key" | "led";

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
      let addresses: Wallet["addresses"];
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
        // persist passphrase inside the encrypted vault so decryptSeed reconstructs the SAME
        // seed (otherwise the displayed address and the signing key would diverge).
        this.#writeBlob("vaults", CryptoEnvelope.encrypt(encodeVault(entropy, p.passphrase), password, vaultId, "bip39-seed"));
        source = { type: "seed", vaultId, accounts: [0] };
        addresses = { "0": addr0 };
      } else {
        const pk = hexToBytes(p.secret.trim().replace(/^0x/, ""));
        if (pk.length !== 32) throw new WalletError("invalid_value", "private key must be 32 bytes");
        const addr = derivePrivAddresses(pk);
        const dup = findByAddress(file, addr);
        if (dup) return dup;
        const keyId = this.#freshId("key", file);
        this.#writeBlob("keys", CryptoEnvelope.encrypt(pk, password, keyId, "raw-privkey"));
        source = { type: "privateKey", keyId };
        addresses = { "": addr };
      }

      const wallet: Wallet = { id: walletId, source, addresses };
      const ref = accountRefOf(wallet, source.type === "privateKey" ? null : 0);
      file.wallets.push(wallet);
      this.#assignLabel(file, ref, p.label);
      if (!file.activeAccount) file.activeAccount = ref;
      this.#write(file);
      return ref;
    });
  }

  registerLedger(p: { addresses: { tron?: string; evm?: string }; label?: string }): AccountRef {
    return this.store.withLock(this.walletsPath, () => {
      const file = this.#read();
      const dup = findByAddress(file, p.addresses);
      if (dup) return dup;
      const walletId = this.#freshId("wlt", file);
      const deviceId = this.#freshId("led", file);
      this.#writeBlob("ledger", { id: deviceId, registeredPaths: [0] } as any);
      const wallet: Wallet = {
        id: walletId,
        source: { type: "ledger", deviceId, accounts: [0] },
        addresses: { "0": p.addresses },
      };
      const ref = accountRefOf(wallet, 0);
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
      if (wallet.source.type === "privateKey") {
        throw new UsageError("invalid_value", "privateKey wallets are not HD; cannot add accounts");
      }
      const next = (Math.max(-1, ...wallet.source.accounts) + 1) | 0;
      if (wallet.source.type === "seed") {
        const seed = this.#decryptSeedFromVault(wallet.source.vaultId);
        wallet.addresses[String(next)] = deriveSeedAddresses(seed, next);
      } else {
        throw new UsageError("auth_required", "ledger add-account requires the device (not supported in this build)");
      }
      wallet.source.accounts.push(next);
      this.#write(file);
      return accountRefOf(wallet, next);
    });
  }

  // ── selection / lookup ─────────────────────────────────────────────────────
  resolveAccount(refOrLabel: string): { wallet: Wallet; index: number; key: string } {
    const file = this.#read();
    const ref = this.#toRef(file, refOrLabel);
    const [walletId, idxStr] = ref.split(".");
    const wallet = file.wallets.find((w) => w.id === walletId);
    if (!wallet) throw new WalletError("invalid_value", `unknown account ${refOrLabel}`);
    if (wallet.source.type === "privateKey") return { wallet, index: -1, key: "" };
    let index: number;
    if (idxStr === undefined) {
      index = wallet.source.accounts[0] ?? 0;
    } else {
      index = Number(idxStr);
      if (!Number.isInteger(index) || index < 0) {
        throw new WalletError("invalid_value", `invalid account ref '${refOrLabel}'`);
      }
    }
    return { wallet, index, key: String(index) };
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
      for (const key of Object.keys(w.addresses)) {
        const index = key === "" ? null : Number(key);
        const ref = accountRefOf(w, index);
        views.push({
          id: w.id,
          ref,
          label: file.labels[ref],
          type: w.source.type,
          index,
          addresses: w.addresses[key] ?? {},
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
      const walletId = ref.split(".")[0]!;
      const wallet = file.wallets.find((w) => w.id === walletId);
      if (!wallet) throw new WalletError("invalid_value", `unknown wallet ${refOrWallet}`);
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
    return CryptoEnvelope.decrypt(blob, this.getPassword());
  }

  // ── internals ────────────────────────────────────────────────────────────
  #decryptSeedFromVault(vaultId: string): Bytes {
    const blob = this.store.readJson<KeystoreBlob>(this.#blobPath("vaults", vaultId));
    if (!blob) throw new WalletError("invalid_value", `missing vault ${vaultId}`);
    const { entropy, passphrase } = decodeVault(CryptoEnvelope.decrypt(blob, this.getPassword()));
    return Derivation.mnemonicToSeed(Derivation.entropyToMnemonic(entropy), passphrase);
  }

  #blobPath(dir: "vaults" | "keys" | "ledger", id: string): string {
    return join(this.root, dir, `${id}.json`);
  }
  #writeBlob(dir: "vaults" | "keys" | "ledger", blob: { id: string }): void {
    mkdirSync(join(this.root, dir), { recursive: true });
    this.store.writeJson(this.#blobPath(dir, blob.id), blob);
  }
  #removeBlobFiles(source: Source): void {
    const path =
      source.type === "seed" ? this.#blobPath("vaults", source.vaultId)
      : source.type === "privateKey" ? this.#blobPath("keys", source.keyId)
      : this.#blobPath("ledger", source.deviceId);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* best-effort */ }
    }
  }

  #freshId(prefix: IdPrefix, file: WalletsFile): string {
    const taken = new Set(file.wallets.flatMap((w) => [w.id, vaultOrKeyId(w.source), deviceId(w.source)]));
    for (;;) {
      const id = `${prefix}_${base32crockford.encode(randomBytes(5)).toLowerCase()}`;
      if (!taken.has(id)) return id;
    }
  }

  /** ref|label → canonical account ref (exact ref, or unique label, else hard error). */
  #toRef(file: WalletsFile, input: string): AccountRef {
    const v = input.trim();
    if (v.startsWith("wlt_")) return v;
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
function vaultOrKeyId(s: Source): string {
  return s.type === "seed" ? s.vaultId : s.type === "privateKey" ? s.keyId : "";
}
function deviceId(s: Source): string {
  return s.type === "ledger" ? s.deviceId : "";
}
function firstIndex(w: Wallet): number | null {
  return w.source.type === "privateKey" ? null : (w.source.accounts[0] ?? 0);
}
function accountRefOf(w: Wallet, index: number | null): AccountRef {
  return accountRef(w.id, index);
}

/** the single account-ref format: `wlt_x.<index>` (HD) or `wlt_k` (privateKey, index=null). */
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
function deriveSeedAddresses(seed: Bytes, index: number): { tron: string; evm: string } {
  return {
    tron: addressCodec("tron").fromPublicKey(Derivation.derive(seed, Derivation.path("tron", index)).publicKey),
    evm: addressCodec("evm").fromPublicKey(Derivation.derive(seed, Derivation.path("evm", index)).publicKey),
  };
}
function derivePrivAddresses(pk: Bytes): { tron: string; evm: string } {
  const pub = Derivation.publicKeyFromPrivate(pk);
  return { tron: addressCodec("tron").fromPublicKey(pub), evm: addressCodec("evm").fromPublicKey(pub) };
}
function findByAddress(file: WalletsFile, addr: { tron?: string; evm?: string }): AccountRef | null {
  for (const w of file.wallets) {
    for (const [key, a] of Object.entries(w.addresses)) {
      if ((addr.evm && a.evm === addr.evm) || (addr.tron && a.tron === addr.tron)) {
        return accountRefOf(w, key === "" ? null : Number(key));
      }
    }
  }
  return null;
}
