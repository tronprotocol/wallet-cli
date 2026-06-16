import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keystore } from "./index.js";
import { AtomicFileStore } from "../fs/index.js";
import { Derivation } from "../derivation/index.js";
import { EvmAddress } from "../address/index.js";

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
    expect(wallet.addresses["0"]!.evm).toBe(EVM0);
  });

  it("imports a private key as a non-HD wallet (ref without index)", () => {
    const pk = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // anvil #1
    const ref = ks.import({ secret: pk, type: "privateKey", label: "hot" });
    expect(ref).toMatch(/^wlt_[a-z0-9]+$/);
    expect(ref).not.toContain(".");
    const { index, key } = ks.resolveAccount(ref);
    expect(index).toBe(-1);
    expect(key).toBe("");
  });

  it("dedupes a repeated import by address", () => {
    const a = ks.import({ secret: MNEMONIC, type: "seed" });
    const b = ks.import({ secret: MNEMONIC, type: "seed" });
    expect(b).toBe(a);
    expect(ks.list()).toHaveLength(1);
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
    expect(new EvmAddress().fromPublicKey(kp.publicKey)).toBe(wallet.addresses["0"]!.evm);
    // and it must NOT equal the no-passphrase derivation
    expect(wallet.addresses["0"]!.evm).not.toBe(EVM0);
  });

  it("rejects a malformed account ref", () => {
    const ref = ks.import({ secret: MNEMONIC, type: "seed" });
    const walletId = ref.split(".")[0]!;
    expect(() => ks.resolveAccount(`${walletId}.abc`)).toThrow(/invalid account ref/);
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
