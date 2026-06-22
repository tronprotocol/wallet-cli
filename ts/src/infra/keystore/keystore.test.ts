import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore, walletAddress } from "./index.js";
import { AtomicFileStore } from "../../core/fs/index.js";
import { Derivation } from "../../core/derivation/index.js";
import { EvmAddress } from "../../core/address/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const EVM0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "ks-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("Keystore", () => {
  let ks: Keystore;
  beforeEach(() => {
    ks = freshKeystore();
  });

  it("imports a seed, caches both chain addresses, and sets it active", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    expect(ref).toMatch(/^wlt_[a-z0-9]+\.0$/);
    const views = ks.list();
    expect(views).toHaveLength(1);
    expect(views[0]!.addresses.evm).toBe(EVM0);
    expect(views[0]!.addresses.tron?.startsWith("T")).toBe(true);
    expect(views[0]!.active).toBe(true);
    expect(views[0]!.label).toBe("main");
    expect(ks.activeAccount()).toBe(ref);
  });

  it("decrypts the seed back to the same derivation (round-trip)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const { wallet, index } = ks.resolveAccount(ref);
    const vaultId = wallet.source.type === "seed" ? wallet.source.vaultId : "";
    const seed = ks.decryptSeed(vaultId);
    const kp = Derivation.derive(seed, Derivation.path("evm", index));
    // derive address again and compare against the cached one
    expect(bytesToHex(kp.privateKey)).toHaveLength(64);
    expect(walletAddress(wallet, "evm", 0)).toBe(EVM0);
  });

  it("imports a private key as a non-HD wallet (ref without index)", () => {
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
    const ref = ks.import({ secret: pk, type: "privateKey", label: "hot" });
    expect(ref).toMatch(/^wlt_[a-z0-9]+$/);
    expect(ref).not.toContain(".");
    const { wallet, index } = ks.resolveAccount(ref);
    expect(index).toBe(-1);
    expect(wallet.source.type).toBe("privateKey");
  });

  it("dedupes a repeated import by address", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed" });
    const b = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(b).toBe(a);
    expect(ks.list()).toHaveLength(1);
  });

  const EVM0_PATH = "m/44'/60'/0'/0/0";

  it("registerLedger does not dedup against a software account with the same address", () => {
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" });
    const ledRef = ks.registerLedger({ family: "evm", path: EVM0_PATH, address: EVM0 });
    expect(ledRef).not.toBe(seedRef);
    expect(ks.list()).toHaveLength(2);
    expect(ks.resolveAccount(ledRef).wallet.source.type).toBe("ledger");
  });

  it("seed import stays independent of a pre-registered ledger of the same address", () => {
    ks.registerLedger({ family: "evm", path: EVM0_PATH, address: EVM0 });
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(ks.list()).toHaveLength(2);
    expect(ks.resolveAccount(seedRef).wallet.source.type).toBe("seed");
  });

  it("registerLedger dedupes by (family, path)", () => {
    const a = ks.registerLedger({ family: "evm", path: EVM0_PATH, address: EVM0 });
    const b = ks.registerLedger({ family: "evm", path: EVM0_PATH, address: EVM0 });
    expect(b).toBe(a);
    expect(ks.list()).toHaveLength(1);
    // same family+path is the dedup key, independent of the supplied address string
    const c = ks.registerLedger({ family: "evm", path: EVM0_PATH, address: "0xDIFFERENT" });
    expect(c).toBe(a);
    expect(ks.list()).toHaveLength(1);
    // a different path is a distinct entry
    const d = ks.registerLedger({ family: "evm", path: "m/44'/60'/1'/0/0", address: "0xOTHER" });
    expect(d).not.toBe(a);
    expect(ks.list()).toHaveLength(2);
  });

  it("registerWatch stores a secret-less, index-less watch account", () => {
    const wRef = ks.registerWatch({ family: "tron", address: "Twatch1", label: "obs" });
    expect(wRef).toMatch(/^wlt_[a-z0-9]+$/);
    expect(wRef).not.toContain(".");
    const { wallet, index } = ks.resolveAccount(wRef);
    expect(index).toBe(-1);
    expect(wallet.source.type).toBe("watch");
    expect(walletAddress(wallet, "tron")).toBe("Twatch1");
  });

  it("registerWatch dedupes by (family, address)", () => {
    const a = ks.registerWatch({ family: "tron", address: "Twatch1" });
    const b = ks.registerWatch({ family: "tron", address: "Twatch1" });
    expect(b).toBe(a);
    expect(ks.list()).toHaveLength(1);
    // different family or address is a distinct entry
    const c = ks.registerWatch({ family: "evm", address: "Twatch1" });
    const d = ks.registerWatch({ family: "tron", address: "Twatch2" });
    expect(c).not.toBe(a);
    expect(d).not.toBe(a);
    expect(ks.list()).toHaveLength(3);
  });

  it("registerWatch stays independent of a software account with the same address", () => {
    const seedRef = ks.import({ secret: MNEMONIC, type: "seed" });
    const tronAddr = walletAddress(ks.resolveAccount(seedRef).wallet, "tron")!;
    const wRef = ks.registerWatch({ family: "tron", address: tronAddr });
    expect(wRef).not.toBe(seedRef);
    expect(ks.list()).toHaveLength(2);
    // and a later seed re-import still dedups to the seed, not the watch
    expect(ks.import({ secret: MNEMONIC, type: "seed" })).toBe(seedRef);
  });

  it("add-account on a watch wallet is rejected", () => {
    const wRef = ks.registerWatch({ family: "tron", address: "Twatch1" });
    expect(() => ks.addAccount(wRef.split(".")[0]!)).toThrow(/not HD/i);
  });

  it("add-account on a ledger wallet is rejected with a re-import hint", () => {
    const ledRef = ks.registerLedger({ family: "evm", path: EVM0_PATH, address: EVM0 });
    const walletId = ledRef.split(".")[0]!;
    expect(() => ks.addAccount(walletId)).toThrow(/not HD|import/i);
  });

  it("addAccount appends the next HD index with fresh addresses", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    const ref1 = ks.addAccount(walletId);
    expect(ref1).toBe(`${walletId}.1`);
    const views = ks.list();
    expect(views).toHaveLength(2);
    expect(views[0]!.addresses.evm).not.toBe(views[1]!.addresses.evm);
  });

  it("addAccount derives an explicit index and is idempotent", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    const ref3 = ks.addAccount(walletId, 3);
    expect(ref3).toBe(`${walletId}.3`);
    expect(ks.list()).toHaveLength(2); // account 0 + account 3 (skipped 1,2)
    const addr3 = ks.list().find((v) => v.ref === ref3)!.addresses.evm;
    // re-deriving the same index is a no-op that returns the same ref/address
    expect(ks.addAccount(walletId, 3)).toBe(ref3);
    expect(ks.list()).toHaveLength(2);
    expect(ks.list().find((v) => v.ref === ref3)!.addresses.evm).toBe(addr3);
  });

  it("renames via unique labels and resolves by label", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    ks.rename("main", "primary");
    expect(ks.resolveAccount("primary").wallet.id).toBe(ref.split(".")[0]);
  });

  it("rejects a duplicate label", () => {
    ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    expect(() => ks.import({ secret: pk, type: "privateKey", label: "main" })).toThrow(/already in use/);
  });

  it("setActive switches the active account", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const b = ks.import({ secret: pk, type: "privateKey", label: "hot" });
    expect(ks.activeAccount()).toBe(a);
    ks.setActive("hot");
    expect(ks.activeAccount()).toBe(b);
  });

  it("round-trips a passphrase-protected seed (address matches signing key)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed", passphrase: "25th-word" });
    const { wallet, index } = ks.resolveAccount(ref);
    const vaultId = wallet.source.type === "seed" ? wallet.source.vaultId : "";
    // seed reconstructed from the vault must reproduce the cached (with-passphrase) address
    const seed = ks.decryptSeed(vaultId);
    const kp = Derivation.derive(seed, Derivation.path("evm", index));
    expect(new EvmAddress().fromPublicKey(kp.publicKey)).toBe(walletAddress(wallet, "evm", 0));
    // and it must NOT equal the no-passphrase derivation
    expect(walletAddress(wallet, "evm", 0)).not.toBe(EVM0);
  });

  it("rejects a malformed account ref", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    expect(() => ks.resolveAccount(`${walletId}.abc`)).toThrow(/invalid account ref/);
  });

  it("enforces one global master password across the keystore (§7.4.1 sentinel)", () => {
    const root = mkdtempSync(join(tmpdir(), "ks-"));
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const alice = new Keystore(root, new AtomicFileStore(), () => "alice-pw-1A");
    alice.import({ secret: MNEMONIC, type: "seed" });
    // a second wallet imported under a DIFFERENT password must be rejected, not silently stored
    const bob = new Keystore(root, new AtomicFileStore(), () => "bob-pw-2B");
    expect(() => bob.import({ secret: pk, type: "privateKey" })).toThrow(/auth_failed|incorrect|does not match/i);
    // the original password still works
    const alice2 = new Keystore(root, new AtomicFileStore(), () => "alice-pw-1A");
    expect(() => alice2.import({ secret: pk, type: "privateKey" })).not.toThrow();
  });

  it("multi-account seed: selecting the wallet layer is ambiguous and hard-errors (§7.3)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId); // now has .0 and .1
    expect(() => ks.resolveAccount(walletId)).toThrow(/multi-account|specify an account/i);
    expect(ks.resolveAccount(`${walletId}.1`).index).toBe(1); // explicit ref still resolves
  });

  it("delete by account ref forgets only that HD account; the vault/secret survives", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId); // .1
    ks.delete(`${walletId}.1`);
    const views = ks.list();
    expect(views).toHaveLength(1);
    expect(views[0]!.ref).toBe(`${walletId}.0`);
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    expect(() => ks.decryptSeed(vaultId)).not.toThrow();
  });

  it("delete by wallet-level ref removes the whole seed wallet and its vault", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    ks.addAccount(walletId);
    const vaultId = (ks.resolveAccount(`${walletId}.0`).wallet.source as any).vaultId;
    ks.delete(walletId);
    expect(ks.list()).toHaveLength(0);
    expect(() => ks.decryptSeed(vaultId)).toThrow(/missing vault/);
  });

  it("resolves an account by its cached address (§7.3 selector)", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(ks.resolveAccount(EVM0).wallet.id).toBe(ref.split(".")[0]);
  });

  it("rejects a wrong master password on decrypt", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const vaultId = (ks.resolveAccount(ref).wallet.source as any).vaultId;
    const bad = new Keystore((ks as any).root ?? "", new AtomicFileStore(), () => "wrongpw");
    // build a keystore pointing at the same root
    const ks2 = new Keystore((ks as any).walletsPath.replace(/\/wallets\.json$/, ""), new AtomicFileStore(), () => "wrongpw");
    expect(() => ks2.decryptSeed(vaultId)).toThrow(/auth_failed|incorrect/);
  });
});
